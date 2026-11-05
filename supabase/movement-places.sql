-- Movement records: where from and where to, kept as data (2026-11-05), so
-- nothing has to read the record's wording, which can be written any way.
--   move_kind                    'move' or 'home' (their home changed)
--   from_place, to_place         the place's name, as written then ("Koko A")
--   from_place_id, to_place_id   the place itself, so a later rename doesn't
--                                matter (empty: typed in under Other…, or
--                                not a place in vervetDB)
-- The move rule and the Movement form fill them in from now on, and the
-- existing records are filled in once below. The record's words don't change.
-- Safe to run more than once. The last result lists any existing records that
-- couldn't be read, for fixing by hand (ideally none).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs enclosures.sql, monkey-archive.sql and weekly-report-contents.sql first
-- (they have been).

begin;

alter table public.monkey_records
    add column if not exists move_kind text,
    add column if not exists from_place text,
    add column if not exists to_place text,
    add column if not exists from_place_id bigint references public.enclosures (id) on delete set null,
    add column if not exists to_place_id bigint references public.enclosures (id) on delete set null;
alter table public.monkey_records drop constraint if exists monkey_records_move_kind_check;
alter table public.monkey_records
    add constraint monkey_records_move_kind_check check (move_kind is null or move_kind in ('move', 'home'));

-- (the form can say where from and to; the ids are worked out here)
grant insert (from_place, to_place, move_kind), update (from_place, to_place, move_kind)
    on public.monkey_records to authenticated;

------------------------------------------------------------------------
-- A place's name as records write it ("Koko A", "Holt & Barrington C1",
-- "Gismo Troop", "Sickbay") → the place, or null
------------------------------------------------------------------------
create or replace function private.find_place(place text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select e.id
    from public.enclosures e
    where case
        -- (a troop: the enclosure it lives in, by its link rather than its name)
        when place like '% Troop' then e.id in (
            select t.enclosure_id from public.troops t
            where private.full_place(t.name) = left(place, -length(' Troop'))
        )
        else e.type <> 'troop' and private.full_place(e.name) = place
    end
    -- (Sickbay and Quarantine: the area, not the care unit around it)
    order by case e.type when 'area' then 0 when 'introcage' then 1 else 2 end, e.id
    limit 1
$$;

------------------------------------------------------------------------
-- Whenever a Movement record says where from and to: find the places
------------------------------------------------------------------------
create or replace function private.movement_place_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.category <> 'movement' then
        new.move_kind := null;
        new.from_place := null;
        new.to_place := null;
    end if;
    new.from_place_id := private.find_place(new.from_place);
    new.to_place_id := private.find_place(new.to_place);
    return new;
end;
$$;

drop trigger if exists monkey_records_place_ids on public.monkey_records;
create trigger monkey_records_place_ids
    before insert or update of category, from_place, to_place on public.monkey_records
    for each row execute function private.movement_place_ids();

------------------------------------------------------------------------
-- The move rule: as it was, and now saying where from and to
------------------------------------------------------------------------
create or replace function private.record_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    -- where it is (Sickbay, the introcage it's staying in, or home)...
    was     text := private.place_text(old.in_sickbay, old.stay_introcage_id, old.introcage_id, old.troop_id);
    is_at   text := private.place_text(new.in_sickbay, new.stay_introcage_id, new.introcage_id, new.troop_id);
    -- ...and its home
    home_was text := private.place_text(false, null, old.introcage_id, old.troop_id);
    home_is  text := private.place_text(false, null, new.introcage_id, new.troop_id);
    words   text;
    kind    text;
    came_from text;
    went_to text;
begin
    if new.status is distinct from old.status then
        -- (a status change: its Status record says it all)
        null;
    elsif was is distinct from is_at then
        words := 'Moved from ' || coalesce(was, 'unknown') || ' to ' || coalesce(is_at, 'unknown');
        kind := 'move';
        came_from := was;
        went_to := is_at;
    elsif home_was is distinct from home_is then
        -- a new home while it's away (in Sickbay or staying in an
        -- introcage): it goes there when it returns
        words := 'Home changed from ' || coalesce(home_was, 'unknown') || ' to ' || coalesce(home_is, 'unknown');
        kind := 'home';
        came_from := home_was;
        went_to := home_is;
    end if;
    if words is not null then
        if nullif(btrim(new.move_reason), '') is not null then
            words := words || ': ' || btrim(new.move_reason);
        end if;
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name,
             move_kind, from_place, to_place)
        values
            (new.id, 'rehabilitation', coalesce(new.moved_on, current_date), 'movement',
             btrim(left(words, 1000)), auth.uid(), public.my_name(),
             kind, came_from, went_to);
    end if;
    -- (passed through only: never kept on the monkey)
    new.moved_on := null;
    new.move_reason := null;
    return new;
end;
$$;

revoke all on function private.find_place(text), private.movement_place_ids()
    from public, anon, authenticated;

------------------------------------------------------------------------
-- The existing records, once. (Triggers off for this: it isn't anyone's
-- change, so it stays out of Staff Activity and the daily summary.)
------------------------------------------------------------------------
alter table public.monkey_records disable trigger user;

update public.monkey_records r
set move_kind = case when p.m[1] = 'Moved' then 'move' else 'home' end,
    from_place = nullif(p.m[2], 'unknown'),
    to_place = nullif(p.m[3], 'unknown'),
    from_place_id = private.find_place(nullif(p.m[2], 'unknown')),
    to_place_id = private.find_place(nullif(p.m[3], 'unknown'))
from (
    select id, regexp_match(details, '^(Moved|Home changed|Home location changed) from (.+?) to (.+?)(?:: .*)?$') as m
    from public.monkey_records
    where category = 'movement' and move_kind is null
) p
where r.id = p.id and p.m is not null;

alter table public.monkey_records enable trigger user;

commit;

-- Check: Movement records not fully linked to places. Each row: read it, and
-- tell Claude what it should say (none: all done).
select r.id, m.name, r.record_date, r.details, r.from_place, r.to_place
from public.monkey_records r
join public.monkeys m on m.id = r.monkey_id
where r.category = 'movement' and (r.from_place_id is null or r.to_place_id is null)
order by r.record_date, r.id;
