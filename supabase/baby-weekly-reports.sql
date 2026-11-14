-- Weekly Baby Reports (Records → Baby Care → Weekly Baby Reports): a short
-- report on each baby in Baby Care, once a week (Monday to Sunday).
--   baby_weekly_reports
--     monkey_id     the baby it's about
--     week_start    the Monday of the week it covers
--     report        the report itself (up to 1000 characters); empty (null):
--                   Not recorded (it can be written later with Edit)
--     logged_by / logged_by_name / logged_at   who last saved it, and when
--   One report per baby per week.
--   save_baby_weekly_reports(week_start, reports, edit):
--     reports: [{ "monkey_id", "report" }] (an empty report: Not recorded)
--     edit false (Enter): a new week, every baby at once; refused if that
--       week has been reported already (no doubles, nothing saved over)
--     edit true (View → Edit): changes that week's reports (in the name of
--       whoever changed them); a baby missing from it is added
--     → how many were saved
-- Who can do what (the database enforces it):
--   read     staff only: any account with a role
--   save / edit   editors and admins, not limited accounts
--   delete   admins, or whoever wrote it
-- Shows in Staff Activity.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Safe to run again (also over the first version of this file).

begin;

create table if not exists public.baby_weekly_reports (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    week_start      date not null check (extract(isodow from week_start) = 1),
    report          text,
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint baby_weekly_reports_one_a_week unique (monkey_id, week_start)
);

-- (empty: Not recorded)
alter table public.baby_weekly_reports alter column report drop not null;
alter table public.baby_weekly_reports drop constraint if exists baby_weekly_reports_report_check;
alter table public.baby_weekly_reports add constraint baby_weekly_reports_report_check
    check (report is null or (report = btrim(report) and report <> '' and char_length(report) <= 1000));

create index if not exists baby_weekly_reports_week_idx
    on public.baby_weekly_reports (week_start desc);

alter table public.baby_weekly_reports enable row level security;

drop policy if exists "Staff can read weekly baby reports" on public.baby_weekly_reports;
create policy "Staff can read weekly baby reports"
    on public.baby_weekly_reports for select to authenticated
    using ((select public.can_log_maintenance()));

drop policy if exists "Admins or the writer can delete weekly baby reports" on public.baby_weekly_reports;
create policy "Admins or the writer can delete weekly baby reports"
    on public.baby_weekly_reports for delete to authenticated
    using ((select public.can_log_maintenance()) and not (select public.is_limited())
           and ((select public.is_admin()) or logged_by = (select auth.uid())));

-- (adding and changing: only through Save All below)
grant select, delete on public.baby_weekly_reports to authenticated;

------------------------------------------------------------------------
-- Save All: one week's reports
------------------------------------------------------------------------
-- (the first version had no "edit")
drop function if exists public.save_baby_weekly_reports(date, jsonb);

create or replace function public.save_baby_weekly_reports(week_start date, reports jsonb, edit boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    e jsonb;
    baby bigint;
    words text;
    saved integer := 0;
    week date := save_baby_weekly_reports.week_start;
    wc text := 'W/C ' || to_char(save_baby_weekly_reports.week_start, 'DD.MM');
begin
    if not public.is_editor() or public.is_limited() then
        raise exception 'Only editors and admins can save these' using errcode = '42501';
    end if;
    if week is null or extract(isodow from week) <> 1 then
        raise exception 'A week starts on a Monday' using errcode = '23514';
    end if;
    if week > (now() at time zone 'Africa/Johannesburg')::date then
        raise exception 'That week hasn''t started yet' using errcode = '23514';
    end if;
    if not edit then
        if exists (select 1 from public.baby_weekly_reports r where r.week_start = week) then
            raise exception '% has already been reported. To change it, use Edit in View.', wc using errcode = 'P0001';
        end if;
        if not exists (select 1 from jsonb_array_elements(coalesce(reports, '[]')) x
                       where nullif(btrim(x ->> 'report'), '') is not null) then
            raise exception 'Please write a report for at least one baby.' using errcode = 'P0001';
        end if;
    end if;

    for e in select * from jsonb_array_elements(coalesce(reports, '[]')) loop
        baby := (e ->> 'monkey_id')::bigint;
        words := nullif(btrim(e ->> 'report'), '');
        if exists (select 1 from public.baby_weekly_reports r where r.monkey_id = baby and r.week_start = week) then
            update public.baby_weekly_reports r
            set report = words, logged_by = auth.uid(), logged_by_name = public.my_name(), logged_at = now()
            where r.monkey_id = baby and r.week_start = week
              and r.report is distinct from words;
            if found then
                saved := saved + 1;
            end if;
        else
            insert into public.baby_weekly_reports (monkey_id, week_start, report, logged_by, logged_by_name)
            values (baby, week, words, auth.uid(), public.my_name());
            saved := saved + 1;
        end if;
    end loop;
    return saved;
exception
    -- (someone else saved the same week a moment before)
    when unique_violation then
        raise exception '% has just been reported by someone else. To change it, use Edit in View.', wc using errcode = 'P0001';
end;
$$;

revoke all on function public.save_baby_weekly_reports(date, jsonb, boolean) from public, anon;
grant execute on function public.save_baby_weekly_reports(date, jsonb, boolean) to authenticated;

-- Staff Activity
drop trigger if exists baby_weekly_reports_record_change on public.baby_weekly_reports;
create trigger baby_weekly_reports_record_change
    after insert or update or delete on public.baby_weekly_reports
    for each row execute function private.record_change();

commit;

-- Check: should say "ready" twice
select
    (select case when count(*) = 1 then 'ready' else 'not ready' end
     from information_schema.tables where table_schema = 'public' and table_name = 'baby_weekly_reports') as table_ready,
    (select case when count(*) = 1 then 'ready' else 'not ready' end
     from pg_proc where proname = 'save_baby_weekly_reports') as save_ready;
