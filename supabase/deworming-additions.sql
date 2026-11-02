-- Deworming: monkeys added while completing a list, and Day 4 (2026-11-02)
--   Add Monkey   staff (editors and admins, until it's submitted) add a
--                monkey that isn't on the list:
--                  added        to the course, from that day on, with its
--                               dewormer, dose and days
--                  accidental   an accidental dose, on that day only
--                and can remove one they added (not the list's own monkeys)
--   Day 4        a monkey whose 3-day course started a day late (Day 1
--                missed, or added on Day 2) gets their 3rd dose on Day 4:
--                each line's day_4 (true: Day 4; false: finished at Day 3;
--                null: not needed). Submit then needs Day 4 complete too.
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs deworming.sql, deworming-results.sql (and its update) first.

begin;

------------------------------------------------------------------------
-- Each monkey's line: on the list, added, or an accidental dose
------------------------------------------------------------------------
alter table public.deworming_lines
    add column if not exists kind text not null default 'list',
    add column if not exists from_day smallint not null default 1,
    add column if not exists added_by uuid references auth.users (id) on delete set null,
    add column if not exists added_by_name text,
    add column if not exists day_4 boolean;
alter table public.deworming_lines drop constraint if exists deworming_lines_kind_check;
alter table public.deworming_lines
    add constraint deworming_lines_kind_check check (kind in ('list', 'added', 'accidental'));
alter table public.deworming_lines drop constraint if exists deworming_lines_from_day_check;
alter table public.deworming_lines
    add constraint deworming_lines_from_day_check check (from_day between 1 and 4);

------------------------------------------------------------------------
-- Who can change a list's results: editors and admins until it's
-- submitted, then admins until it's approved (raises otherwise)
------------------------------------------------------------------------
create or replace function private.check_deworming_results(sheet bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    stage text;
begin
    select s.status into stage from public.deworming_sheets s where s.id = sheet;
    if not found then
        raise exception 'That deworming list no longer exists.' using errcode = 'P0001';
    end if;
    if not public.is_editor() or public.is_limited() then
        raise exception 'Only editors and admins can record deworming' using errcode = '42501';
    end if;
    if stage = 'approved' then
        raise exception 'This list has been approved, so it can''t be changed.' using errcode = 'P0001';
    end if;
    if stage = 'submitted' and not public.is_admin() then
        raise exception 'This list has been submitted for approval, so only an admin can change it now.' using errcode = 'P0001';
    end if;
end;
$$;

------------------------------------------------------------------------
-- Add Monkey → the new line's id
--   line: { monkey_id, kind ("added" / "accidental"), from_day,
--           medication, dose, days }
------------------------------------------------------------------------
create or replace function public.add_deworming_monkey(sheet bigint, line jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    kind_of text := line ->> 'kind';
    first_day smallint := (line ->> 'from_day')::smallint;
    course smallint := coalesce((line ->> 'days')::smallint, 1);
    saved_id bigint;
begin
    perform private.check_deworming_results(sheet);
    if kind_of is null or kind_of not in ('added', 'accidental') then
        raise exception 'Choose Accidental Dose or Add to Course.' using errcode = 'P0001';
    end if;
    if first_day is null or first_day not between 1 and 3 then
        raise exception 'A monkey can only be added on Day 1, 2 or 3.' using errcode = 'P0001';
    end if;
    -- (an accidental dose is one day; a 3-day course must fit by Day 4)
    if kind_of = 'accidental' then
        course := 1;
    elsif course = 3 and first_day > 2 then
        raise exception 'A 3-day course can only start on Day 1 or 2.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.deworming_lines l
               where l.sheet_id = sheet and l.monkey_id = (line ->> 'monkey_id')::bigint) then
        raise exception 'That monkey is already on this list.' using errcode = 'P0001';
    end if;

    insert into public.deworming_lines (sheet_id, monkey_id, medication, dose, days, kind, from_day, added_by, added_by_name)
    values (sheet, (line ->> 'monkey_id')::bigint, btrim(line ->> 'medication'), btrim(line ->> 'dose'), course,
            kind_of, first_day, auth.uid(), public.my_name())
    returning id into saved_id;
    return saved_id;
end;
$$;

------------------------------------------------------------------------
-- Remove a monkey staff added (not one of the list's own)
------------------------------------------------------------------------
create or replace function public.remove_deworming_monkey(line bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    its_sheet bigint;
begin
    select l.sheet_id into its_sheet from public.deworming_lines l where l.id = line and l.kind <> 'list';
    if not found then
        raise exception 'Only a monkey added while completing the list can be removed.' using errcode = 'P0001';
    end if;
    perform private.check_deworming_results(its_sheet);
    delete from public.deworming_lines l where l.id = line;
end;
$$;

------------------------------------------------------------------------
-- Saving the results (as before, plus each line's Day 4 decision:
--   results.day_4: [{ line_id, day_4 }]; Submit needs Day 4 complete when
--   anyone has one)
------------------------------------------------------------------------
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
        staff_names = nullif(btrim(results ->> 'staff_names'), ''),
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

revoke all on function private.check_deworming_results(bigint) from public, anon, authenticated;
revoke all on function public.add_deworming_monkey(bigint, jsonb), public.remove_deworming_monkey(bigint),
    public.save_deworming_results(bigint, jsonb) from public, anon;
grant execute on function public.add_deworming_monkey(bigint, jsonb), public.remove_deworming_monkey(bigint),
    public.save_deworming_results(bigint, jsonb) to authenticated;

commit;

-- Check: should say "ready"
select case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deworming_lines' and column_name = 'day_4'
) then 'ready' else 'not updated' end as additions;
