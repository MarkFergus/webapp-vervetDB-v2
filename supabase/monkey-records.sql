-- Monkey Records: a monkey's Rehabilitation and Medical records, listed on
-- its page (MonkeyPage.jsx) by date, category and details.
--   monkey_id     the monkey it's about
--   section       'rehabilitation' or 'medical'
--   record_date   the day it happened
--   category      rehabilitation: movement, observation, escape, integration
--                 medical: injury, medicine, treatment, vet_visit, observation
--   details       what happened (up to 1000 characters)
--   logged_by / logged_by_name / logged_at   who wrote it and when, filled
--                 in automatically (their full name, as the maintenance log)
-- Who can do what (the database enforces it, not just the website), the
-- same as Integration Reports:
--   read     staff only: any account with a role (admin, editor, maintenance)
--   add      editors and admins, in their own name
--   change / delete   admins, or whoever wrote it
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql and names.sql to have been run first (they have been).

begin;

create table public.monkey_records (
    id            bigint generated always as identity primary key,
    monkey_id     bigint not null references public.monkeys (id) on delete cascade,
    section       text not null check (section in ('rehabilitation', 'medical')),
    record_date   date not null,
    category      text not null,
    details       text not null
                  check (details = btrim(details) and details <> '' and char_length(details) <= 1000),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    -- Each section's own categories
    constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'observation', 'escape', 'integration'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation'))
    )
);

create index monkey_records_monkey_id_idx
    on public.monkey_records (monkey_id, section, record_date desc);

alter table public.monkey_records enable row level security;

-- Staff only: visitors (not signed in) can't read them
create policy "Staff can read monkey records"
    on public.monkey_records for select to authenticated
    using ((select public.can_log_maintenance()));

-- A record is always in the name of whoever adds it
create policy "Editors can add monkey records"
    on public.monkey_records for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change monkey records"
    on public.monkey_records for update to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

create policy "Admins or the writer can delete monkey records"
    on public.monkey_records for delete to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

grant select on public.monkey_records to authenticated;
-- Only the date, category and details are typed in; who and when are
-- filled in by the database, so nobody can write in someone else's name
grant insert (monkey_id, section, record_date, category, details), update (record_date, category, details), delete
    on public.monkey_records to authenticated;

commit;

-- Check: none yet (this should list no rows)
select * from public.monkey_records;
