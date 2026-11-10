-- Maintenance jobs: the Job List's order (2026-11-10). Admins move jobs up and
-- down with arrows; everyone sees the same order. Urgent jobs stay at the
-- top (the order is kept within urgent, and within the rest). Jobs nobody
-- has moved yet come after the ordered ones, the longest waiting first.
--   job_order   its place in the list (null: not moved yet)
-- Only admins can change it (the database checks, not just the website).
-- Moving a job isn't listed in Staff Activity.
-- Safe to run more than once.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs maintenance-issues.sql first (it has been).

begin;

alter table public.maintenance_issues add column if not exists job_order integer;

grant update (job_order) on public.maintenance_issues to authenticated;

-- Only admins move jobs
create or replace function private.job_order_admins_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.job_order is distinct from old.job_order and not (select public.is_admin()) then
        raise exception 'Only admins can change the order of the Job List.' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function private.job_order_admins_only() from public, anon, authenticated;

drop trigger if exists maintenance_issues_job_order on public.maintenance_issues;
create trigger maintenance_issues_job_order
    before update of job_order on public.maintenance_issues
    for each row execute function private.job_order_admins_only();

-- Staff Activity: moving a job up or down isn't listed (only real changes)
drop trigger if exists maintenance_issues_record_change on public.maintenance_issues;
drop trigger if exists maintenance_issues_record_change_upd on public.maintenance_issues;
create trigger maintenance_issues_record_change
    after insert or delete on public.maintenance_issues
    for each row execute function private.record_change();
create trigger maintenance_issues_record_change_upd
    after update on public.maintenance_issues
    for each row when (old.job_order is not distinct from new.job_order)
    execute function private.record_change();

commit;

-- Check: should say ready
select 'ready' as job_order
from information_schema.columns
where table_schema = 'public' and table_name = 'maintenance_issues' and column_name = 'job_order';
