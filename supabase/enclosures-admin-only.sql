-- Changing an enclosure's or introcage's details (About, Features, Size,
-- Established) becomes admins only, for now. Other editors can still add
-- to the maintenance log. (enclosures.sql already includes this; this is
-- for the database set up before.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

drop policy if exists "Editors can change enclosures" on public.enclosures;
drop policy if exists "Admins can change enclosures" on public.enclosures;
create policy "Admins can change enclosures"
    on public.enclosures for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));

-- Check: should list "Admins can change enclosures" (UPDATE), plus add and
-- delete (admins) and read (anyone)
select policyname, cmd from pg_policies where tablename = 'enclosures' order by cmd;
