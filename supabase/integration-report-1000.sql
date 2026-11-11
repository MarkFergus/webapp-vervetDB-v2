-- Integration Reports: a report can now be up to 1000 characters (was 500).
-- Nothing already saved changes.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.

begin;

-- The old 500 limit (its name depends on which version of
-- integration-reports.sql was run, so it's found by what it checks)
do $$
declare
    old_check text;
begin
    for old_check in
        select conname
        from pg_constraint
        where conrelid = 'public.integration_reports'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%char_length(report)%'
    loop
        execute format('alter table public.integration_reports drop constraint %I', old_check);
    end loop;
end
$$;

alter table public.integration_reports
    add constraint integration_reports_report_check
    check (report = btrim(report) and report <> '' and char_length(report) <= 1000);

commit;

-- Check: should show the new limit (<= 1000)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.integration_reports'::regclass and contype = 'c';
