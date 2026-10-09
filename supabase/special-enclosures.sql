-- Special enclosures: enclosures that aren't a troop's home. They're listed
-- and shown like the troop enclosures, with their cages as introcages:
--   Bachelor Block (Top section): Bachelor Block A, B (side by side, joined)
--   Quarantine (Sickbay section): Quarantine A–F
-- A hidden "special" flag tells the website which ones they are (no troop,
-- so no troop numbers or rankings on their pages, and no Size).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs enclosures.sql to have been run first.
--
-- (Run after enclosure-history.sql, the new enclosures and cages show as
-- "Added" in the next daily summary email.)

begin;

-- The flag: false for every enclosure so far
alter table public.enclosures
    add column if not exists special boolean not null default false;

-- The two special enclosures, after the troop enclosures in their sections
insert into public.enclosures (name, type, section_id, sort_order, special)
select v.name, 'troop', s.id, v.sort_order, true
from (values
    ('Bachelor Block', 'Top', 100),
    ('Quarantine', 'Sickbay', 101)
) as v (name, section, sort_order)
join public.sections s on s.name = v.section;

-- Their cages, named "<enclosure> <code>", in order
insert into public.enclosures (name, type, parent_id, sort_order)
select p.name || ' ' || code.value, 'introcage', p.id, code.ordinality
from (values
    ('Bachelor Block', array['A', 'B']),
    ('Quarantine',     array['A', 'B', 'C', 'D', 'E', 'F'])
) as v (parent, codes)
join public.enclosures p on p.name = v.parent and p.type = 'troop'
cross join lateral unnest(v.codes) with ordinality as code (value, ordinality);

commit;

-- Check: the two special enclosures and their cages
select p.name as enclosure, s.name as section, p.special, string_agg(c.name, ', ' order by c.sort_order) as cages
from public.enclosures p
join public.sections s on s.id = p.section_id
left join public.enclosures c on c.parent_id = p.id
where p.special
group by p.name, s.name, p.special, p.sort_order
order by p.sort_order;
