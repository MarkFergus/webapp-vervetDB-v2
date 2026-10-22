-- Movement records: every time a monkey moves, a Movement record is added
-- to its Rehabilitation records (monkey_records) by the database itself,
-- so a move can't be saved without one. A move is any change of where it
-- is: Move to Sickbay, Move to Introcage and Return (Quick Actions), or a
-- new home chosen in Edit.
--   "Moved from Gismo Troop to Gismo A: integration with Poppy"
-- The website sends the move's date and reason along with the move:
--   moved_on      the day it moved (none sent: today)
--   move_reason   why (optional, up to 300 characters)
-- They're only passed through: the record keeps them, and they're emptied
-- again before the monkey is saved, so they never stay on the monkey.
-- Where it is: Sickbay, else the introcage it's staying in, else its home
-- (its introcage, or its troop). A new home while it's in Sickbay (or
-- staying in an introcage) is recorded as "Home changed from … to …", and
-- its actual move when it returns ("Moved from Sickbay to …").
-- The record is in the name of whoever made the move.
-- Movement records are a log of what happened: nobody can change them, and
-- only admins can delete one (a wrong one: delete it, then add the right
-- one by hand). Other records stay as they were (admins or the writer).
-- Moves made before this file are copied in from the change history
-- (private.monkey_changes), except any whose reason mentions "test" (and
-- the return from such a move).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monkey-records.sql and introcage-stays.sql to have been run first
-- (they have been).

begin;

alter table public.monkeys
    add column moved_on date,
    add column move_reason text
        constraint monkeys_move_reason_check check (char_length(move_reason) <= 300);

------------------------------------------------------------------------
-- Where a monkey is, in words: "Sickbay", "Holt & Barrington C1",
-- "Gismo Troop"
------------------------------------------------------------------------
create or replace function private.place_text(
    in_sickbay boolean, stay_introcage_id bigint, introcage_id bigint, troop_id bigint
)
returns text
language sql
stable
set search_path = ''
as $$
    select regexp_replace(regexp_replace(
        case
            when in_sickbay then 'Sickbay'
            when stay_introcage_id is not null then (select e.name from public.enclosures e where e.id = stay_introcage_id)
            when introcage_id is not null then (select e.name from public.enclosures e where e.id = introcage_id)
            else (select t.name || ' Troop' from public.troops t where t.id = troop_id)
        end,
        -- (the full names, as the website shows them)
        '^H&B', 'Holt & Barrington'), '^D&D', 'Dino & Daniel')
$$;

------------------------------------------------------------------------
-- A move: its Movement record
------------------------------------------------------------------------
-- security definer: adds the record on the mover's behalf (in their name)
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
begin
    if was is distinct from is_at then
        words := 'Moved from ' || coalesce(was, 'unknown') || ' to ' || coalesce(is_at, 'unknown');
    elsif home_was is distinct from home_is then
        -- a new home while it's away (in Sickbay or staying in an
        -- introcage): it goes there when it returns
        words := 'Home changed from ' || coalesce(home_was, 'unknown') || ' to ' || coalesce(home_is, 'unknown');
    end if;
    if words is not null then
        if nullif(btrim(new.move_reason), '') is not null then
            words := words || ': ' || btrim(new.move_reason);
        end if;
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
        values
            (new.id, 'rehabilitation', coalesce(new.moved_on, current_date), 'movement',
             btrim(left(words, 1000)), auth.uid(), public.my_name());
    end if;
    -- (passed through only: never kept on the monkey)
    new.moved_on := null;
    new.move_reason := null;
    return new;
end;
$$;

create trigger monkeys_record_move
    before update on public.monkeys
    for each row execute function private.record_move();

------------------------------------------------------------------------
-- Movement records: never changed; deleted by admins only
------------------------------------------------------------------------
drop policy "Admins or the writer can change monkey records" on public.monkey_records;
create policy "Admins or the writer change records (not movements)"
    on public.monkey_records for update to authenticated
    using ((select public.can_log_maintenance()) and category <> 'movement'
           and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and category <> 'movement'
                and ((select public.is_admin()) or logged_by = (select auth.uid())));

drop policy "Admins or the writer can delete monkey records" on public.monkey_records;
create policy "Admins, or the writer (not movements), delete records"
    on public.monkey_records for delete to authenticated
    using ((select public.can_log_maintenance())
           and ((select public.is_admin()) or (logged_by = (select auth.uid()) and category <> 'movement')));

------------------------------------------------------------------------
-- The moves made so far: copied in from the change history, oldest first.
-- Its date: the date given with the move (Sickbay's or the stay's), else
-- the day it was saved (South African time). Left out: a move whose
-- reason (or the reason of the move it returns from) mentions "test".
------------------------------------------------------------------------
insert into public.monkey_records
    (monkey_id, section, record_date, category, details, logged_by, logged_by_name, logged_at)
select
    c.monkey_id,
    'rehabilitation',
    coalesce(
        case
            when coalesce((c.new_row ->> 'in_sickbay')::boolean, false) then (c.new_row ->> 'sickbay_since')::date
            when c.new_row ->> 'stay_introcage_id' is not null then (c.new_row ->> 'stay_since')::date
        end,
        (c.changed_at at time zone 'Africa/Johannesburg')::date
    ),
    'movement',
    btrim(left('Moved from ' || coalesce(x.was, 'unknown') || ' to ' || coalesce(x.is_at, 'unknown')
               || coalesce(': ' || nullif(btrim(x.reason), ''), ''), 1000)),
    c.changed_by,
    coalesce(c.changed_by_name, p.full_name, split_part(c.changed_by_email, '@', 1)),
    c.changed_at
from private.monkey_changes c
cross join lateral (
    select
        private.place_text(coalesce((c.old_row ->> 'in_sickbay')::boolean, false),
                           (c.old_row ->> 'stay_introcage_id')::bigint,
                           (c.old_row ->> 'introcage_id')::bigint,
                           (c.old_row ->> 'troop_id')::bigint) as was,
        private.place_text(coalesce((c.new_row ->> 'in_sickbay')::boolean, false),
                           (c.new_row ->> 'stay_introcage_id')::bigint,
                           (c.new_row ->> 'introcage_id')::bigint,
                           (c.new_row ->> 'troop_id')::bigint) as is_at,
        -- the reason given for going (Sickbay's note, or the stay's)
        case
            when coalesce((c.new_row ->> 'in_sickbay')::boolean, false) then c.new_row ->> 'sickbay_note'
            when c.new_row ->> 'stay_introcage_id' is not null then c.new_row ->> 'stay_note'
        end as reason,
        -- every note on both sides (for "test")
        concat_ws(' ', c.old_row ->> 'sickbay_note', c.old_row ->> 'stay_note',
                       c.new_row ->> 'sickbay_note', c.new_row ->> 'stay_note') as notes
) x
left join public.profiles p on p.user_id = c.changed_by
where c.action = 'changed'
  and x.was is distinct from x.is_at
  and x.notes !~* '\mtest'
  -- (still on file: not deleted since)
  and exists (select 1 from public.monkeys m where m.id = c.monkey_id)
order by c.changed_at, c.id;

commit;

-- Check: the moves copied in (one row per move; none if no monkey has
-- moved yet)
select m.name, r.record_date, r.details, r.logged_by_name
from public.monkey_records r join public.monkeys m on m.id = r.monkey_id
where r.category = 'movement'
order by r.record_date, r.id;
