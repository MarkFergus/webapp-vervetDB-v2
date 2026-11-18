-- Deworming: the staff member(s) for each day (2026-11-16)
--   day_staff   who gave each day's doses: {"1": "Lindi", "2": "Sam, Jo"}
--               (staff_names stays: everyone on the sheet, for the Weekly
--               Report)
-- save_deworming_results saves it too (an older app that doesn't send it:
-- left as it was).
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs deworming-results.sql and deworming-additions.sql first.

begin;

alter table public.deworming_sheets
    add column if not exists day_staff jsonb not null default '{}';
alter table public.deworming_sheets drop constraint if exists deworming_sheets_day_staff_check;
alter table public.deworming_sheets
    add constraint deworming_sheets_day_staff_check
        check (jsonb_typeof(day_staff) = 'object' and char_length(day_staff::text) <= 1000);

create or replace function public.save_deworming_results(sheet bigint, results jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    stage text;
    submitting boolean := coalesce((results ->> 'submit')::boolean, false);
    done smallint[] := array(select jsonb_array_elements_text(coalesce(results -> 'days_done', '[]'))::smallint);
begin
    perform private.check_deworming_results(sheet);
    select s.status into stage from public.deworming_sheets s where s.id = sheet for update;

    update public.deworming_lines l
    set day_4 = case when x ? 'day_4' and x -> 'day_4' <> 'null'::jsonb then (x ->> 'day_4')::boolean end
    from jsonb_array_elements(coalesce(results -> 'day_4', '[]')) x
    where l.sheet_id = sheet and l.id = (x ->> 'line_id')::bigint;

    if submitting and cardinality(array(select jsonb_array_elements_text(coalesce(results -> 'photos', '[]')))) = 0 then
        raise exception 'Please upload a photo of the deworming sheet before submitting.' using errcode = 'P0001';
    end if;
    if submitting and not (array[1, 2, 3]::smallint[] <@ done) then
        raise exception 'Please complete Day 1, 2 and 3 before submitting.' using errcode = 'P0001';
    end if;
    if submitting and not (4::smallint = any (done))
            and exists (select 1 from public.deworming_lines l where l.sheet_id = sheet and l.day_4) then
        raise exception 'Please complete Day 4 before submitting.' using errcode = 'P0001';
    end if;

    update public.deworming_sheets s set
        started_on = (results ->> 'started_on')::date,
        staff_names = nullif(btrim(left(btrim(results ->> 'staff_names'), 120)), ''),
        day_staff = case when jsonb_typeof(results -> 'day_staff') = 'object' then results -> 'day_staff' else s.day_staff end,
        day_notes = coalesce(results -> 'day_notes', '{}'),
        photos = array(select jsonb_array_elements_text(coalesce(results -> 'photos', '[]'))),
        days_done = done,
        status = case when submitting then 'submitted' else s.status end,
        submitted_by = case when submitting then auth.uid() else s.submitted_by end,
        submitted_by_name = case when submitting then public.my_name() else s.submitted_by_name end,
        submitted_at = case when submitting then now() else s.submitted_at end,
        return_note = case when submitting then null else s.return_note end
    where s.id = sheet;

    delete from public.deworming_doses d
    using public.deworming_lines l
    where l.id = d.line_id and l.sheet_id = sheet;

    insert into public.deworming_doses (line_id, day, result, food, note, medication, dose)
    select (x ->> 'line_id')::bigint, (x ->> 'day')::smallint, nullif(x ->> 'result', ''),
           nullif(btrim(x ->> 'food'), ''), nullif(btrim(x ->> 'note'), ''),
           nullif(btrim(x ->> 'medication'), ''), nullif(btrim(x ->> 'dose'), '')
    from jsonb_array_elements(coalesce(results -> 'doses', '[]')) x
    -- (only this sheet's monkeys)
    where (x ->> 'line_id')::bigint in (select l.id from public.deworming_lines l where l.sheet_id = sheet);

    return case when submitting then 'submitted' else stage end;
end;
$$;

revoke all on function public.save_deworming_results(bigint, jsonb) from public, anon;
grant execute on function public.save_deworming_results(bigint, jsonb) to authenticated;

commit;

-- Check: should say "ready"
select case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deworming_sheets' and column_name = 'day_staff'
) then 'ready' else 'not updated' end as day_staff;
