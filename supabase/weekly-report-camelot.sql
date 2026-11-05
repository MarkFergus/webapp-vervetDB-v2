-- Weekly Reports: Camelot's missing monkeys apart (2026-11-05). Camelot's so
-- large there are always some not seen, so they have their own list at the end
-- of Monitoring, not in red, and stay out of the main Not Seen list.
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-report-deworming.sql first (it has been).

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
                    from jsonb_array_elements(m -> 'not_seen') n
                    where n ->> 'troop' <> 'Camelot'), '[]')),
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
                        from jsonb_array_elements(m -> 'in_progress') s), '[]')),
                -- (so large there are always some not seen: apart, and not in red)
                jsonb_build_object('title', 'Camelot: Not Seen', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        (n ->> 'name') || ': not seen '
                            || (select string_agg(private.wr_day(d::date), ', ') from jsonb_array_elements_text(n -> 'dates') d)
                            || ' · ' || case
                                when (n ->> 'missed')::int >= 2 then 'not seen in ' || (n ->> 'missed') || ' sessions'
                                when (n ->> 'missed')::int > 0 then 'still not seen at the week''s end'
                                else 'seen again ' || private.wr_day((n ->> 'last_seen')::date)
                            end))
                    from jsonb_array_elements(m -> 'not_seen') n
                    where n ->> 'troop' = 'Camelot'), '[]'))
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

revoke all on function private.weekly_report_view(date, text[]) from public, anon, authenticated;

-- Check: should say ready
select 'ready' as weekly_report_camelot;
