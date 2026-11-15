-- Deworming: one-dose dewormers and "1 or 3" courses (2026-11-15), for the
-- Weekly Report's deworming issues, the same as the app:
--   Ivermectin is one dose only (like Milbeworm): a course after one dose.
--   Albendazole and Pyrantel work as 1 or 3 days: a full dose, then a day
--   missed or skipped, is a finished course (not "course not completed").
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

create or replace function private.wr_deworming_issue(line_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    l record;
    d record;
    given text;
    previous text;
    need int;
    run int := 0;
    finished boolean := false;
    -- (Albendazole and Pyrantel work as 1 or 3 days: a full dose, then a
    -- day missed or skipped, is a finished course)
    one_or_three boolean;
    had_full boolean := false;
    words text[] := '{}';
begin
    select x.kind, x.from_day, x.medication, x.days, m.name into l
    from public.deworming_lines x
    join public.monkeys m on m.id = x.monkey_id
    where x.id = line_id;

    if l.kind = 'accidental' then
        return l.name || ': accidental dose on Day ' || l.from_day;
    end if;

    given := l.medication;
    for d in
        select day, result, medication from public.deworming_doses
        where deworming_doses.line_id = wr_deworming_issue.line_id order by day
    loop
        given := coalesce(d.medication, given);
        need := case
            when given = l.medication then l.days
            when given in ('Milbeworm', 'Ivermectin') then 1
            else 3
        end;
        one_or_three := given in ('Albendazole', 'Pyrantel');
        if d.result = 'full' then
            run := case when given = previous then run + 1 else 1 end;
            previous := given;
            had_full := had_full or one_or_three;
            finished := finished or need = 1 or run >= 3;
        else
            finished := finished or (one_or_three and had_full and d.result is not null);
            run := 0;
            previous := null;
            if d.result is not null then
                words := words || ('Day ' || d.day || ' ' || case d.result
                    when 'none' then 'Miss'
                    when 'skipped' then 'Skipped'
                    else d.result || ' dose'
                end);
            end if;
        end if;
    end loop;

    if finished then
        return null;
    end if;
    return l.name || ': ' || coalesce(nullif(array_to_string(words, ', '), ''), 'course not completed');
end;
$$;

revoke all on function private.wr_deworming_issue(bigint) from public, anon, authenticated;

-- Check: should say ready
select 'ready' as deworming_one_or_three
where exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'wr_deworming_issue'
      and p.prosrc like '%Ivermectin%'
);
