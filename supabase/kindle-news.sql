-- Latest News for the Kindle page (2026-11-11): the Kindle dashboard's feed
-- (supabase/functions/kindle) reads Latest News with the server's own key, and
-- gets the staff version (details, moves, injuries), like a signed-in staff
-- member. Nothing else changes: visitors still see arrivals and releases only.
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs latest-news.sql first (it has been).

create or replace function public.latest_news(days int default 7)
returns table (
    happened_on  date,
    logged_at    timestamptz,
    kind         text,
    monkey_id    bigint,
    name         text,
    place        text,
    details      text
)
language sql
stable
security definer
set search_path = ''
as $$
    with settings as (
        select
            (now() at time zone 'Africa/Johannesburg')::date - (least(greatest(days, 1), 31) - 1) as since,
            -- (staff; or the Kindle page's feed, supabase/functions/kindle,
            -- which uses the server's own key)
            public.can_log_maintenance()
                or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' as staff
    ),
    news as (
        -- New arrivals
        select
            m.arrival_date as happened_on,
            m.created_at as logged_at,
            'arrival' as kind,
            m.id as monkey_id,
            m.name,
            private.field_text(to_jsonb(m), 'troop') as place,
            initcap(replace(m.arrival_reason, '_', ' ')) as details,
            m.status = 'sanctuary' as for_visitors
        from public.monkeys m
        where m.arrival_date >= (select since from settings)
        union all
        -- Status changes and moves
        select
            r.record_date,
            r.logged_at,
            case
                when r.category = 'movement' then 'movement'
                when r.details like 'Status changed from % to Released%' then 'released'
                else 'status'
            end,
            m.id,
            m.name,
            private.field_text(to_jsonb(m), 'troop'),
            r.details,
            r.category = 'status' and r.details like 'Status changed from % to Released%'
        from public.monkey_records r
        join public.monkeys m on m.id = r.monkey_id
        where r.category in ('movement', 'status')
          and r.record_date >= (select since from settings)
        union all
        -- New injuries
        select
            i.injury_date,
            i.logged_at,
            'injury',
            m.id,
            m.name,
            private.field_text(to_jsonb(m), 'troop'),
            i.description,
            false
        from public.injuries i
        join public.monkeys m on m.id = i.monkey_id
        where i.injury_date >= (select since from settings)
    )
    select
        n.happened_on,
        n.logged_at,
        n.kind,
        n.monkey_id,
        n.name,
        n.place,
        -- (visitors: no details)
        case when (select staff from settings) then n.details end
    from news n
    where (select staff from settings) or n.for_visitors
    order by n.happened_on desc, n.logged_at desc
    limit 300
$$;

-- Check: should say ready
select 'ready' as kindle_news;
