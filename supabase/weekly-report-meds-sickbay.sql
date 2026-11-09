-- Weekly Reports, tidied (2026-11-09):
--   Monitoring    Troops Monitored: each troop, how many sessions and their
--                 dates (the Sessions part is gone). Alerts: every issue from
--                 the sessions (any check that wasn't good, and what the
--                 session said needs doing). Not Seen (and Camelot's): only
--                 those still missing at the week's end.
--   Meds & Sickbay (new, after Monitoring, ticked for everyone): who's in
--                 Sickbay and who's staying in an introcage at the week's end
--                 (since when, how many days, why), who came into or left
--                 Sickbay that week, and who went back to their troop from an
--                 introcage (how long they stayed). From the Movement records.
-- Safe to run more than once.
--
-- Run this BEFORE the new version is pushed (the settings page offers
-- Meds & Sickbay).
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-report-jobs.sql, weekly-report-deworming-issues.sql and
-- movement-places.sql first (they have been).

begin;

------------------------------------------------------------------------
-- Meds & Sickbay can be ticked, and is for everyone already set up
------------------------------------------------------------------------
alter table public.weekly_report_settings drop constraint if exists weekly_report_settings_sections_check;
alter table public.weekly_report_settings
    add constraint weekly_report_settings_sections_check
        check (sections <@ array['monitoring', 'meds_sickbay', 'baby_care', 'integration', 'deworming', 'maintenance']),
    alter column sections set default array['monitoring', 'meds_sickbay', 'baby_care', 'integration', 'deworming', 'maintenance'];

update public.weekly_report_settings
set sections = array_append(sections, 'meds_sickbay')
where not ('meds_sickbay' = any (sections)) and cardinality(sections) > 0;

drop function if exists private.wr_seen_again(jsonb, boolean);

------------------------------------------------------------------------
-- The Meds & Sickbay section (see the top)
------------------------------------------------------------------------
-- A Movement record's reason: "Moved from Gismo Troop to Sickbay: bite on
-- left arm" → "bite on left arm" (or null)
create or replace function private.wr_move_reason(details text)
returns text
language sql
immutable
set search_path = ''
as $$
    select nullif(btrim(substring(details from '^Moved from .+? to .+?: (.*)$')), '')
$$;

create or replace function private.wr_sickbay(week_from date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with moves as (
        select r.id, r.monkey_id, r.record_date as day, r.details, r.from_place, r.to_place,
               r.from_place_id, r.to_place_id, r.move_kind, mk.name,
               private.wr_who(mk.name, private.full_place(coalesce(t.name, h.name))) as who,
               mk.introcage_id as home_id
        from public.monkey_records r
        join public.monkeys mk on mk.id = r.monkey_id
        left join public.troops t on t.id = mk.troop_id
        left join public.enclosures h on h.id = mk.introcage_id
        where r.category = 'movement'
    ),
    -- the day each move happened, and when they'd got there (the move before)
    with_start as (
        select m.*,
               (select max(p.day) from moves p
                where p.monkey_id = m.monkey_id and p.to_place = m.from_place and p.day <= m.day and p.id <> m.id) as arrived
        from moves m
    ),
    -- where each monkey was at the week's end: their last move by then
    last_move as (
        select distinct on (monkey_id) *
        from moves
        where day <= week_from + 6
        order by monkey_id, day desc, id desc
    ),
    week_end as (select least(week_from + 6, (now() at time zone 'Africa/Johannesburg')::date) as day),
    in_sickbay as (
        select l.* from last_move l where l.to_place = 'Sickbay'
    ),
    staying as (
        select l.* from last_move l
        join public.enclosures e on e.id = l.to_place_id and e.type = 'introcage'
        where l.move_kind = 'move' and l.to_place_id is distinct from l.home_id
    ),
    days_text as (
        select n, case when n = 1 then '1 day' else n || ' days' end as words
        from generate_series(0, 3650) n
    )
    select jsonb_build_object(
        'id', 'meds_sickbay', 'title', 'Meds & Sickbay', 'missing', '[]'::jsonb,
        'groups', jsonb_build_array(
            jsonb_build_object('title', 'In Sickbay', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    s.who || ' · since ' || private.wr_day(s.day) || ' · ' || d.words,
                    array[private.wr_move_reason(s.details)]
                ) order by s.day, s.name)
                from in_sickbay s cross join week_end w join days_text d on d.n = w.day - s.day), '[]')),
            jsonb_build_object('title', 'Came Into Sickbay', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    private.wr_day(m.day) || ' · ' || m.who || coalesce(' · from ' || m.from_place, '')
                ) order by m.day, m.name)
                from moves m where m.to_place = 'Sickbay' and m.day between week_from and week_from + 6), '[]')),
            jsonb_build_object('title', 'Left Sickbay', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    private.wr_day(m.day) || ' · ' || m.who || coalesce(' · back to ' || m.to_place, '')
                        || coalesce(' · ' || d.words || ' in Sickbay', '')
                ) order by m.day, m.name)
                from with_start m left join days_text d on d.n = m.day - m.arrived
                where m.from_place = 'Sickbay' and m.day between week_from and week_from + 6), '[]')),
            jsonb_build_object('title', 'In an Introcage', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    s.who || ' · ' || s.to_place || ' · since ' || private.wr_day(s.day) || ' · ' || d.words,
                    array[private.wr_move_reason(s.details)]
                ) order by s.day, s.name)
                from staying s cross join week_end w join days_text d on d.n = w.day - s.day), '[]')),
            jsonb_build_object('title', 'Back to Troop', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    private.wr_day(m.day) || ' · ' || m.who || ' · ' || m.from_place || ' → ' || m.to_place
                        || coalesce(' · ' || d.words || ' in the introcage', '')
                ) order by m.day, m.name)
                from with_start m
                join public.enclosures e on e.id = m.from_place_id and e.type = 'introcage'
                left join days_text d on d.n = m.day - m.arrived
                where m.move_kind = 'move' and m.to_place like '% Troop'
                  and m.day between week_from and week_from + 6), '[]'))
        )
    )
$$;

revoke all on function private.wr_move_reason(text) from public, anon, authenticated;
revoke all on function private.wr_sickbay(date) from public, anon, authenticated;

------------------------------------------------------------------------
-- The report's lines (as in weekly-report-jobs.sql, with the changes above)
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
                -- each troop monitored: how many sessions, and their dates
                jsonb_build_object('title', 'Troops Monitored', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        t.troop || ' · ' || case when t.n = 1 then '1 session' else t.n || ' sessions' end
                            || ' · ' || t.dates
                    ) order by t.first_day, t.troop)
                    from (
                        select s ->> 'troop' as troop, count(*) as n, min((s ->> 'date')::date) as first_day,
                               string_agg(private.wr_day((s ->> 'date')::date)
                                   || case when s ->> 'status' <> 'finished' then ' (In Progress)' else '' end,
                                   ', ' order by (s ->> 'date')::date) as dates
                        from jsonb_array_elements(m -> 'sessions') s
                        group by s ->> 'troop'
                    ) t), '[]')),
                -- (still missing at the week's end: those seen again since aren't
                -- listed)
                jsonb_build_object('title', 'Not Seen', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_who(n ->> 'name', n ->> 'troop') || ': not seen '
                            || (select string_agg(private.wr_day(d::date), ', ') from jsonb_array_elements_text(n -> 'dates') d)
                            || ' · ' || case
                                when (n ->> 'missed')::int >= 2 then 'not seen last ' || (n ->> 'missed') || ' sessions'
                                else 'still not seen at the week''s end'
                            end,
                        null, true))
                    from jsonb_array_elements(m -> 'not_seen') n
                    where n ->> 'troop' <> 'Camelot' and (n ->> 'missed')::int > 0), '[]')),
                -- every issue from the sessions: a check that wasn't good, and
                -- what the session said needs doing (Maintenance)
                jsonb_build_object('title', 'Alerts', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(a.words, null, true) order by a.day, a.troop, a.n)
                    from (
                        select (s ->> 'date')::date as day, s ->> 'troop' as troop, c.n,
                               private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'troop') || ' · ' || c.words as words
                        from jsonb_array_elements(m -> 'sessions') s
                        cross join lateral (values
                            (1, case when s ->> 'fence' <> 'good' then private.wr_check('fence', s ->> 'fence', s ->> 'fence_note') end),
                            (2, case when s ->> 'waters' <> 'good' then private.wr_check('waters', s ->> 'waters', s ->> 'waters_note') end),
                            (3, case when s ->> 'food' <> 'good' then private.wr_check('food', s ->> 'food', s ->> 'food_note') end),
                            (4, 'Maintenance: ' || nullif(btrim(s ->> 'maintenance'), ''))
                        ) as c (n, words)
                        where s ->> 'status' = 'finished' and c.words is not null
                    ) a), '[]')),
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
                        from jsonb_array_elements(m -> 'in_progress') s), '[]')),
                -- (so large there are always some not seen: apart, and not in red)
                jsonb_build_object('title', 'Camelot: Not Seen', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        (n ->> 'name') || ': not seen '
                            || (select string_agg(private.wr_day(d::date), ', ') from jsonb_array_elements_text(n -> 'dates') d)
                            || ' · ' || case
                                when (n ->> 'missed')::int >= 2 then 'not seen last ' || (n ->> 'missed') || ' sessions'
                                else 'still not seen at the week''s end'
                            end))
                    from jsonb_array_elements(m -> 'not_seen') n
                    where n ->> 'troop' = 'Camelot' and (n ->> 'missed')::int > 0), '[]'))
            )
        ));
    end if;

    if 'meds_sickbay' = any (sections) then
        parts := parts || jsonb_build_array(private.wr_sickbay(week_from));
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
                private.wr_jobs(week_from),
                jsonb_build_object('title', 'Maintenance Completed', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((d ->> 'date')::date) || ' · ' || (d ->> 'place')
                            || coalesce(' · ' || initcap(d ->> 'kind'), '') || private.wr_by(d ->> 'by'),
                        private.wr_details(d ->> 'details')))
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

revoke all on function private.weekly_report_view(date, text[]) from public, anon, authenticated;

commit;

-- Check: should say ready
select 'ready' as weekly_report_tidy
where private.weekly_report_view(current_date - 7, array['meds_sickbay']) -> 'sections' -> 0 ->> 'title' = 'Meds & Sickbay';
