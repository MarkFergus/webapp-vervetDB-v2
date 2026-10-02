-- Only admins can ADD new monkeys. Other editors can still edit monkeys
-- and add / remove their photos. (Deleting was already admin-only, see
-- admins.sql.) The database enforces this, not just the website, which
-- hides "Add New Monkey" from everyone but admins.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- schema.sql already includes this; this is only for the database that was
-- set up before it.

drop policy "Editors can add monkeys" on public.monkeys;
create policy "Admins can add monkeys"
    on public.monkeys for insert to authenticated
    with check ((select public.is_admin()));

-- Check: should list "Admins can add monkeys" (INSERT), "Editors can change
-- monkeys" (UPDATE), "Admins can delete monkeys" (DELETE) and "Anyone can
-- read monkeys" (SELECT)
select policyname, cmd from pg_policies where tablename = 'monkeys' order by cmd;
