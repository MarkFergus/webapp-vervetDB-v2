-- The Monkey Archive: monkeys no longer at the sanctuary. Besides Released
-- (Release to Wild), a monkey's status can now be Deceased, Escaped or
-- Missing (Status Update in Quick Actions, admins only). Each one drops the
-- monkey off the current records; everything about it stays on file, and
-- admins see it in the Monkey Archive (Admin Dashboard), where they can
-- change its status again, or restore it to the sanctuary.
--   status          'sanctuary' (at the sanctuary), 'released', 'deceased',
--                   'escaped' or 'missing'
--   status_on       the date of its latest status change (Missing: the day
--                   it was last seen)
--   status_details  what happened (up to 1000 characters)
-- (released_on and release_details stay, for the releases made before this
-- file: their date and details.)
-- Every status change adds a Status record to its Rehabilitation records,
-- by the database itself (in the name of whoever made it):
--   "Status changed from Sanctuary to Deceased: found in the troop"
-- Like Movement records, nobody can change them and only admins can delete
-- one. The releases made before this file get theirs too.
-- Leaving the sanctuary ends a stay in Sickbay or an introcage (no Movement
-- record: the Status record says it all), so a restored monkey comes back
-- to its home.
-- Who can do what (the database enforces it, not just the website):
--   status changes   admins; editors only Release to Wild (from the
--                    sanctuary to released). The website changes it with
--                    public.set_monkey_status (below).
--   reading          anyone reads the monkeys at the sanctuary; only admins
--                    read the others (the Monkey Archive)
-- The change history's words: "Status: Sanctuary → Deceased".
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs released-status.sql, movement-records.sql and
-- movement-records-home.sql to have been run first (they have been).

begin;

------------------------------------------------------------------------
-- The statuses, and the latest change's date and details
------------------------------------------------------------------------
alter table public.monkeys
    drop constraint monkeys_status_check,
    add constraint monkeys_status_check
        check (status in ('sanctuary', 'released', 'deceased', 'escaped', 'missing')),
    add column status_on date,
    add column status_details text
        constraint monkeys_status_details_check check (char_length(status_details) <= 1000);

------------------------------------------------------------------------
-- Status records: a new Rehabilitation category. Like Movement records:
-- never changed, deleted by admins only
------------------------------------------------------------------------
alter table public.monkey_records
    drop constraint monkey_records_category_check,
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'observation', 'escape', 'integration', 'status'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation'))
    );

drop policy "Admins or the writer change records (not movements)" on public.monkey_records;
create policy "Admins or the writer change records (not movements or statuses)"
    on public.monkey_records for update to authenticated
    using ((select public.can_log_maintenance()) and category not in ('movement', 'status')
           and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and category not in ('movement', 'status')
                and ((select public.is_admin()) or logged_by = (select auth.uid())));

drop policy "Admins, or the writer (not movements), delete records" on public.monkey_records;
create policy "Admins, or the writer (not movements or statuses), delete records"
    on public.monkey_records for delete to authenticated
    using ((select public.can_log_maintenance())
           and ((select public.is_admin())
                or (logged_by = (select auth.uid()) and category not in ('movement', 'status'))));

------------------------------------------------------------------------
-- A status change: who may, ending a stay, and its Status record
------------------------------------------------------------------------
-- security definer: adds the record on the changer's behalf (in their name)
create or replace function private.change_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status is not distinct from old.status then
        return new;
    end if;
    -- Admins; editors only Release to Wild
    if not public.is_admin() and not (old.status = 'sanctuary' and new.status = 'released') then
        raise exception 'Only admins can change a monkey''s status' using errcode = '42501';
    end if;
    -- (no date given: today)
    new.status_on := coalesce(new.status_on, current_date);
    -- Leaving the sanctuary: a stay in Sickbay or an introcage ends
    if new.status <> 'sanctuary' then
        new.in_sickbay := false;
        new.sickbay_since := null;
        new.sickbay_note := null;
        new.stay_introcage_id := null;
        new.stay_since := null;
        new.stay_note := null;
    end if;
    insert into public.monkey_records
        (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
    values
        (new.id, 'rehabilitation', new.status_on, 'status',
         btrim(left('Status changed from ' || initcap(old.status) || ' to ' || initcap(new.status)
                    || coalesce(': ' || nullif(btrim(new.status_details), ''), ''), 1000)),
         auth.uid(), public.my_name());
    return new;
end;
$$;

-- (runs before monkeys_record_move: triggers go in name order)
create trigger monkeys_change_status
    before update on public.monkeys
    for each row execute function private.change_status();

revoke all on function private.change_status() from public, anon, authenticated;

------------------------------------------------------------------------
-- Changing a monkey's status (the website's Status Update and Release to
-- Wild). security definer: an editor who releases a monkey can't read it
-- any more (it's in the archive), which a plain update needs; the rules
-- are still the trigger's above (editors: only Release to Wild).
--   select public.set_monkey_status(12, 'deceased', '2026-10-27', 'Found in the troop');
------------------------------------------------------------------------
create or replace function public.set_monkey_status(
    monkey_id bigint, new_status text, status_on date, details text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_editor() then
        raise exception 'Only editors and admins can change a monkey''s status' using errcode = '42501';
    end if;
    if status_on is null or status_on > current_date + 1 then
        raise exception 'Please give the date (not in the future)' using errcode = '22023';
    end if;
    update public.monkeys m
    set status = new_status,
        status_on = set_monkey_status.status_on,
        status_details = nullif(btrim(details), '')
    where m.id = set_monkey_status.monkey_id;
    if not found then
        raise exception 'No such monkey' using errcode = '22023';
    end if;
end;
$$;

revoke all on function public.set_monkey_status(bigint, text, date, text) from public, anon;
grant execute on function public.set_monkey_status(bigint, text, date, text) to authenticated;

------------------------------------------------------------------------
-- Movement records: none for a status change (its stay ending, above).
-- The same rule as movement-records-home.sql otherwise.
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
begin
    if new.status is distinct from old.status then
        -- (a status change: its Status record says it all)
        null;
    elsif was is distinct from is_at then
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

------------------------------------------------------------------------
-- Reading: the monkeys at the sanctuary for anyone; the archive for admins
------------------------------------------------------------------------
drop policy "Anyone can read monkeys" on public.monkeys;
create policy "Anyone can read sanctuary monkeys, admins all"
    on public.monkeys for select
    to anon, authenticated
    using (status = 'sanctuary' or (select public.is_admin()));

------------------------------------------------------------------------
-- The history's words: "Status: Sanctuary → Deceased" (the same function
-- as mainfeed.sql: either file can run first)
------------------------------------------------------------------------
create or replace function private.field_text(r jsonb, field text)
returns text
language sql
stable
set search_path = ''
as $$
    select case
        when field = 'troop' then coalesce(
            (select e.name from public.enclosures e where e.id = (r ->> 'introcage_id')::bigint),
            (select t.name from public.troops t where t.id = (r ->> 'troop_id')::bigint)
        )
        when field = 'sex' then initcap(r ->> 'sex')
        when field = 'chip' then case
            when r is null then null
            when r -> 'chip' = 'null'::jsonb then 'Unknown'
            when r ->> 'chip' = '' then 'No Chip'
            else r ->> 'chip'
        end
        -- Status: only once released-status.sql has run (older history rows
        -- don't have it). Sanctuary, Released, and (monkey-archive.sql)
        -- Deceased, Escaped, Missing
        when field = 'status' then case
            when r is null or not (r ? 'status') then null
            else initcap(r ->> 'status')
        end
        -- In Sickbay: only once sickbay.sql has run (older history rows don't have it)
        when field = 'in_sickbay' then case
            when r is null or not (r ? 'in_sickbay') then null
            when (r ->> 'in_sickbay')::boolean then 'Yes'
            else 'No'
        end
        -- A stay: only once this file has run (older history rows don't have it)
        when field = 'stay' then case
            when r is null or not (r ? 'stay_introcage_id') then null
            when r ->> 'stay_introcage_id' is null then 'Home'
            else (select e.name from public.enclosures e where e.id = (r ->> 'stay_introcage_id')::bigint)
        end
        -- Feeding: only for a monkey in an introcage, at home or staying
        -- there (and only once feeding.sql has run: older history rows
        -- don't have it)
        when field in ('fed_by', 'am_food', 'pm_food') then (
            case
                when r is null or not (r ? 'fed_by') then null
                when not exists (
                    select 1 from public.enclosures e
                    where e.id in ((r ->> 'introcage_id')::bigint, (r ->> 'stay_introcage_id')::bigint)
                        and e.type = 'introcage'
                ) then null
                when field = 'fed_by' then
                    case r ->> 'fed_by' when 'sickbay' then 'Sickbay' else 'Mainfeed' end
                when r ->> 'fed_by' = 'sickbay' then null
                when field = 'am_food' then concat_ws(', ',
                    (r ->> 'am_plates') || case when r ->> 'am_plates' = '1' then ' plate' else ' plates' end,
                    case
                        when (r ->> 'am_cut_small')::boolean and (r ->> 'am_fruit')::boolean then 'cut small + fruit'
                        when (r ->> 'am_cut_small')::boolean then 'cut small'
                        when (r ->> 'am_fruit')::boolean then 'add fruit'
                    end,
                    case when (r ->> 'am_metal_plate')::boolean then 'metal plate' end)
                else concat_ws(', ',
                    (r ->> 'pm_bowls') || case when r ->> 'pm_bowls' = '1' then ' bowl' else ' bowls' end,
                    case when (r ->> 'pm_cut_small')::boolean then 'cut small' end)
            end
        )
        else r ->> field
    end
$$;

------------------------------------------------------------------------
-- The releases so far: a Status record each (dated the day released, in
-- the name of whoever released it)
------------------------------------------------------------------------
insert into public.monkey_records
    (monkey_id, section, record_date, category, details, logged_by, logged_by_name, logged_at)
select
    m.id,
    'rehabilitation',
    coalesce(m.released_on, (coalesce(c.changed_at, now()) at time zone 'Africa/Johannesburg')::date),
    'status',
    btrim(left('Status changed from Sanctuary to Released'
               || coalesce(': ' || nullif(btrim(m.release_details), ''), ''), 1000)),
    c.changed_by,
    coalesce(c.changed_by_name, p.full_name, split_part(c.changed_by_email, '@', 1)),
    coalesce(c.changed_at, now())
from public.monkeys m
left join lateral (
    select ch.changed_by, ch.changed_by_name, ch.changed_by_email, ch.changed_at
    from private.monkey_changes ch
    where ch.monkey_id = m.id and ch.action = 'changed'
      and ch.new_row ->> 'status' = 'released' and ch.old_row ->> 'status' = 'sanctuary'
    order by ch.changed_at desc
    limit 1
) c on true
left join public.profiles p on p.user_id = c.changed_by
where m.status = 'released'
  and not exists (select 1 from public.monkey_records r where r.monkey_id = m.id and r.category = 'status');

commit;

-- Check: the statuses so far (Sanctuary, and any Released)
select status, count(*) from public.monkeys group by status order by status;
