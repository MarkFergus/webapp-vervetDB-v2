-- Observation (the monkey pop-up's Quick Actions, 2026-11-03): editors can
-- add a quick Observation to a monkey's Rehabilitation records ("Seen
-- eating and moving around ok"), e.g. after checking on an old monkey.
-- The website also saves it as a sighting (as Mark As Seen), so it counts
-- as seen that day. Adding any other record stays admins only.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Safe to run more than once.

drop policy if exists "Editors can add observations" on public.monkey_records;
create policy "Editors can add observations"
    on public.monkey_records for insert to authenticated
    with check (
        (select public.is_editor())
        and not (select public.is_limited())
        and section = 'rehabilitation'
        and category = 'observation'
        and logged_by = (select auth.uid())
    );

-- Check: should say 1
select count(*) as observation_policy from pg_policies
where tablename = 'monkey_records' and policyname = 'Editors can add observations';
