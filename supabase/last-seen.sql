-- Last Seen from any record that shows a monkey was seen (2026-11-08).
-- Saving one of these notes a sighting on its date, so it counts as the
-- monkey's last seen (clearing Not Seen Last Session and Must See, like
-- Mark As Seen), wherever it was entered from: the pop-up, Records, a
-- Monitoring session, a deworming sheet, or a phone sending it later:
--   Medical         Observation, Injury, Condition, Deworming, Microchip,
--                   Food Monitoring, Medicine, Treatment, Vet Visit
--   Rehabilitation  Behaviour, Movement, Escape, Trapped (new)
--   Injuries        a new injury, and each update
--   Conditions      each one
--   Deworming       a dose taken (full, 3/4, 1/2 or 1/4; not None or Skipped)
-- (Status, Arrival and Integration don't count.) Each sighting remembers what
-- it came from ("Dewormed"), and goes again if that record is deleted (or
-- moved to another day). These sightings aren't listed in Staff Activity:
-- the record itself is.
-- Also: Trapped, a new Rehabilitation category (trapped where they are,
-- e.g. to check a chip, without going to Sickbay).
-- Existing records are caught up too.
-- Safe to run more than once.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monkey-sightings.sql, behaviour-observation.sql, deworming-results.sql
-- and microchip-records.sql first (they have been).

begin;

------------------------------------------------------------------------
-- Trapped: a new Rehabilitation category
------------------------------------------------------------------------
alter table public.monkey_records drop constraint if exists monkey_records_category_check;
alter table public.monkey_records
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'escape', 'integration', 'status', 'behaviour', 'trapped'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation', 'food_monitoring', 'deworming', 'microchip'))
    );

------------------------------------------------------------------------
-- What a sighting came from
------------------------------------------------------------------------
-- source: the kind of record ('dewormed', 'observation'…; null: Mark As Seen)
-- source_key: that record ('monkey_records:12', 'deworming_doses:40:2')
alter table public.monkey_sightings
    add column if not exists source text,
    add column if not exists source_key text;
create unique index if not exists monkey_sightings_source_key_idx
    on public.monkey_sightings (source_key) where source_key is not null;

-- Staff Activity: only the sightings people add (Mark As Seen)
drop trigger if exists monkey_sightings_record_change on public.monkey_sightings;
drop trigger if exists monkey_sightings_record_change_del on public.monkey_sightings;
create trigger monkey_sightings_record_change
    after insert or update on public.monkey_sightings
    for each row when (new.source is null)
    execute function private.record_change();
create trigger monkey_sightings_record_change_del
    after delete on public.monkey_sightings
    for each row when (old.source is null)
    execute function private.record_change();

-- Notes (or moves, or removes) one record's sighting
--   seen_on null: the record doesn't count (any sighting it had goes)
create or replace function private.note_sighting(
    key text, monkey bigint, seen_on date, kind text, by_id uuid, by_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if seen_on is null or monkey is null then
        delete from public.monkey_sightings where source_key = key;
        return;
    end if;
    -- (never in the future)
    seen_on := least(seen_on, (now() at time zone 'Africa/Johannesburg')::date);
    insert into public.monkey_sightings (monkey_id, seen_on, source, source_key, logged_by, logged_by_name)
    values (monkey, seen_on, kind, key, by_id, by_name)
    on conflict (source_key) where source_key is not null
    do update set monkey_id = excluded.monkey_id, seen_on = excluded.seen_on, source = excluded.source;
end;
$$;
revoke all on function private.note_sighting(text, bigint, date, text, uuid, text) from public, anon, authenticated;

-- The records that count, by category
create or replace function private.seen_kind(category text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case category
        when 'deworming' then 'dewormed'
        when 'observation' then 'observation'
        when 'injury' then 'injury'
        when 'microchip' then 'microchip'
        when 'food_monitoring' then 'food_monitoring'
        when 'medicine' then 'medicine'
        when 'treatment' then 'treatment'
        when 'vet_visit' then 'vet_visit'
        when 'behaviour' then 'behaviour'
        when 'movement' then 'movement'
        when 'escape' then 'escape'
        when 'trapped' then 'trapped'
    end
$$;

------------------------------------------------------------------------
-- The triggers
------------------------------------------------------------------------
create or replace function private.seen_from_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        perform private.note_sighting('monkey_records:' || old.id, null, null, null, null, null);
        return null;
    end if;
    perform private.note_sighting('monkey_records:' || new.id, new.monkey_id,
        case when private.seen_kind(new.category) is not null then new.record_date end,
        private.seen_kind(new.category), new.logged_by, new.logged_by_name);
    return null;
end;
$$;

create or replace function private.seen_from_injury()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        perform private.note_sighting('injuries:' || old.id, null, null, null, null, null);
        return null;
    end if;
    perform private.note_sighting('injuries:' || new.id, new.monkey_id, new.injury_date, 'injury', new.logged_by, new.logged_by_name);
    return null;
end;
$$;

create or replace function private.seen_from_injury_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        perform private.note_sighting('injury_updates:' || old.id, null, null, null, null, null);
        return null;
    end if;
    perform private.note_sighting('injury_updates:' || new.id,
        (select i.monkey_id from public.injuries i where i.id = new.injury_id),
        new.update_date, 'injury_update', new.logged_by, new.logged_by_name);
    return null;
end;
$$;

create or replace function private.seen_from_condition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        perform private.note_sighting('monkey_conditions:' || old.id, null, null, null, null, null);
        return null;
    end if;
    perform private.note_sighting('monkey_conditions:' || new.id, new.monkey_id, new.condition_date, 'condition',
        new.logged_by, new.logged_by_name);
    return null;
end;
$$;

-- A dose taken: that day of the sheet (from the day it really started)
create or replace function private.seen_from_dose()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    l record;
begin
    if tg_op = 'DELETE' then
        perform private.note_sighting('deworming_doses:' || old.line_id || ':' || old.day, null, null, null, null, null);
        return null;
    end if;
    select dl.monkey_id, coalesce(s.started_on, s.start_date) + (new.day - 1) as seen_on
    into l
    from public.deworming_lines dl
    join public.deworming_sheets s on s.id = dl.sheet_id
    where dl.id = new.line_id;
    perform private.note_sighting('deworming_doses:' || new.line_id || ':' || new.day, l.monkey_id,
        case when new.result in ('full', '3/4', '1/2', '1/4') then l.seen_on end,
        'dewormed', auth.uid(), public.my_name());
    return null;
end;
$$;

revoke all on function private.seen_from_record() from public, anon, authenticated;
revoke all on function private.seen_from_injury() from public, anon, authenticated;
revoke all on function private.seen_from_injury_update() from public, anon, authenticated;
revoke all on function private.seen_from_condition() from public, anon, authenticated;
revoke all on function private.seen_from_dose() from public, anon, authenticated;

drop trigger if exists monkey_records_seen on public.monkey_records;
create trigger monkey_records_seen
    after insert or update or delete on public.monkey_records
    for each row execute function private.seen_from_record();

drop trigger if exists injuries_seen on public.injuries;
create trigger injuries_seen
    after insert or update of monkey_id, injury_date or delete on public.injuries
    for each row execute function private.seen_from_injury();

drop trigger if exists injury_updates_seen on public.injury_updates;
create trigger injury_updates_seen
    after insert or update or delete on public.injury_updates
    for each row execute function private.seen_from_injury_update();

drop trigger if exists monkey_conditions_seen on public.monkey_conditions;
create trigger monkey_conditions_seen
    after insert or update or delete on public.monkey_conditions
    for each row execute function private.seen_from_condition();

drop trigger if exists deworming_doses_seen on public.deworming_doses;
create trigger deworming_doses_seen
    after insert or update or delete on public.deworming_doses
    for each row execute function private.seen_from_dose();

------------------------------------------------------------------------
-- Catching up: the records already saved
------------------------------------------------------------------------
select private.note_sighting('monkey_records:' || r.id, r.monkey_id, r.record_date, private.seen_kind(r.category),
    r.logged_by, r.logged_by_name)
from public.monkey_records r
where private.seen_kind(r.category) is not null;

select private.note_sighting('injuries:' || i.id, i.monkey_id, i.injury_date, 'injury', i.logged_by, i.logged_by_name)
from public.injuries i;

select private.note_sighting('injury_updates:' || u.id, i.monkey_id, u.update_date, 'injury_update', u.logged_by, u.logged_by_name)
from public.injury_updates u
join public.injuries i on i.id = u.injury_id;

select private.note_sighting('monkey_conditions:' || c.id, c.monkey_id, c.condition_date, 'condition', c.logged_by, c.logged_by_name)
from public.monkey_conditions c;

select private.note_sighting('deworming_doses:' || d.line_id || ':' || d.day, dl.monkey_id,
    coalesce(s.started_on, s.start_date) + (d.day - 1), 'dewormed', s.submitted_by, coalesce(s.submitted_by_name, s.prepared_by_name))
from public.deworming_doses d
join public.deworming_lines dl on dl.id = d.line_id
join public.deworming_sheets s on s.id = dl.sheet_id
where d.result in ('full', '3/4', '1/2', '1/4');

commit;

-- Check: the sightings noted from records, by kind
select source, count(*) from public.monkey_sightings where source is not null group by source order by source;
