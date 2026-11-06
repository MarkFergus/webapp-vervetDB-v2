-- Offline Mode: entries made with no signal are queued on the phone and sent
-- later (src/outbox.js). Each carries a code made on the phone (client_ref),
-- so if the signal drops just after one is saved and the phone sends it again,
-- the database refuses the repeat rather than saving it twice.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm. Existing records aren't changed.

begin;

alter table public.monitoring_sessions add column if not exists client_ref uuid unique;
alter table public.injuries            add column if not exists client_ref uuid unique;
alter table public.injury_updates      add column if not exists client_ref uuid unique;
alter table public.monkey_conditions   add column if not exists client_ref uuid unique;

grant select (client_ref), insert (client_ref) on public.monitoring_sessions to authenticated;
grant select (client_ref), insert (client_ref) on public.injuries            to authenticated;
grant select (client_ref), insert (client_ref) on public.injury_updates      to authenticated;
grant select (client_ref), insert (client_ref) on public.monkey_conditions   to authenticated;

commit;

-- Check: should say 4
select count(*) as tables_ready
from information_schema.columns
where table_schema = 'public'
  and column_name = 'client_ref'
  and table_name in ('monitoring_sessions', 'injuries', 'injury_updates', 'monkey_conditions');
