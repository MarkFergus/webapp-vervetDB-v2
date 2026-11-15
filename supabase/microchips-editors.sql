-- Records → Meds & Sickbay → Microchips: editors can add Microchip records
-- too, as they add vet visits and vasectomies. (Adding one also adds its
-- number to the monkey's Chip: microchip-records.sql's trigger does that.)
-- Changing and deleting them stays with admins, as for every Medical record.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm.

begin;

drop policy if exists "Editors can add microchips" on public.monkey_records;
create policy "Editors can add microchips"
    on public.monkey_records for insert to authenticated
    with check (
        (select public.is_editor())
        and not (select public.is_limited())
        and section = 'medical'
        and category = 'microchip'
        and logged_by = (select auth.uid())
    );

commit;

-- Check: should say "ready"
select case when count(*) = 1 then 'ready' else 'not updated' end as microchips_editors
from pg_policies
where schemaname = 'public' and tablename = 'monkey_records' and policyname = 'Editors can add microchips';
