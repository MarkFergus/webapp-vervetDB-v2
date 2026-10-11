-- Only if you already ran the first version of integration-reports.sql (when
-- it was still called integration-summaries.sql): renames its table and
-- column to match the new name, Integration Reports. Nothing is lost.
-- If you hadn't run it yet, skip this file and run integration-reports.sql.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.

begin;

alter table public.integration_summaries rename to integration_reports;
alter table public.integration_reports rename column summary to report;
alter index public.integration_summaries_monkey_id_idx rename to integration_reports_monkey_id_idx;
alter table public.integration_reports
    rename constraint integration_summaries_dates_check to integration_reports_dates_check;

alter policy "Staff can read integration summaries" on public.integration_reports
    rename to "Staff can read integration reports";
alter policy "Editors can add integration summaries" on public.integration_reports
    rename to "Editors can add integration reports";
alter policy "Admins or the writer can change integration summaries" on public.integration_reports
    rename to "Admins or the writer can change integration reports";
alter policy "Admins or the writer can delete integration summaries" on public.integration_reports
    rename to "Admins or the writer can delete integration reports";

commit;

-- Check: the renamed table (no rows yet)
select * from public.integration_reports;
