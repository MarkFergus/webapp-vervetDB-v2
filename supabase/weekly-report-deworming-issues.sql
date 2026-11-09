-- Weekly Reports: Deworming without the names (2026-11-09). Each list says
-- how many monkeys were on it, then only "No issues" or the issues (monkeys
-- who didn't get the full course, accidental doses). A missed dose reads
-- "Miss", as on the sheet (was "None").
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-report-deworming.sql first (it has been).

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
            when given = 'Milbeworm' then 1
            else 3
        end;
        if d.result = 'full' then
            run := case when given = previous then run + 1 else 1 end;
            previous := given;
            finished := finished or need = 1 or run >= 3;
        else
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

create or replace function private.wr_deworming(week_from date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with sheets as (
        select s.id, s.group_name, s.session, s.staff_names, s.started_on, s.days_done,
               coalesce(s.started_on, s.start_date) as first_day,
               case when exists (
                   select 1 from public.deworming_lines l
                   where l.sheet_id = s.id and (l.day_4 is true or exists (
                       select 1 from public.deworming_doses d where d.line_id = l.id and d.day = 4))
               ) then 4 else 3 end as days
        from public.deworming_sheets s
    ), worked as (
        select x.*, x.first_day + x.days - 1 as last_day,
               x.days_done @> array(select generate_series(1, x.days)::smallint) as all_done,
               private.full_place(x.group_name) || ' · ' || case x.session
                   when '6_month' then '6-Month'
                   when '6_month_fu' then '6-Month F/U'
                   when '3_month' then '3-Month'
                   else '3-Month F/U'
               end as title,
               (select count(*) from public.deworming_lines l where l.sheet_id = x.id and l.kind <> 'accidental') as monkeys,
               (select string_agg(m.name, ', ' order by m.name)
                from public.deworming_lines l join public.monkeys m on m.id = l.monkey_id
                where l.sheet_id = x.id and l.kind <> 'accidental') as names,
               (select array_agg(i order by i) from (
                    select private.wr_deworming_issue(l.id) as i
                    from public.deworming_lines l where l.sheet_id = x.id
                ) issues where i is not null) as issues
        from sheets x
    ), completed as (
        select * from worked where all_done and last_day between week_from and week_from + 6
    ), in_progress as (
        select * from worked
        where first_day <= least(week_from + 6, (now() at time zone 'Africa/Johannesburg')::date)
          and not (all_done and last_day <= week_from + 6)
    ), due as (
        -- (the same deworming entered day by day: once, on its first day)
        select c.title, c.starts_on
        from public.deworming_calendar c
        where c.starts_on between week_from + 7 and week_from + 20
          and not exists (
              select 1 from public.deworming_calendar e
              where lower(btrim(e.title)) = lower(btrim(c.title))
                and e.starts_on between c.starts_on - 7 and c.starts_on - 1
          )
    )
    select jsonb_build_object(
        'id', 'deworming', 'title', 'Deworming', 'missing', '[]'::jsonb,
        'groups', jsonb_build_array(
            jsonb_build_object('title', 'Completed', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    c.title || ' · ' || private.wr_day(c.first_day) || ' – ' || private.wr_day(c.last_day)
                        || private.wr_by(c.staff_names) || ' · ' || c.monkeys || case when c.monkeys = 1 then ' monkey' else ' monkeys' end,
                    case when c.issues is null then array['No issues'] else array['Issues:'] || c.issues end
                ) order by c.last_day, c.title)
                from completed c), '[]')),
            jsonb_build_object('title', 'In Progress', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    p.title || ' · ' || case when p.started_on is null then 'planned ' else 'started ' end
                        || private.wr_day(p.first_day) || private.wr_by(p.staff_names),
                    array[p.monkeys || case when p.monkeys = 1 then ' monkey' else ' monkeys' end
                        || ' · ' || case
                            when done.n = 0 then 'no days done yet'
                            else 'Day ' || done.n || ' of ' || p.days || ' done'
                        end]
                ) order by p.first_day, p.title)
                from in_progress p
                -- (the days done by the week's end, for an older week)
                cross join lateral (
                    select count(*) as n from unnest(p.days_done) dd where p.first_day + dd - 1 <= week_from + 6
                ) done), '[]')),
            jsonb_build_object('title', 'Due in the Next 2 Weeks', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    private.wr_day(d.starts_on) || ' · ' || private.full_place(d.title)
                ) order by d.starts_on, d.title)
                from due d), jsonb_build_array(private.wr_line('None due'))))
        )
    )
$$;

revoke all on function private.wr_deworming_issue(bigint) from public, anon, authenticated;
revoke all on function private.wr_deworming(date) from public, anon, authenticated;

-- Check: should say ready
select 'ready' as deworming_without_names;
