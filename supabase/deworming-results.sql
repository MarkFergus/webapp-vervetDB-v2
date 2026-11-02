-- Deworming, part 2: completing a sheet and approving it.
--   Results    each monkey's doses, day by day (Day 1–4: a Day 4 when one
--              day was late): Full, 3/4, 1/2, 1/4, None or Skipped, the
--              food it was hidden in, a note, and the dewormer and dose if
--              it was changed that day (deworming_doses). And the sheet's
--              real start date, who did it, a note for each day (for the
--              WhatsApp summary) and photos of the paper sheet.
--   Submit     staff (editors and admins) save each day in turn (days_done:
--              the days saved complete), then, all 3 complete, submit it
--              for approval: a photo of the paper sheet is needed
--   Approve    admins check it (the photo, the results) and approve it:
--              each monkey then gets a Deworming record in its Medical
--              records ("6-Month - 1/2 tab Milbeworm, one dose only"), in
--              the words the admin approved. Or Send Back, with a note.
-- Sheet photos are kept privately in their own storage bucket: staff can
-- see them, editors add them, admins delete them.
--
-- Who can do what (the database enforces it, not just the website):
--   results / submit   editors and admins, until it's submitted (then
--                      admins, until it's approved)
--   approve / send back   admins
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs deworming.sql and monkey-records-admin.sql to have been run first.

begin;

------------------------------------------------------------------------
-- The sheet: its stages, and what's recorded on it
------------------------------------------------------------------------
alter table public.deworming_sheets drop constraint deworming_sheets_status_check;
alter table public.deworming_sheets
    add constraint deworming_sheets_status_check check (status in ('ready', 'submitted', 'approved')),
    -- the real Day 1 (the planned start_date until it's recorded)
    add column started_on date,
    add column staff_names text
        check (staff_names is null or (staff_names = btrim(staff_names) and staff_names <> '' and char_length(staff_names) <= 120)),
    -- a note for each day, for its WhatsApp summary: { "1": "…", "2": "…" }
    add column day_notes jsonb not null default '{}',
    -- the paper sheet's photos (their paths in the deworming-sheets bucket)
    add column photos text[] not null default '{}',
    -- the days saved complete (Day 2 opens once Day 1 is…)
    add column days_done smallint[] not null default '{}' check (days_done <@ array[1, 2, 3, 4]::smallint[]),
    add column submitted_by uuid references auth.users (id) on delete set null,
    add column submitted_by_name text,
    add column submitted_at timestamptz,
    add column approved_by uuid references auth.users (id) on delete set null,
    add column approved_by_name text,
    add column approved_at timestamptz,
    -- Send Back's note to staff
    add column return_note text check (return_note is null or char_length(return_note) <= 300);

-- Each monkey's record, in the words approved
alter table public.deworming_lines
    add column record_text text check (record_text is null or (record_text = btrim(record_text) and record_text <> '' and char_length(record_text) <= 1000));

create table public.deworming_doses (
    line_id     bigint not null references public.deworming_lines (id) on delete cascade,
    day         smallint not null check (day between 1 and 4),
    -- (null: a change of dewormer entered before the dose)
    result      text check (result in ('full', '3/4', '1/2', '1/4', 'none', 'skipped')),
    food        text check (food is null or (food = btrim(food) and food <> '' and char_length(food) <= 40)),
    note        text check (note is null or (note = btrim(note) and note <> '' and char_length(note) <= 200)),
    -- a change of dewormer from this day on (null: as before)
    medication  text check (medication is null or (medication = btrim(medication) and medication <> '' and char_length(medication) <= 40)),
    dose        text check (dose is null or (dose = btrim(dose) and dose <> '' and char_length(dose) <= 20)),
    primary key (line_id, day),
    constraint deworming_doses_something check (result is not null or medication is not null)
);

alter table public.deworming_doses enable row level security;
create policy "Staff can read deworming doses"
    on public.deworming_doses for select to authenticated
    using ((select public.can_log_maintenance()));
grant select on public.deworming_doses to authenticated;
-- (written by save_deworming_results only)

------------------------------------------------------------------------
-- Medical records: the new Deworming category
------------------------------------------------------------------------
alter table public.monkey_records
    drop constraint monkey_records_category_check,
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'observation', 'escape', 'integration', 'status'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation', 'food_monitoring', 'deworming'))
    );

------------------------------------------------------------------------
-- Saving the results (as they go, and Submit)
--   results: { started_on, staff_names, day_notes, photos, days_done,
--              doses: [{ line_id, day, result, food, note, medication, dose }],
--              submit (true: submit it for approval) }
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

------------------------------------------------------------------------
-- Approve (admins): each monkey's record, in the words given
--   records: [{ line_id, text }] (every monkey on the sheet)
------------------------------------------------------------------------
create or replace function public.approve_deworming_sheet(sheet bigint, records jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    s public.deworming_sheets;
    added integer;
begin
    if not public.is_admin() then
        raise exception 'Only admins can approve deworming' using errcode = '42501';
    end if;
    select * into s from public.deworming_sheets where id = sheet for update;
    if not found then
        raise exception 'That deworming sheet no longer exists.' using errcode = 'P0001';
    end if;
    if s.status <> 'submitted' then
        raise exception 'Only a submitted sheet can be approved.' using errcode = 'P0001';
    end if;
    if exists (
        select 1 from public.deworming_lines l
        where l.sheet_id = sheet
          and not exists (select 1 from jsonb_array_elements(records) r
                          where (r ->> 'line_id')::bigint = l.id and nullif(btrim(r ->> 'text'), '') is not null)
    ) then
        raise exception 'Every monkey needs its record before approving.' using errcode = 'P0001';
    end if;

    update public.deworming_lines l
    set record_text = btrim(r ->> 'text')
    from jsonb_array_elements(records) r
    where l.sheet_id = sheet and l.id = (r ->> 'line_id')::bigint;

    insert into public.monkey_records (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
    select l.monkey_id, 'medical', coalesce(s.started_on, s.start_date), 'deworming', l.record_text, auth.uid(), public.my_name()
    from public.deworming_lines l
    where l.sheet_id = sheet;
    get diagnostics added = row_count;

    update public.deworming_sheets set
        status = 'approved', approved_by = auth.uid(), approved_by_name = public.my_name(), approved_at = now()
    where id = sheet;
    return added;
end;
$$;

------------------------------------------------------------------------
-- Send Back (admins): a submitted sheet back to staff, with a note
------------------------------------------------------------------------
create or replace function public.return_deworming_sheet(sheet bigint, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Only admins can send deworming back' using errcode = '42501';
    end if;
    update public.deworming_sheets
    set status = 'ready', return_note = nullif(btrim(note), '')
    where id = sheet and status = 'submitted';
    if not found then
        raise exception 'Only a submitted sheet can be sent back.' using errcode = 'P0001';
    end if;
end;
$$;

revoke all on function public.save_deworming_results(bigint, jsonb), public.approve_deworming_sheet(bigint, jsonb),
    public.return_deworming_sheet(bigint, text) from public, anon;
grant execute on function public.save_deworming_results(bigint, jsonb), public.approve_deworming_sheet(bigint, jsonb),
    public.return_deworming_sheet(bigint, text) to authenticated;

------------------------------------------------------------------------
-- The paper sheets' photos: a private bucket (staff only)
------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deworming-sheets', 'deworming-sheets', false, 10485760, array['image/webp', 'image/jpeg', 'image/png']);

create policy "Staff can see deworming sheet photos"
    on storage.objects for select to authenticated
    using (bucket_id = 'deworming-sheets' and (select public.can_log_maintenance()));
create policy "Editors can add deworming sheet photos"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'deworming-sheets' and (select public.is_editor()) and not (select public.is_limited()));
create policy "Admins can delete deworming sheet photos"
    on storage.objects for delete to authenticated
    using (bucket_id = 'deworming-sheets' and (select public.is_admin()));

commit;

-- Check: the new results table and the photos' bucket (should say 1 and 1)
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'deworming_doses') as doses_table,
       (select count(*) from storage.buckets where id = 'deworming-sheets') as photo_bucket;
