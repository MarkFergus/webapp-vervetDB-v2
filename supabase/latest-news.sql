-- Latest News, Favourites and each monkey's Recent Edits.
--
-- 1. Favourites: the ☆ on a monkey's photo. Each signed-in account keeps its
--    own list (visitors' favourites stay on their device, in the website).
--      user_id / monkey_id   whose favourite, and which monkey
--    Everyone can only see, add and remove their own.
--
-- 2. Latest News (#news): what happened in the last few days, newest first:
--      arrival    a new monkey arrived (its Arrival Date)
--      released   released to the wild (a Status record)
--      status     any other status change: Deceased, Escaped, Missing,
--                 back at the sanctuary (a Status record)
--      movement   a move (a Movement record)
--      injury     a new injury
--    Visitors (not signed in) get only the arrivals still at the sanctuary
--    and the releases, without the details; staff (any role) get it all.
--
-- 3. Recent Edits: a monkey's profile edits in the last 7 days (from the
--    change history, change-history.sql), with who made them. Staff only.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monkey-archive.sql, arrival-details.sql, injuries.sql and
-- names.sql to have been run first (they have been).

begin;

------------------------------------------------------------------------
-- 1. Favourites
------------------------------------------------------------------------
create table public.favourites (
    user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
    monkey_id   bigint not null references public.monkeys (id) on delete cascade,
    added_at    timestamptz not null default now(),
    primary key (user_id, monkey_id)
);

alter table public.favourites enable row level security;

create policy "Everyone reads their own favourites"
    on public.favourites for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Everyone adds their own favourites"
    on public.favourites for insert to authenticated
    with check (user_id = (select auth.uid()));

create policy "Everyone removes their own favourites"
    on public.favourites for delete to authenticated
    using (user_id = (select auth.uid()));

grant select, delete on public.favourites to authenticated;
-- (only the monkey: the account is always the one signed in)
grant insert (monkey_id) on public.favourites to authenticated;

------------------------------------------------------------------------
-- 2. Latest News
------------------------------------------------------------------------
-- days: 2, 7 or 14 (today and the days before it; up to 31)
create function public.latest_news(days int default 7)
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
            public.can_log_maintenance() as staff
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

revoke all on function public.latest_news(int) from public;
grant execute on function public.latest_news(int) to anon, authenticated;

------------------------------------------------------------------------
-- 3. Recent Edits
------------------------------------------------------------------------
-- A few more fields than the summary email lists (from later files):
-- "Species: Vervet → Samango" and so on
create function private.more_change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    fields text[] := array['species', 'birth_date', 'arrival_date', 'arrival_reason'];
    labels text[] := array['Species', 'Birth Date', 'Arrival Date', 'Arrival Reason'];
    lines text[] := '{}';
    before_text text;
    after_text text;
begin
    if old_row is null or new_row is null then
        return lines;
    end if;
    for i in 1 .. array_length(fields, 1) loop
        before_text := initcap(replace(old_row ->> fields[i], '_', ' '));
        after_text := initcap(replace(new_row ->> fields[i], '_', ' '));
        if before_text is distinct from after_text then
            lines := lines || (labels[i] || ': ' || private.shown(before_text) || ' → ' || private.shown(after_text));
        end if;
    end loop;
    return lines;
end;
$$;

-- One monkey's profile edits, newest first (staff only: anyone else gets none)
create function public.monkey_recent_edits(monkey bigint, days int default 7)
returns table (
    changed_at  timestamptz,
    kind        text,
    changed_by  text,
    lines       text[]
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        c.changed_at,
        c.action,
        coalesce(p.full_name, split_part(c.changed_by_email, '@', 1)),
        private.change_lines(c.old_row, c.new_row) || private.more_change_lines(c.old_row, c.new_row)
    from private.monkey_changes c
    left join public.profiles p on p.user_id = c.changed_by
    where c.monkey_id = monkey
      and c.changed_at >= now() - make_interval(days => least(greatest(days, 1), 31))
      and public.can_log_maintenance()
      -- (not the one-off photo move)
      and not (c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row))
    order by c.changed_at desc
    limit 100
$$;

revoke all on function public.monkey_recent_edits(bigint, int) from public, anon;
grant execute on function public.monkey_recent_edits(bigint, int) to authenticated;

commit;

-- Check: runs without errors (the SQL Editor isn't signed in, so it gets
-- the visitors' Latest News: arrivals and releases only)
select * from public.latest_news(14);
