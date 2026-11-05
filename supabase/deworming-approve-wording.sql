-- Deworming's Approve: its message no longer calls a monkey "it" (2026-11-05).
-- Otherwise the same as deworming-results.sql's. Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

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
        raise exception 'Every monkey needs their record before approving.' using errcode = 'P0001';
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

-- Check: should say ready
select 'ready' as approve_wording;
