-- The PM bowls each troop gets (their one feed), by size, entered by admins on
-- the Feeding page (Records → Sections → Feeding). e.g. Lankora: 2 small, 2 medium
--   bowls_small, bowls_medium, bowls_large   how many (0: none; all 0: not entered)
-- Enclosures can already only be changed by admins, so nothing else is needed.
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

-- (an earlier draft's single number, never used)
alter table public.enclosures drop column if exists feeding_bowls;

alter table public.enclosures
    add column if not exists bowls_small smallint not null default 0,
    add column if not exists bowls_medium smallint not null default 0,
    add column if not exists bowls_large smallint not null default 0;

alter table public.enclosures drop constraint if exists enclosures_bowls_check;
alter table public.enclosures
    add constraint enclosures_bowls_check check (
        bowls_small between 0 and 200 and bowls_medium between 0 and 200 and bowls_large between 0 and 200
    );

commit;

-- Check: should show the 3 new columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'enclosures' and column_name like 'bowls_%'
order by column_name;
