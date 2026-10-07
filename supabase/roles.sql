-- Roles: every account in the editors table now has one.
--   admin        everything editors can do, plus add / delete monkeys, change
--                enclosure details and photos, delete log entries
--   editor       change monkeys, and log maintenance
--   maintenance  only log maintenance on enclosures and introcages (no
--                monkey changes, no photo uploads)
-- The database enforces these, not just the website.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Safe with the live site: is_admin stays (worked out from the role), so
-- the website before this update keeps working.
--
-- New accounts are still editors to start with (Authentication → Users →
-- Add user). To make one a maintenance account, run make-maintenance.sql
-- straight after adding them.

begin;

alter table public.editors
    add column role text not null default 'editor'
        check (role in ('admin', 'editor', 'maintenance'));

update public.editors set role = 'admin' where is_admin;

-- is_admin is now worked out from the role (so nothing can disagree)
alter table public.editors drop column is_admin;
alter table public.editors
    add column is_admin boolean generated always as (role = 'admin') stored;

-- Editors (and admins): may change monkeys, troops and photos. Maintenance
-- accounts aren't editors, so every rule that asks for an editor already
-- leaves them out.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.editors
        where user_id = (select auth.uid()) and role in ('admin', 'editor')
    )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.editors
        where user_id = (select auth.uid()) and role = 'admin'
    )
$$;

-- May log maintenance: any account with a role
create function public.can_log_maintenance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.editors where user_id = (select auth.uid())
    )
$$;

-- The maintenance log: anyone with a role can add entries (in their own
-- name) and correct them; deleting stays admins only
drop policy "Editors can add maintenance" on public.maintenance;
create policy "Staff can add maintenance"
    on public.maintenance for insert to authenticated
    with check ((select public.can_log_maintenance()) and logged_by = (select auth.uid()));

drop policy "Editors can change maintenance" on public.maintenance;
create policy "Staff can change maintenance"
    on public.maintenance for update to authenticated
    using ((select public.can_log_maintenance())) with check ((select public.can_log_maintenance()));

commit;

-- Check: everyone with an account and their role
select u.email, e.role, e.is_admin
from public.editors e join auth.users u on u.id = e.user_id
order by e.role, u.email;
