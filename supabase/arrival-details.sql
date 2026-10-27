-- A new arrival's Arrival Date and Arrival Reason, asked in Add New Monkey
-- (New Arrival) and shown in the Full Profile's Arrival Info (staff only).
--   arrival_date    the day it arrived (the website: required for a new
--                   arrival, not in the future; null: not recorded, e.g.
--                   the monkeys added before this file)
--   arrival_reason  'orphaned', 'injured', 'confiscated' or 'surrendered'
--                   (null: not recorded)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

alter table public.monkeys
    add column arrival_date date,
    add column arrival_reason text
        constraint monkeys_arrival_reason_check
        check (arrival_reason in ('orphaned', 'injured', 'confiscated', 'surrendered'));

commit;

-- Check: the two new columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'monkeys' and column_name in ('arrival_date', 'arrival_reason')
order by column_name;
