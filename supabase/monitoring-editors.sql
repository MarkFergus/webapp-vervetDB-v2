-- Monitoring (Condition Check and Notes for Monitoring): editors can change
-- it too now, not just admins. It's edited in the monkey's pop-up (Edit),
-- where editors keep their monkeys up to date; the Full Profile's Edit is
-- for admins. Clearing both takes the row away, so editors can do that too.
-- Limited and maintenance accounts still can't (is_editor: editors and
-- admins only).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monitoring.sql to have been run first (it has been).

begin;

drop policy "Admins can add monitoring" on public.monitoring;
create policy "Editors can add monitoring"
    on public.monitoring for insert to authenticated
    with check ((select public.is_editor()) and updated_by = (select auth.uid()));

drop policy "Admins can change monitoring" on public.monitoring;
create policy "Editors can change monitoring"
    on public.monitoring for update to authenticated
    using ((select public.is_editor())) with check ((select public.is_editor()));

drop policy "Admins can delete monitoring" on public.monitoring;
create policy "Editors can delete monitoring"
    on public.monitoring for delete to authenticated
    using ((select public.is_editor()));

commit;

-- Check: the monitoring rules (add, change and delete: editors)
select policyname, cmd from pg_policies where tablename = 'monitoring' order by cmd;
