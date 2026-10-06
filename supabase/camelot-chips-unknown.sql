-- Camelot's blank chips become "Unknown" (null): their records weren't
-- kept well, so blank there doesn't mean "no chip". Blank chips in every
-- other troop stay "No Chip". Needs chip-unknown.sql run first.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- 42 monkeys on 2026-10-06. Running it twice does nothing the second time.
-- Each change is listed in Recent changes as "Chip: No Chip → Unknown".

update public.monkeys
set chip = null
where chip = ''
  and troop_id = (select id from public.troops where name = 'Camelot');

-- Check: Camelot should now show unknown = 42, no_chip = 0
select
    count(*) filter (where chip <> '') as chipped,
    count(*) filter (where chip = '') as no_chip,
    count(*) filter (where chip is null) as unknown
from public.monkeys
where troop_id = (select id from public.troops where name = 'Camelot');
