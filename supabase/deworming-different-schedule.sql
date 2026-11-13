-- Deworming: "On different schedule" (after deworming.sql).
--
-- New Deworming List / Edit List: a monkey left unticked can be marked
-- "On different schedule". The sheet (and its PDF) then says, under the
-- list, "On different schedule: Pantshula, Barry." so whoever deworms
-- knows they're missing for a reason.
--   deworming_sheets.different_schedule: those monkeys' ids
--   save_deworming_sheet(sheet): also takes different_schedule: [ids]
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

alter table public.deworming_sheets
    add column if not exists different_schedule bigint[] not null default '{}';

create or replace function public.save_deworming_sheet(sheet jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    saved_id bigint := (sheet ->> 'id')::bigint;
    -- (the monkeys on a different schedule: none on the list itself)
    different bigint[] := coalesce(
        (select array_agg(distinct d::bigint)
         from jsonb_array_elements_text(coalesce(sheet -> 'different_schedule', '[]')) d
         where d::bigint not in (
             select (l ->> 'monkey_id')::bigint from jsonb_array_elements(coalesce(sheet -> 'lines', '[]')) l
         )),
        '{}');
begin
    if not public.is_admin() then
        raise exception 'Only admins can prepare deworming sheets' using errcode = '42501';
    end if;
    if jsonb_array_length(coalesce(sheet -> 'lines', '[]')) = 0 then
        raise exception 'Please choose at least one monkey.' using errcode = 'P0001';
    end if;

    if saved_id is null then
        insert into public.deworming_sheets (group_key, group_name, session, start_date, instructions, different_schedule)
        values (sheet ->> 'group_key', sheet ->> 'group_name', sheet ->> 'session',
                (sheet ->> 'start_date')::date, nullif(btrim(sheet ->> 'instructions'), ''), different)
        returning id into saved_id;
    else
        update public.deworming_sheets set
            group_key = sheet ->> 'group_key',
            group_name = sheet ->> 'group_name',
            session = sheet ->> 'session',
            start_date = (sheet ->> 'start_date')::date,
            instructions = nullif(btrim(sheet ->> 'instructions'), ''),
            different_schedule = different
        where id = saved_id;
        if not found then
            raise exception 'That deworming sheet no longer exists.' using errcode = 'P0001';
        end if;
        delete from public.deworming_lines l where l.sheet_id = saved_id;
    end if;

    insert into public.deworming_lines (sheet_id, monkey_id, medication, dose, days)
    select saved_id, (l ->> 'monkey_id')::bigint, btrim(l ->> 'medication'), btrim(l ->> 'dose'), (l ->> 'days')::smallint
    from jsonb_array_elements(sheet -> 'lines') l;

    return saved_id;
end;
$$;

revoke all on function public.save_deworming_sheet(jsonb) from public, anon;
grant execute on function public.save_deworming_sheet(jsonb) to authenticated;

select 'deworming-different-schedule.sql: ready' as done;
