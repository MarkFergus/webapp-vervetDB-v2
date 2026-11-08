-- Maintenance jobs: After photos (2026-11-08). Job Done can add up to 4
-- photos of the finished work, kept on the job beside the photos it was added
-- with, in the same private storage (maintenance-issues).
-- Safe to run more than once.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs maintenance-issues.sql first (it has been).

alter table public.maintenance_issues
    add column if not exists done_photo_paths text[] not null default '{}'
        check (cardinality(done_photo_paths) <= 4);

-- Saved with Job Done (the same rules as the rest of a job's changes)
grant update (done_photo_paths) on public.maintenance_issues to authenticated;

-- Check: should say ready
select 'ready' as done_photos
from information_schema.columns
where table_schema = 'public' and table_name = 'maintenance_issues' and column_name = 'done_photo_paths';
