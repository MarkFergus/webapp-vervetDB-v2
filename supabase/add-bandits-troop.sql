-- Adds the Bandits: the sanctuary's wild troop. They're their own "section"
-- in the Filters panel (src/sections.js) and sit out of the Monkey Guesser
-- game for now (NOT_IN_GAME in src/gameLogic.js).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- It goes last in the troop lists. Running it twice does nothing the second
-- time.

insert into public.troops (name, sort_order)
select 'Bandits', coalesce(max(sort_order), 0) + 1
from public.troops
where not exists (select 1 from public.troops where name = 'Bandits');

-- Check: the troops in order, with Bandits at the end
select name, sort_order from public.troops order by sort_order;
