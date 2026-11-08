-- Buildings (2026-11-08): places for maintenance that aren't enclosures (the
-- office, sheds, cabins, the villages…). A new place type, 'building': like
-- an enclosure, but with no section, introcages or monkeys. Maintenance
-- reports and issues can then be logged on them (they need a place), and
-- they're tappable on the Interactive Map. The website keeps them out of
-- everything about monkeys.
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs enclosure-types.sql first (it has been).

begin;

-- The new type
alter table public.enclosures drop constraint if exists enclosures_type_check;
alter table public.enclosures
    add constraint enclosures_type_check
        check (type in ('troop', 'block', 'care_unit', 'building', 'introcage', 'area'));

-- An enclosure has a section; buildings, introcages and areas don't
alter table public.enclosures drop constraint if exists enclosures_section_check;
alter table public.enclosures
    add constraint enclosures_section_check
        check ((type in ('troop', 'block', 'care_unit')) = (section_id is not null));

-- The buildings, named as on the map (after the enclosures in any list)
insert into public.enclosures (name, type, sort_order)
select b.name, 'building', 1000 + b.n
from (values
    (1, 'Office & Gift Shop'),
    (2, 'Education Centre'),
    (3, 'Mainfeed'),
    (4, 'Section & Tool Shed'),
    (5, 'Laundry Room'),
    (6, 'Volunteer Cottage'),
    (7, 'Volunteer Village'),
    (8, 'Staff Village'),
    (9, 'Mana Hut'),
    (10, 'Lankora Landing'),
    (11, 'D&D Cabin'),
    (12, 'Woods Cabin'),
    (13, 'COTH Cabin'),
    (14, 'Libelela Cabin'),
    (15, 'Skrow Cabin'),
    (16, 'Private Shower/Toilet'),
    (17, 'Lankora Shower'),
    (18, 'Lankora Toilet'),
    (19, 'Cottage Toilet'),
    (20, 'Sickbay Toilet')
) as b (n, name)
where not exists (select 1 from public.enclosures e where e.name = b.name and e.level = 'enclosure');

commit;

-- Check: should say 20
select count(*) as buildings from public.enclosures where type = 'building';
