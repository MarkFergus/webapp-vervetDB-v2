-- Species: each monkey's species, shown on its full profile page and set
-- in Add New Monkey / Edit.
--   species   'vervet' (Vervet Monkey, everyone to start with), 'samango'
--             (Samango Monkey) or 'bush_baby' (Bush Baby)
-- The Jalamango monkeys (its troop and its introcages) are Samangos; all
-- the others are Vervets.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

alter table public.monkeys
    add column species text not null default 'vervet'
        constraint monkeys_species_check check (species in ('vervet', 'samango', 'bush_baby'));

-- Jalamango: the troop, and anyone in its introcages
update public.monkeys
set species = 'samango'
where troop_id in (select t.id from public.troops t where t.name = 'Jalamango')
   or introcage_id in (
        select i.id from public.enclosures i
        join public.enclosures e on e.id = i.parent_id
        where e.name = 'Jalamango'
   );

commit;

-- Check: the Samangos by name (6: Zayda, Lili, Nino, Mango, Zea, Satchmo),
-- then how many of each species
select name, species from public.monkeys where species <> 'vervet' order by name;
select species, count(*) from public.monkeys group by species order by species;
