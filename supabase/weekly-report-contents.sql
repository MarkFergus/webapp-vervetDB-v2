-- Weekly Reports: what's in a week's report (Admin Dashboard → Weekly
-- Reports → Past Reports: View and Download PDF; the weekly email later).
--   public.weekly_report(week_from)   admins only: the 7 days from week_from
--                                     (midnight to midnight), every section
-- Everything goes by its own date (a session's date, a milk total's day…),
-- not when it was typed in. Each section lists the week's records, then
-- what's missing:
--   Monitoring    a troop with no finished session that week
--   Baby Care     each baby: a day with no milk total (from the day after it
--                 arrived, up to yesterday), and no weight that week (one
--                 that arrived before the week started)
--   Integration   one going on all week with no report for the week
--   Maintenance   no maintenance at all that week
-- A week that isn't over yet: only the days so far count (the rest of the
-- missing checks wait for the week to end).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-reports.sql to have been run first.

begin;

-- "H&B A" → "Holt & Barrington A", as the website shows them
create or replace function private.full_place(name text)
returns text
language sql
immutable
set search_path = ''
as $$
    select regexp_replace(regexp_replace(name, '^H&B', 'Holt & Barrington'), '^D&D', 'Dino & Daniel')
$$;

create or replace function private.weekly_report(week_from date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    week_to date := week_from + 6;
    today date := (now() at time zone 'Africa/Johannesburg')::date;
    -- the week's over (every missing check counts)
    ended boolean := week_to < today;
    monitoring_part jsonb;
    baby_part jsonb;
    integration_part jsonb;
    maintenance_part jsonb;
    -- Baby Care's areas (Dreamland, Neverland, Disneyland)
    baby_areas text[];
begin
    --------------------------------------------------------------------
    -- Monitoring
    --------------------------------------------------------------------
    with sessions as (
        select s.*, e.name as troop
        from public.monitoring_sessions s
        join public.enclosures e on e.id = s.enclosure_id
        where s.session_date between week_from and week_to
    ),
    finished as (
        select * from sessions where status = 'finished'
    ),
    -- each monkey's sightings up to the week's end: in a session, or Mark As Seen
    sightings as (
        select ms.monkey_id, s.session_date as on_date, ms.seen
        from public.monitoring_sightings ms
        join public.monitoring_sessions s on s.id = ms.session_id
        where s.status = 'finished' and s.session_date <= week_to
    ),
    spots as (
        select monkey_id, max(seen_on) as on_date
        from public.monkey_sightings
        where seen_on <= week_to
        group by monkey_id
    ),
    last_seen as (
        select m.monkey_id, greatest(
            (select max(x.on_date) from sightings x where x.monkey_id = m.monkey_id and x.seen),
            (select sp.on_date from spots sp where sp.monkey_id = m.monkey_id)
        ) as on_date
        from (select distinct monkey_id from sightings) m
    ),
    -- not seen in a session that week
    not_seen as (
        select ms.monkey_id, mk.name, f.troop,
               array_agg(f.session_date order by f.session_date) as dates
        from finished f
        join public.monitoring_sightings ms on ms.session_id = f.id and not ms.seen
        join public.monkeys mk on mk.id = ms.monkey_id
        group by ms.monkey_id, mk.name, f.troop
    )
    select jsonb_build_object(
        'sessions', coalesce((
            select jsonb_agg(jsonb_build_object(
                'date', session_date, 'troop', private.full_place(troop), 'by', started_by_name,
                'status', status, 'fence', fence, 'waters', waters, 'food', food,
                'fence_note', fence_note, 'waters_note', waters_note, 'food_note', food_note,
                'maintenance', maintenance, 'notes', notes,
                'seen', (select count(*) from public.monitoring_sightings ms where ms.session_id = sessions.id and ms.seen),
                'not_seen', (select count(*) from public.monitoring_sightings ms where ms.session_id = sessions.id and not ms.seen)
            ) order by session_date, troop)
            from sessions
        ), '[]'),
        -- every troop, and how many sessions it had
        'troops', coalesce((
            select jsonb_agg(jsonb_build_object(
                'troop', private.full_place(e.name),
                'sessions', (select count(*) from finished f where f.enclosure_id = e.id)
            ) order by e.sort_order, e.name)
            from public.enclosures e where e.type = 'troop'
        ), '[]'),
        'not_seen', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', n.name, 'troop', private.full_place(n.troop), 'dates', to_jsonb(n.dates),
                'last_seen', ls.on_date,
                -- sessions in a row it's been missed, up to the week's end
                'missed', (select count(*) from sightings x
                           where x.monkey_id = n.monkey_id and not x.seen
                             and x.on_date > coalesce(ls.on_date, '-infinity'::date))
            ) order by n.troop, n.name)
            from not_seen n left join last_seen ls on ls.monkey_id = n.monkey_id
        ), '[]'),
        'alerts', coalesce((
            select jsonb_agg(a order by a ->> 'date', a ->> 'troop')
            from (
                select jsonb_build_object('date', session_date, 'troop', private.full_place(troop),
                                          'check', 'fence', 'value', fence, 'note', fence_note) as a
                from finished where fence = 'not_working'
                union all
                select jsonb_build_object('date', session_date, 'troop', private.full_place(troop),
                                          'check', 'waters', 'value', waters, 'note', waters_note)
                from finished where waters = 'bad'
                union all
                select jsonb_build_object('date', session_date, 'troop', private.full_place(troop),
                                          'check', 'food', 'value', food, 'note', food_note)
                from finished where food in ('low', 'too_much')
            ) alerts
        ), '[]'),
        'injuries', coalesce((
            select jsonb_agg(jsonb_build_object(
                'date', i.injury_date, 'name', mk.name, 'troop', t.name,
                'description', i.description, 'by', i.logged_by_name
            ) order by i.injury_date, mk.name)
            from public.injuries i
            join public.monkeys mk on mk.id = i.monkey_id
            left join public.troops t on t.id = mk.troop_id
            where i.injury_date between week_from and week_to
        ), '[]'),
        -- Needs Attention: injuries not healed by the week's end with no
        -- update for 14 days, and sessions left in progress
        'stale_injuries', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', x.name, 'troop', x.troop, 'description', x.description, 'since', x.since
            ) order by x.since, x.name)
            from (
                select mk.name, t.name as troop, i.description,
                       greatest(i.injury_date, (select max(u.update_date) from public.injury_updates u
                                                where u.injury_id = i.id and u.update_date <= week_to)) as since
                from public.injuries i
                join public.monkeys mk on mk.id = i.monkey_id
                left join public.troops t on t.id = mk.troop_id
                where i.injury_date <= week_to
                  and (i.healed_on is null or i.healed_on > week_to)
                  and mk.status = 'sanctuary'
            ) x
            where x.since <= least(week_to, today) - 14
        ), '[]'),
        'in_progress', coalesce((
            select jsonb_agg(jsonb_build_object('date', session_date, 'troop', private.full_place(troop), 'by', started_by_name)
                             order by session_date)
            from sessions where status = 'in_progress'
        ), '[]'),
        'missing', coalesce((
            select jsonb_agg(private.full_place(e.name) || ': not monitored this week' order by e.sort_order, e.name)
            from public.enclosures e
            where ended and e.type = 'troop'
              and not exists (select 1 from finished f where f.enclosure_id = e.id)
        ), '[]')
    ) into monitoring_part;

    --------------------------------------------------------------------
    -- Baby Care
    --------------------------------------------------------------------
    select coalesce(array_agg(a.name), '{}') into baby_areas
    from public.enclosures a
    join public.enclosures u on u.id = a.parent_id
    where u.type = 'care_unit' and u.name = 'Baby Care';

    with babies as (
        -- living in Baby Care now (its areas), or with a milk total or
        -- weight that week
        select mk.id, mk.name, mk.arrival_date,
               (mk.status = 'sanctuary' and a.name = any (baby_areas)) as here
        from public.monkeys mk
        left join public.enclosures a on a.id = mk.introcage_id
        where (mk.status = 'sanctuary' and a.name = any (baby_areas))
           or exists (select 1 from public.milk_totals t where t.monkey_id = mk.id and t.milk_date between week_from and week_to)
           or exists (select 1 from public.weights w where w.monkey_id = mk.id and w.weigh_date between week_from and week_to)
    ),
    days as (
        select d::date as day from generate_series(week_from, week_to, interval '1 day') d
    )
    select jsonb_build_object(
        'days', (select jsonb_agg(day order by day) from days),
        'babies', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', b.name,
                'milk', (select coalesce(jsonb_object_agg(t.milk_date, t.total_ml), '{}')
                         from public.milk_totals t where t.monkey_id = b.id and t.milk_date between week_from and week_to),
                'milk_total', (select sum(t.total_ml) from public.milk_totals t
                               where t.monkey_id = b.id and t.milk_date between week_from and week_to),
                'weights', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'date', w.weigh_date, 'grams', w.grams,
                        'change', w.grams - (select p.grams from public.weights p
                                             where p.monkey_id = b.id and p.weigh_date < w.weigh_date
                                             order by p.weigh_date desc limit 1)
                    ) order by w.weigh_date)
                    from public.weights w where w.monkey_id = b.id and w.weigh_date between week_from and week_to
                ), '[]')
            ) order by b.name)
            from babies b
        ), '[]'),
        'moves', coalesce((
            select jsonb_agg(jsonb_build_object('date', r.record_date, 'name', mk.name, 'details', r.details)
                             order by r.record_date, mk.name)
            from public.monkey_records r
            join public.monkeys mk on mk.id = r.monkey_id
            left join public.enclosures a on a.id = mk.introcage_id
            where r.category in ('movement', 'status')
              and r.record_date between week_from and week_to
              and (a.name = any (baby_areas)
                   or exists (select 1 from unnest(baby_areas) n where r.details like '%' || n || '%'))
        ), '[]'),
        'missing', coalesce((
            select jsonb_agg(line order by name, kind)
            from (
                -- a day with no milk total (from the day after it arrived, up to yesterday)
                select b.name, 1 as kind, b.name || ': no milk total ' || string_agg(to_char(d.day, 'Dy FMDD Mon'), ', ' order by d.day) as line
                from babies b cross join days d
                where b.here
                  and d.day < today
                  and (b.arrival_date is null or d.day > b.arrival_date)
                  and not exists (select 1 from public.milk_totals t where t.monkey_id = b.id and t.milk_date = d.day)
                group by b.name
                union all
                -- not weighed that week
                select b.name, 2, b.name || ': not weighed this week'
                from babies b
                where b.here and ended
                  and (b.arrival_date is null or b.arrival_date < week_from)
                  and not exists (select 1 from public.weights w where w.monkey_id = b.id and w.weigh_date between week_from and week_to)
            ) lines
        ), '[]')
    ) into baby_part;

    --------------------------------------------------------------------
    -- Integration
    --------------------------------------------------------------------
    select jsonb_build_object(
        'reports', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', mk.name, 'from', r.from_date, 'to', r.to_date, 'report', r.report, 'by', r.logged_by_name
            ) order by r.to_date, mk.name)
            from public.integration_reports r
            join public.monkeys mk on mk.id = r.monkey_id
            where r.from_date <= week_to and r.to_date >= week_from
        ), '[]'),
        'started', coalesce((
            select jsonb_agg(jsonb_build_object('name', mk.name, 'date', i.started_on, 'kind', i.kind, 'by', i.logged_by_name)
                             order by i.started_on, mk.name)
            from public.integrations i
            join public.monkeys mk on mk.id = i.monkey_id
            where i.started_on between week_from and week_to
        ), '[]'),
        -- (each integration's latest Status Update)
        'statuses', coalesce((
            select jsonb_agg(jsonb_build_object('name', mk.name, 'date', i.status_on, 'status', i.status, 'kind', i.kind)
                             order by i.status_on, mk.name)
            from public.integrations i
            join public.monkeys mk on mk.id = i.monkey_id
            where i.status_on between week_from and week_to
        ), '[]'),
        'missing', coalesce((
            select jsonb_agg(mk.name || ': no integration report this week' order by mk.name)
            from public.integrations i
            join public.monkeys mk on mk.id = i.monkey_id
            where ended
              and i.started_on <= week_from
              and (i.ended_on is null or i.ended_on > week_to)
              and not exists (select 1 from public.integration_reports r
                              where r.monkey_id = i.monkey_id and r.from_date <= week_to and r.to_date >= week_from)
        ), '[]')
    ) into integration_part;

    --------------------------------------------------------------------
    -- Maintenance
    --------------------------------------------------------------------
    select jsonb_build_object(
        'done', coalesce((
            select jsonb_agg(jsonb_build_object(
                'date', x.done_on, 'place', private.full_place(e.name), 'kind', x.kind, 'details', x.details, 'by', x.logged_by_name
            ) order by x.done_on, e.name)
            from public.maintenance x
            join public.enclosures e on e.id = x.enclosure_id
            where x.done_on between week_from and week_to
        ), '[]')
    ) into maintenance_part;
    maintenance_part := maintenance_part || jsonb_build_object('missing',
        case when ended and jsonb_array_length(maintenance_part -> 'done') = 0
             then '["No maintenance reports this week"]'::jsonb else '[]'::jsonb end);

    return jsonb_build_object(
        'from', week_from,
        'to', week_to,
        'ended', ended,
        'monitoring', monitoring_part,
        'baby_care', baby_part,
        'integration', integration_part,
        'maintenance', maintenance_part
    );
end;
$$;

revoke all on function private.weekly_report(date) from public, anon, authenticated;

-- For the website: admins only
create or replace function public.weekly_report(week_from date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Weekly Reports are for admins only' using errcode = '42501';
    end if;
    return private.weekly_report(week_from);
end;
$$;

revoke all on function public.weekly_report(date) from public, anon;
grant execute on function public.weekly_report(date) to authenticated;

commit;

-- Check: last week's report has all four sections (should say true)
select private.weekly_report(current_date - 7) ?& array['monitoring', 'baby_care', 'integration', 'maintenance'] as ready;
