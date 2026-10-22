-- The maintenance log: everyone with a role (maintenance staff, editors,
-- admins) can add entries, and change or delete their OWN; admins can
-- change or delete anyone's. (Before: anyone with a role could change any
-- entry, and only admins could delete.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

drop policy "Staff can change maintenance" on public.maintenance;
create policy "Admins or the writer can change maintenance"
    on public.maintenance for update to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

drop policy "Admins can delete maintenance" on public.maintenance;
create policy "Admins or the writer can delete maintenance"
    on public.maintenance for delete to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

commit;

-- Check: the log's rules (Anyone can read, Staff can add, and the two above)
select policyname from pg_policies where tablename = 'maintenance' order by policyname;
