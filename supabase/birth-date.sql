-- Birth Date: a monkey's date of birth (when known), and whether it's a
-- guess. Shown on its full profile page and set in Add New Monkey / Edit.
--   birth_date          the date (null: unknown)
--   birth_date_approx   true: an estimate ("Approx?" ticked)
-- With a birth date, its Birth Year follows from it: the birth season
-- (July to June) it falls in, so 12 Nov 2026 is 2026 and 14 Feb 2024 is
-- 2023 (see ages.js). The database checks the two always agree.
-- Monkeys without one keep their Birth Year as it is.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

alter table public.monkeys
    add column birth_date date,
    add column birth_date_approx boolean not null default false,
    -- the Birth Year is the season the date falls in (from 1 July)
    add constraint monkeys_birth_date_season_check check (
        birth_date is null
        or birth_year = extract(year from birth_date)::integer - case when extract(month from birth_date) < 7 then 1 else 0 end
    ),
    -- only a date can be a guess
    add constraint monkeys_birth_date_approx_check check (birth_date is not null or not birth_date_approx);

commit;

-- Check: the two new columns (this should list birth_date and
-- birth_date_approx)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'monkeys' and column_name like 'birth_date%';
