-- Integration Reports: a staff log of how a monkey's integration is going
-- (usually a weekly report), shown on the monkey's pop-up for staff.
--   monkey_id     the monkey it's about
--   from_date / to_date   the period it covers
--   report       the report itself (up to 500 characters)
--   logged_by / logged_by_name / logged_at   who wrote it and when, filled
--                 in automatically (their full name, as the maintenance log)
-- Who can do what (the database enforces it, not just the website):
--   read     staff only: any account with a role (admin, editor, maintenance)
--   add      editors and admins, in their own name
--   change / delete   admins, or whoever wrote it
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql and names.sql to have been run first (they have been).

begin;

create table public.integration_reports (
    id            bigint generated always as identity primary key,
    monkey_id     bigint not null references public.monkeys (id) on delete cascade,
    from_date     date not null,
    to_date       date not null,
    report       text not null
                  check (report = btrim(report) and report <> '' and char_length(report) <= 500),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint integration_reports_dates_check check (to_date >= from_date)
);

create index integration_reports_monkey_id_idx
    on public.integration_reports (monkey_id, to_date desc);

alter table public.integration_reports enable row level security;

-- Staff only: visitors (not signed in) can't read them
create policy "Staff can read integration reports"
    on public.integration_reports for select to authenticated
    using ((select public.can_log_maintenance()));

-- An entry is always in the name of whoever adds it
create policy "Editors can add integration reports"
    on public.integration_reports for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change integration reports"
    on public.integration_reports for update to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

create policy "Admins or the writer can delete integration reports"
    on public.integration_reports for delete to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

grant select on public.integration_reports to authenticated;
-- Only the period and the report are typed in; who and when are filled in
-- by the database, so nobody can write in someone else's name
grant insert (monkey_id, from_date, to_date, report), update (from_date, to_date, report), delete
    on public.integration_reports to authenticated;

commit;

-- Check: none yet (this should list no rows)
select * from public.integration_reports;
