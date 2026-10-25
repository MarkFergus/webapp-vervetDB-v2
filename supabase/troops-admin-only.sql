-- Adding and renaming troops (the list of troop names behind the scenes,
-- each linked to its enclosure) becomes admins only, like enclosures.
-- The app only reads troops, so nothing changes on screen: this just
-- tidies up an older rule that let editors add and rename them.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

drop policy if exists "Editors can add troops" on public.troops;
drop policy if exists "Admins can add troops" on public.troops;
create policy "Admins can add troops"
    on public.troops for insert to authenticated
    with check ((select public.is_admin()));

drop policy if exists "Editors can change troops" on public.troops;
drop policy if exists "Admins can change troops" on public.troops;
create policy "Admins can change troops"
    on public.troops for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));

commit;

-- Check: should list four rows: "Admins can delete troops" (DELETE),
-- "Admins can add troops" (INSERT), "Anyone can read troops" (SELECT) and
-- "Admins can change troops" (UPDATE)
select policyname, cmd from pg_policies where tablename = 'troops' order by cmd;
