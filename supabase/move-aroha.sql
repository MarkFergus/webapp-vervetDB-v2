-- Moves Aroha from the H&B troop into the H&B C1 introcage: the first
-- introcage monkey. Run ONLY together with the vervetDB version that knows
-- about introcages (1.2.0): the older site expects every monkey to have a
-- troop. Needs enclosures.sql run first.
-- (Later, moves like this are done in the app with the Location field.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

update public.monkeys
set troop_id = null,
    introcage_id = (select id from public.enclosures where name = 'H&B C1')
where name = 'Aroha'
  and troop_id = (select id from public.troops where name = 'H&B');

-- Check: Aroha, no troop, in H&B C1
select m.name, t.name as troop, e.name as introcage
from public.monkeys m
left join public.troops t on t.id = m.troop_id
left join public.enclosures e on e.id = m.introcage_id
where m.name = 'Aroha';
