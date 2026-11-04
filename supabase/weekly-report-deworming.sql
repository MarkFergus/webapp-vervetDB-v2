-- Weekly Reports: the Deworming section (2026-11-04), between Integration
-- and Maintenance. For each week:
--   Completed            lists whose last day (Day 3, or Day 4 if anyone had
--                        one) was that week and is saved complete, whether
--                        or not they've been submitted: who was on them (15
--                        monkeys or fewer: their names; more: how many) and
--                        any issues: monkeys who didn't get the full course,
--                        and accidental doses
--   In Progress          lists started by the week's end, not completed by it
--   Due in the Next 2 Weeks   Outlook's deworming events in the 14 days after
--                        the week, with their titles as written there
-- Admins who already have Weekly Reports set up get Deworming ticked (they
-- can untick it).
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-report-email.sql, deworming-additions.sql and
-- deworming-calendar.sql to have been run first (they have been).

begin;

------------------------------------------------------------------------
-- Deworming can be ticked, and is for everyone already set up
------------------------------------------------------------------------
alter table public.weekly_report_settings drop constraint if exists weekly_report_settings_sections_check;
alter table public.weekly_report_settings
    add constraint weekly_report_settings_sections_check
        check (sections <@ array['monitoring', 'baby_care', 'integration', 'deworming', 'maintenance']),
    alter column sections set default array['monitoring', 'baby_care', 'integration', 'deworming', 'maintenance'];

update public.weekly_report_settings
set sections = array_append(sections, 'deworming')
where not ('deworming' = any (sections)) and cardinality(sections) > 0;

------------------------------------------------------------------------
-- A monkey's issue on a list, or null if they had the full course:
--   "Bruno: Day 2 1/2 dose, Day 3 Skipped"
-- The full course (as dewormingRules.js has it): one full dose of a one-day
-- dewormer, or full doses of the same dewormer on 3 days in a row.
------------------------------------------------------------------------
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
                    when 'none' then 'None'
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

------------------------------------------------------------------------
-- A week's Deworming section (see the top)
------------------------------------------------------------------------
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
                        || private.wr_by(c.staff_names),
                    array[case when c.monkeys > 15 then c.monkeys || ' monkeys' else c.names end]
                        || case when c.issues is null then array['No issues'] else array['Issues:'] || c.issues end
                ) order by c.last_day, c.title)
                from completed c), '[]')),
            jsonb_build_object('title', 'In Progress', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    p.title || ' · ' || case when p.started_on is null then 'planned ' else 'started ' end
                        || private.wr_day(p.first_day) || private.wr_by(p.staff_names),
                    array[case when p.monkeys > 15 then p.monkeys || ' monkeys' else p.names end
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

------------------------------------------------------------------------
-- The report's lines: as in weekly-report-email.sql, with Deworming
------------------------------------------------------------------------
create or replace function private.weekly_report_view(week_from date, sections text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    r jsonb := private.weekly_report(week_from);
    m jsonb := r -> 'monitoring';
    b jsonb := r -> 'baby_care';
    i jsonb := r -> 'integration';
    x jsonb := r -> 'maintenance';
    parts jsonb := '[]';
begin
    if 'monitoring' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'monitoring', 'title', 'Monitoring', 'missing', m -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Troops Monitored', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(t ->> 'troop' || ' · ' ||
                        case when (t ->> 'sessions')::int = 1 then '1 session' else (t ->> 'sessions') || ' sessions' end))
                    from jsonb_array_elements(m -> 'troops') t where (t ->> 'sessions')::int > 0), '[]')),
                jsonb_build_object('title', 'Sessions', 'lines', coalesce((
                    select jsonb_agg(case
                        when s ->> 'status' <> 'finished' then
                            private.wr_line(private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'troop')
                                || private.wr_by(s ->> 'by') || ' · In Progress')
                        else
                            private.wr_line(
                                private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'troop') || private.wr_by(s ->> 'by')
                                    || ' · ' || (s ->> 'seen') || ' seen, ' || (s ->> 'not_seen') || ' not seen',
                                array[
                                    private.wr_check('fence', s ->> 'fence', s ->> 'fence_note') || ' · '
                                        || private.wr_check('waters', s ->> 'waters', s ->> 'waters_note') || ' · '
                                        || private.wr_check('food', s ->> 'food', s ->> 'food_note'),
                                    'Maintenance: ' || (s ->> 'maintenance'),
                                    'Notes: ' || (s ->> 'notes')
                                ])
                        end)
                    from jsonb_array_elements(m -> 'sessions') s), '[]')),
                jsonb_build_object('title', 'Not Seen', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_who(n ->> 'name', n ->> 'troop') || ': not seen '
                            || (select string_agg(private.wr_day(d::date), ', ') from jsonb_array_elements_text(n -> 'dates') d)
                            || ' · ' || case
                                when (n ->> 'missed')::int >= 2 then 'Must See'
                                when (n ->> 'missed')::int > 0 then 'still not seen at the week''s end'
                                else 'seen again ' || private.wr_day((n ->> 'last_seen')::date)
                            end,
                        null, (n ->> 'missed')::int > 0))
                    from jsonb_array_elements(m -> 'not_seen') n), '[]')),
                jsonb_build_object('title', 'Alerts', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((a ->> 'date')::date) || ' · ' || (a ->> 'troop') || ' · '
                            || private.wr_check(a ->> 'check', a ->> 'value', a ->> 'note'), null, true))
                    from jsonb_array_elements(m -> 'alerts') a), '[]')),
                jsonb_build_object('title', 'New Injuries', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((j ->> 'date')::date) || ' · ' || private.wr_who(j ->> 'name', j ->> 'troop')
                            || ': ' || (j ->> 'description') || private.wr_by(j ->> 'by')))
                    from jsonb_array_elements(m -> 'injuries') j), '[]')),
                jsonb_build_object('title', 'Needs Attention', 'lines',
                    coalesce((
                        select jsonb_agg(private.wr_line(
                            private.wr_who(j ->> 'name', j ->> 'troop') || ': ' || (j ->> 'description')
                                || ' · no injury update since ' || private.wr_day((j ->> 'since')::date), null, true))
                        from jsonb_array_elements(m -> 'stale_injuries') j), '[]')
                    || coalesce((
                        select jsonb_agg(private.wr_line(
                            (s ->> 'troop') || ': session from ' || private.wr_day((s ->> 'date')::date)
                                || ' still In Progress' || private.wr_by(s ->> 'by'), null, true))
                        from jsonb_array_elements(m -> 'in_progress') s), '[]'))
            )
        ));
    end if;

    if 'baby_care' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'baby_care', 'title', 'Baby Care', 'missing', b -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Milk Totals', 'lines', '[]'::jsonb, 'table', case
                    when jsonb_array_length(b -> 'babies') > 0 then jsonb_build_object(
                        'head', jsonb_build_array('') || (
                            select jsonb_agg(to_char(d::date, 'Dy FMDD')) from jsonb_array_elements_text(b -> 'days') d
                        ) || jsonb_build_array('Total'),
                        'rows', (
                            select jsonb_agg(jsonb_build_array(baby ->> 'name') || (
                                select jsonb_agg(coalesce(baby -> 'milk' ->> d, '–'))
                                from jsonb_array_elements_text(b -> 'days') d
                            ) || jsonb_build_array(coalesce(private.wr_number((baby ->> 'milk_total')::numeric) || ' ml', '–')))
                            from jsonb_array_elements(b -> 'babies') baby
                        ))
                    end),
                jsonb_build_object('title', 'Weights', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        (baby ->> 'name') || ': ' || private.wr_number((w ->> 'grams')::numeric) || ' g on '
                            || private.wr_day((w ->> 'date')::date) || ' (' || case
                                when w ->> 'change' is null then 'first weight'
                                when (w ->> 'change')::int > 0 then '+' || private.wr_number((w ->> 'change')::numeric) || ' g'
                                when (w ->> 'change')::int < 0 then '−' || private.wr_number(abs((w ->> 'change')::numeric)) || ' g'
                                else '±0 g'
                            end || ')'))
                    from jsonb_array_elements(b -> 'babies') baby, jsonb_array_elements(baby -> 'weights') w), '[]')),
                jsonb_build_object('title', 'Moves', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((v ->> 'date')::date) || ' · ' || (v ->> 'name') || ': ' || (v ->> 'details')))
                    from jsonb_array_elements(b -> 'moves') v), '[]'))
            )
        ));
    end if;

    if 'integration' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'integration', 'title', 'Integration', 'missing', i -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Reports', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        (p ->> 'name') || ' · ' || case
                            when p ->> 'from' = p ->> 'to' then private.wr_day((p ->> 'from')::date)
                            else private.wr_day((p ->> 'from')::date) || ' – ' || private.wr_day((p ->> 'to')::date)
                        end || private.wr_by(p ->> 'by'),
                        array[p ->> 'report']))
                    from jsonb_array_elements(i -> 'reports') p), '[]')),
                jsonb_build_object('title', 'New Integrations', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'name') || ' · '
                            || case s ->> 'kind' when 'foster_mum' then 'Foster-Mum' else initcap(s ->> 'kind') end
                            || private.wr_by(s ->> 'by')))
                    from jsonb_array_elements(i -> 'started') s), '[]')),
                jsonb_build_object('title', 'Status Changes', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'name') || ' · '
                            || initcap(replace(s ->> 'status', '_', ' '))))
                    from jsonb_array_elements(i -> 'statuses') s), '[]'))
            )
        ));
    end if;

    if 'deworming' = any (sections) then
        parts := parts || jsonb_build_array(private.wr_deworming(week_from));
    end if;

    if 'maintenance' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'maintenance', 'title', 'Maintenance', 'missing', x -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Maintenance Completed', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((d ->> 'date')::date) || ' · ' || (d ->> 'place')
                            || coalesce(' · ' || initcap(d ->> 'kind'), '') || private.wr_by(d ->> 'by'),
                        array[d ->> 'details']))
                    from jsonb_array_elements(x -> 'done') d), '[]'))
            )
        ));
    end if;

    return jsonb_build_object(
        'title', 'Weekly Report: ' || private.wr_day(week_from) || ' – ' || private.wr_day(week_from + 6),
        'ended', r -> 'ended',
        'sections', parts
    );
end;
$$;

revoke all on function private.wr_deworming_issue(bigint), private.wr_deworming(date),
    private.weekly_report_view(date, text[])
    from public, anon, authenticated;

commit;

-- Check: last week's report has its Deworming section (should say Deworming)
select private.wr_deworming(current_date - 7) ->> 'title' as section;
