-- Arrival Reason: Born Here (born at the sanctuary), beside Orphaned,
-- Injured, Confiscated and Surrendered (arrival-details.sql).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

alter table public.monkeys drop constraint if exists monkeys_arrival_reason_check;
alter table public.monkeys add constraint monkeys_arrival_reason_check
    check (arrival_reason in ('orphaned', 'injured', 'confiscated', 'surrendered', 'born_here'));

select 'born-here.sql: ready' as done;
