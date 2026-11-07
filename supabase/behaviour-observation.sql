-- Behaviour and Observation: two clear names, one in each section.
--   Rehabilitation  Behaviour (new): admins add it, in the Full Profile
--   Medical         Observation: general notes and sightings. Editors add it
--                   with Quick Actions, as they did in Rehabilitation.
-- Existing Rehabilitation Observations move to Medical (their dates, words and
-- who wrote them stay the same; not listed as changes in Staff Activity).
-- A phone that hasn't refreshed yet can still send a Rehabilitation
-- Observation: the database files it under Medical.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm.

begin;

-- The old rule first, so the moved records and Behaviour are both allowed
alter table public.monkey_records drop constraint monkey_records_category_check;

alter table public.monkey_records disable trigger user;
update public.monkey_records
set section = 'medical'
where section = 'rehabilitation' and category = 'observation';
alter table public.monkey_records enable trigger user;

alter table public.monkey_records
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'escape', 'integration', 'status', 'behaviour'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation', 'food_monitoring', 'deworming', 'microchip'))
    );

-- A phone still on the old version: filed under Medical
create or replace function private.observation_is_medical()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.category = 'observation' then
        new.section := 'medical';
    end if;
    return new;
end;
$$;
revoke all on function private.observation_is_medical() from public;

drop trigger if exists monkey_records_observation_medical on public.monkey_records;
create trigger monkey_records_observation_medical
    before insert or update of section, category on public.monkey_records
    for each row
    execute function private.observation_is_medical();

-- Editors still add Observations, now in Medical
drop policy if exists "Editors can add observations" on public.monkey_records;
create policy "Editors can add observations"
    on public.monkey_records for insert to authenticated
    with check (
        (select public.is_editor())
        and not (select public.is_limited())
        and section = 'medical'
        and category = 'observation'
        and logged_by = (select auth.uid())
    );

commit;

-- Check: rehab_observations should say 0, and ready should say ready
select
    (select count(*) from public.monkey_records where section = 'rehabilitation' and category = 'observation') as rehab_observations,
    (select count(*) from public.monkey_records where section = 'medical' and category = 'observation') as medical_observations,
    case when pg_get_constraintdef(c.oid) like '%behaviour%' then 'ready' else 'not updated' end as ready
from pg_constraint c
where c.conname = 'monkey_records_category_check';
