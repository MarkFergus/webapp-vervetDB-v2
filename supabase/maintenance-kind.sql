-- Maintenance log: each entry is Routine or Repair.
--   kind   'routine' or 'repair' (entries logged before this have none)
-- Typed in with the date and details, by whoever adds the entry.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

alter table public.maintenance
    add column kind text check (kind in ('routine', 'repair'));

-- Typed in like the date and details
grant insert (kind), update (kind) on public.maintenance to authenticated;

commit;

-- Check: the log so far (kind is empty on the older entries)
select id, done_on, kind, details from public.maintenance order by done_on desc;
