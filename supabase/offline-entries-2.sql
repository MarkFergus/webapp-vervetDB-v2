-- Offline Mode, the rest of the daily entries: Mark As Seen, Observations and
-- Maintenance reports get the same code from the phone as Monitoring
-- (offline-entries.sql), so an entry sent twice is only saved once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm. Existing records aren't changed.

begin;

alter table public.monkey_sightings add column if not exists client_ref uuid unique;
alter table public.monkey_records   add column if not exists client_ref uuid unique;
alter table public.maintenance      add column if not exists client_ref uuid unique;

grant select (client_ref), insert (client_ref) on public.monkey_sightings to authenticated;
grant select (client_ref), insert (client_ref) on public.monkey_records   to authenticated;
grant select (client_ref), insert (client_ref) on public.maintenance      to authenticated;

commit;

-- Check: should say 3
select count(*) as tables_ready
from information_schema.columns
where table_schema = 'public'
  and column_name = 'client_ref'
  and table_name in ('monkey_sightings', 'monkey_records', 'maintenance');
