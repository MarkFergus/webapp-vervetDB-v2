-- Integration statuses: Active, On Hold, Completed, Cancelled (Status Update
-- in Records → Integration → Current Integrations).
-- ONLY needed if integrations.sql was run before 2026-10-28's Status Update
-- (integrations.sql has all of this now; running this again is harmless).
--   On Hold     still going on: stays in Current Integrations
--   Completed / Cancelled   ended (ended_on: that day); leaves the list
-- status_on: the day of its latest Status Update (asked for in the pop-up).
-- Any editor or admin can change the status (before: admins or the starter).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.

begin;

alter table public.integrations add column if not exists status_on date;
grant update (status_on) on public.integrations to authenticated;

alter table public.integrations drop constraint if exists integrations_status_check;
alter table public.integrations add constraint integrations_status_check
    check (status in ('active', 'on_hold', 'completed', 'cancelled'));

-- One going on (active or on hold) per monkey
drop index if exists public.integrations_one_active;
create unique index integrations_one_active
    on public.integrations (monkey_id) where status in ('active', 'on_hold');

drop policy if exists "Admins or the starter can change integrations" on public.integrations;
drop policy if exists "Editors can change integrations" on public.integrations;
create policy "Editors can change integrations"
    on public.integrations for update to authenticated
    using ((select public.is_editor()))
    with check ((select public.is_editor()));

commit;

-- Check: the four statuses, and the new column (each should list one row)
select pg_get_constraintdef(oid) from pg_constraint where conname = 'integrations_status_check';
select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'status_on';
