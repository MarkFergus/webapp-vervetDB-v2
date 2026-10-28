-- Current Integrations (Records → Integration): a monkey being integrated,
-- from the day it started. Staff write their Integration Reports for the
-- monkeys with one that's active (Records → Integration → Reports).
--   monkey_id    the monkey being integrated (an introcage monkey)
--   started_on   the day it started
--   kind         'adult', 'foster_mum' or 'group' (the type of integration)
--   status       'active', 'on_hold' (both still going on: Current
--                Integrations), 'completed' or 'cancelled' (ended)
--   status_on    the day of its latest Status Update (null: never changed)
--   ended_on     the day it was completed or cancelled
--   logged_by / logged_by_name / logged_at   who started it and when,
--                filled in automatically (their full name)
-- One going on (active or on hold) per monkey at a time.
-- Who can do what (the database enforces it, not just the website), like
-- Integration Reports:
--   read     staff only: any account with a role
--   add      editors and admins, in their own name
--   change   editors and admins (Status Update)
--   delete   admins, or whoever started it
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql and names.sql to have been run first (they have been).

begin;

create table public.integrations (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    started_on      date not null,
    kind            text not null check (kind in ('adult', 'foster_mum', 'group')),
    status          text not null default 'active'
                    check (status in ('active', 'on_hold', 'completed', 'cancelled')),
    status_on       date,
    ended_on        date,
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint integrations_ended_check check (ended_on is null or ended_on >= started_on)
);

-- One going on per monkey
create unique index integrations_one_active
    on public.integrations (monkey_id) where status in ('active', 'on_hold');

alter table public.integrations enable row level security;

create policy "Staff can read integrations"
    on public.integrations for select to authenticated
    using ((select public.can_log_maintenance()));

-- Always in the name of whoever starts it
create policy "Editors can start integrations"
    on public.integrations for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Editors can change integrations"
    on public.integrations for update to authenticated
    using ((select public.is_editor()))
    with check ((select public.is_editor()));

create policy "Admins or the starter can delete integrations"
    on public.integrations for delete to authenticated
    using ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

grant select on public.integrations to authenticated;
-- Only these are typed in; who and when are filled in by the database
grant insert (monkey_id, started_on, kind), update (started_on, kind, status, status_on, ended_on), delete
    on public.integrations to authenticated;

commit;

-- Check: none yet (this should list no rows)
select * from public.integrations;
