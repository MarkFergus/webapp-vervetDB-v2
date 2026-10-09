-- Care areas for new intakes: Baby Care, Quarantine and Sickbay Care Unit.
-- Special enclosures (no troop) that aren't in a section, so each is a
-- "section" of its own, listed after Sickbay:
--   Baby Care           areas Dreamland, Neverland, Disneyland (orphans in
--                       human care)
--   Quarantine          cages Quarantine A–F (already there: moved out of
--                       the Sickbay section)
--   Sickbay Care Unit   one area, also called Sickbay Care Unit (injured
--                       rescues)
-- An enclosure and its area can now share a name (names only need to be
-- different among the enclosures, and among the introcages / areas).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs special-enclosures.sql to have been run first.

begin;

-- Names: unique among enclosures, and among introcages / areas, so Sickbay
-- Care Unit's one area can have its name
alter table public.enclosures drop constraint enclosures_name_key;
alter table public.enclosures add constraint enclosures_name_type_key unique (name, type);

-- Their "sections", after Sickbay
insert into public.sections (name, sort_order) values
    ('Baby Care', 5), ('Quarantine', 6), ('Sickbay Care Unit', 7);

-- Quarantine: into its own
update public.enclosures
set section_id = (select id from public.sections where name = 'Quarantine')
where name = 'Quarantine' and type = 'troop';

-- The two new special enclosures, each in its own "section"
insert into public.enclosures (name, type, section_id, sort_order, special)
select s.name, 'troop', s.id, v.sort_order, true
from (values ('Baby Care', 102), ('Sickbay Care Unit', 103)) as v (name, sort_order)
join public.sections s on s.name = v.name;

-- Their areas, in order
insert into public.enclosures (name, type, parent_id, sort_order)
select area.value, 'introcage', p.id, area.ordinality
from (values
    ('Baby Care',         array['Dreamland', 'Neverland', 'Disneyland']),
    ('Sickbay Care Unit', array['Sickbay Care Unit'])
) as v (parent, areas)
join public.enclosures p on p.name = v.parent and p.type = 'troop'
cross join lateral unnest(v.areas) with ordinality as area (value, ordinality);

commit;

-- Check: the care areas, their sections and their areas (3 rows)
select p.name as enclosure, s.name as section, p.special, string_agg(c.name, ', ' order by c.sort_order) as areas
from public.enclosures p
join public.sections s on s.id = p.section_id
left join public.enclosures c on c.parent_id = p.id
where p.name in ('Baby Care', 'Quarantine', 'Sickbay Care Unit') and p.type = 'troop'
group by p.name, s.name, p.special, s.sort_order
order by s.sort_order;
