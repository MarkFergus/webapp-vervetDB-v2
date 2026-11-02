-- Deworming, part 2: catch-up for a database that already ran
-- deworming-results.sql before these changes (2026-11-02):
--   - a change of dewormer can be saved before the dose is given (a day's
--     entry with no result yet)
--   - the days saved complete (days_done: Day 2 opens once Day 1 is…), and
--     Submit needs Day 1, 2 and 3 complete as well as the sheet's photo
-- Safe to run more than once. (deworming-results.sql itself already has all
-- of this, for a database that hasn't run it yet.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

-- A day's entry: a result, or a change of dewormer (or both)
alter table public.deworming_doses alter column result drop not null;
alter table public.deworming_doses drop constraint if exists deworming_doses_something;
alter table public.deworming_doses
    add constraint deworming_doses_something check (result is not null or medication is not null);

-- The days saved complete
alter table public.deworming_sheets
    add column if not exists days_done smallint[] not null default '{}';
alter table public.deworming_sheets drop constraint if exists deworming_sheets_days_done_check;
alter table public.deworming_sheets
    add constraint deworming_sheets_days_done_check check (days_done <@ array[1, 2, 3, 4]::smallint[]);

-- Saving the results (as before, with the above)
create or replace function public.save_deworming_results(sheet bigint, results jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    stage text;
    submitting boolean := coalesce((results ->> 'submit')::boolean, false);
begin
    select s.status into stage from public.deworming_sheets s where s.id = sheet for update;
    if not found then
        raise exception 'That deworming sheet no longer exists.' using errcode = 'P0001';
    end if;
    if not public.is_editor() or public.is_limited() then
        raise exception 'Only editors and admins can record deworming' using errcode = '42501';
    end if;
    if stage = 'approved' then
        raise exception 'This sheet has been approved, so it can''t be changed.' using errcode = 'P0001';
    end if;
    if stage = 'submitted' and not public.is_admin() then
        raise exception 'This sheet has been submitted for approval, so only an admin can change it now.' using errcode = 'P0001';
    end if;
    if submitting and cardinality(array(select jsonb_array_elements_text(coalesce(results -> 'photos', '[]')))) = 0 then
        raise exception 'Please upload a photo of the deworming sheet before submitting.' using errcode = 'P0001';
    end if;
    if submitting and not (array[1, 2, 3]::smallint[]
            <@ array(select jsonb_array_elements_text(coalesce(results -> 'days_done', '[]'))::smallint)) then
        raise exception 'Please complete Day 1, 2 and 3 before submitting.' using errcode = 'P0001';
    end if;

    update public.deworming_sheets s set
        started_on = (results ->> 'started_on')::date,
        staff_names = nullif(btrim(results ->> 'staff_names'), ''),
        day_notes = coalesce(results -> 'day_notes', '{}'),
        photos = array(select jsonb_array_elements_text(coalesce(results -> 'photos', '[]'))),
        days_done = array(select jsonb_array_elements_text(coalesce(results -> 'days_done', '[]'))::smallint),
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
    where table_schema = 'public' and table_name = 'deworming_sheets' and column_name = 'days_done'
) then 'ready' else 'not updated' end as days_done;
