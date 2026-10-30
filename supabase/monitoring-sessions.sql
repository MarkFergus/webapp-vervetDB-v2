-- Monitoring sessions (Records → Sections → Monitoring): a check of every
-- monkey in a troop (and its introcages), and the enclosure.
--   Start Session   before the walk: saved as in progress, in the name of
--                   whoever starts it (the website shows the briefing:
--                   missing monkeys, priority checks, injuries, conditions)
--   Finish Session  after the walk, by the same person (or an admin): the
--                   date, food used (or none), fence, waters and food, who
--                   was seen, and general notes (finish_monitoring_session)
-- And conditions: dated snapshots of how a monkey looks ("Losing weight",
-- then "Weight improving"…): nothing to update or heal, just the next one.
-- Injuries, injury updates and conditions added during a session are
-- linked to it (session_id), for its WhatsApp summary.
--
-- Who can do what (the database enforces it, not just the website):
--   read                 staff only (any account with a role)
--   start / conditions   editors and admins, in their own name
--   finish / change      whoever started it, or an admin
--   delete               whoever started it, or an admin (conditions: whoever
--                        added it, or an admin)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs injuries.sql, monitoring.sql, names.sql and staff-activity.sql to
-- have been run (they have been).

begin;

------------------------------------------------------------------------
-- Sessions
------------------------------------------------------------------------
create table public.monitoring_sessions (
    id               bigint generated always as identity primary key,
    -- the troop's enclosure
    enclosure_id     bigint not null references public.enclosures (id) on delete cascade,
    session_date     date not null,
    status           text not null default 'in_progress' check (status in ('in_progress', 'finished')),
    food_used        text check (food_used in ('seeds', 'corn', 'pellets', 'sprouts')),
    fence            text check (fence in ('good', 'low', 'not_working')),
    waters           text check (waters in ('ok', 'not_ok')),
    food             text check (food in ('good', 'high', 'low')),
    notes            text
                     check (notes is null or (notes = btrim(notes) and notes <> '' and char_length(notes) <= 1000)),
    started_by       uuid references auth.users (id) on delete set null default auth.uid(),
    started_by_name  text default public.my_name(),
    started_at       timestamptz not null default now(),
    finished_at      timestamptz,
    -- (a finished one has its fence, waters and food)
    constraint monitoring_sessions_finished_check check (
        status = 'in_progress'
        or (fence is not null and waters is not null and food is not null and finished_at is not null)
    )
);

create index monitoring_sessions_troop_idx on public.monitoring_sessions (enclosure_id, session_date desc);

alter table public.monitoring_sessions enable row level security;

create policy "Staff can read monitoring sessions"
    on public.monitoring_sessions for select to authenticated
    using ((select public.can_log_maintenance()));

-- Started in progress, in the name of whoever starts it
create policy "Editors can start monitoring sessions"
    on public.monitoring_sessions for insert to authenticated
    with check ((select public.is_editor()) and started_by = (select auth.uid()) and status = 'in_progress');

create policy "Admins or the starter can delete monitoring sessions"
    on public.monitoring_sessions for delete to authenticated
    using ((select public.is_admin()) or ((select public.is_editor()) and started_by = (select auth.uid())));

grant select on public.monitoring_sessions to authenticated;
-- (finishing and changing: finish_monitoring_session only)
grant insert (enclosure_id, session_date), delete on public.monitoring_sessions to authenticated;

------------------------------------------------------------------------
-- Who was seen (one row per monkey on the checklist)
------------------------------------------------------------------------
create table public.monitoring_sightings (
    session_id  bigint not null references public.monitoring_sessions (id) on delete cascade,
    monkey_id   bigint not null references public.monkeys (id) on delete cascade,
    seen        boolean not null,
    primary key (session_id, monkey_id)
);

create index monitoring_sightings_monkey_idx on public.monitoring_sightings (monkey_id);

alter table public.monitoring_sightings enable row level security;

create policy "Staff can read monitoring sightings"
    on public.monitoring_sightings for select to authenticated
    using ((select public.can_log_maintenance()));

-- (written by finish_monitoring_session only)
grant select on public.monitoring_sightings to authenticated;

------------------------------------------------------------------------
-- Conditions
------------------------------------------------------------------------
create table public.monkey_conditions (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    condition_date  date not null,
    description     text not null
                    check (description = btrim(description) and description <> '' and char_length(description) <= 500),
    session_id      bigint references public.monitoring_sessions (id) on delete set null,
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now()
);

create index monkey_conditions_monkey_idx on public.monkey_conditions (monkey_id, condition_date desc);

alter table public.monkey_conditions enable row level security;

create policy "Staff can read conditions"
    on public.monkey_conditions for select to authenticated
    using ((select public.can_log_maintenance()));

create policy "Editors can add conditions"
    on public.monkey_conditions for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change conditions"
    on public.monkey_conditions for update to authenticated
    using ((select public.is_admin()) or ((select public.is_editor()) and logged_by = (select auth.uid())))
    with check ((select public.is_admin()) or ((select public.is_editor()) and logged_by = (select auth.uid())));

create policy "Admins or the writer can delete conditions"
    on public.monkey_conditions for delete to authenticated
    using ((select public.is_admin()) or ((select public.is_editor()) and logged_by = (select auth.uid())));

grant select on public.monkey_conditions to authenticated;
grant insert (monkey_id, condition_date, description, session_id), update (condition_date, description), delete
    on public.monkey_conditions to authenticated;

------------------------------------------------------------------------
-- Injuries and their updates: linked to the session they were added in
------------------------------------------------------------------------
alter table public.injuries
    add column session_id bigint references public.monitoring_sessions (id) on delete set null;
alter table public.injury_updates
    add column session_id bigint references public.monitoring_sessions (id) on delete set null;
grant insert (session_id) on public.injuries to authenticated;
grant insert (session_id) on public.injury_updates to authenticated;

------------------------------------------------------------------------
-- Finish Session (and change a finished one): whoever started it, or an
-- admin. Saves the details and the checklist (seen / not_seen: monkey ids)
------------------------------------------------------------------------
create function public.finish_monitoring_session(
    session bigint,
    on_date date,
    food_used text,
    fence text,
    waters text,
    food text,
    notes text,
    seen bigint[],
    not_seen bigint[]
)
returns setof public.monitoring_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
    starter uuid;
begin
    select s.started_by into starter from public.monitoring_sessions s where s.id = session;
    if not found then
        raise exception 'That monitoring session no longer exists.';
    end if;
    if not (public.is_admin() or (public.is_editor() and starter = (select auth.uid()))) then
        raise exception 'Only whoever started this session (or an admin) can finish or change it.'
            using errcode = '42501';
    end if;
    if on_date > (now() at time zone 'Africa/Johannesburg')::date then
        raise exception 'The date can''t be in the future.';
    end if;

    delete from public.monitoring_sightings ms where ms.session_id = session;
    insert into public.monitoring_sightings (session_id, monkey_id, seen)
        select session, m, true from unnest(coalesce(seen, '{}')) m
        union
        select session, m, false from unnest(coalesce(not_seen, '{}')) m
            where m <> all (coalesce(seen, '{}'));

    return query
        update public.monitoring_sessions s set
            session_date = on_date,
            food_used = nullif(finish_monitoring_session.food_used, ''),
            fence = finish_monitoring_session.fence,
            waters = finish_monitoring_session.waters,
            food = finish_monitoring_session.food,
            notes = nullif(btrim(finish_monitoring_session.notes), ''),
            status = 'finished',
            finished_at = coalesce(s.finished_at, now())
        where s.id = session
        returning s.*;
end;
$$;

revoke all on function public.finish_monitoring_session(bigint, date, text, text, text, text, text, bigint[], bigint[])
    from public, anon;
grant execute on function public.finish_monitoring_session(bigint, date, text, text, text, text, text, bigint[], bigint[])
    to authenticated;

------------------------------------------------------------------------
-- Staff Activity: sessions and conditions in the history too (the ticks
-- are part of their session)
------------------------------------------------------------------------
create trigger monitoring_sessions_record_change
    after insert or update or delete on public.monitoring_sessions
    for each row execute function private.record_change();
create trigger monkey_conditions_record_change
    after insert or update or delete on public.monkey_conditions
    for each row execute function private.record_change();

-- (a session: its troop's name)
create or replace function public.staff_activity(person uuid default null, since timestamptz default now() - interval '7 days', until timestamptz default now())
returns table (
    changed_at       timestamptz,
    changed_by       uuid,
    changed_by_name  text,
    source           text,
    action           text,
    title            text,
    monkey_id        bigint,
    lines            text[],
    old_row          jsonb,
    new_row          jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
    -- (a year at most)
    with period as (
        select greatest(since, until - interval '366 days') as from_at, until as to_at
    )
    select * from (
        select
            c.changed_at,
            c.changed_by,
            coalesce(private.staff_name(c.changed_by), split_part(c.changed_by_email, '@', 1)),
            'monkey',
            c.action,
            coalesce(c.new_row ->> 'name', c.old_row ->> 'name'),
            c.monkey_id,
            private.change_lines(c.old_row, c.new_row) || private.more_change_lines(c.old_row, c.new_row),
            null::jsonb,
            null::jsonb
        from private.monkey_changes c, period
        where c.changed_at >= period.from_at and c.changed_at < period.to_at
          and (person is null or c.changed_by = person)
          -- (not the one-off photo move)
          and not (c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row))
        union all
        select
            c.changed_at,
            c.changed_by,
            coalesce(c.changed_by_name, private.staff_name(c.changed_by), split_part(c.changed_by_email, '@', 1)),
            case when coalesce(c.new_row, c.old_row) ->> 'type' = 'introcage' then 'introcage' else 'enclosure' end,
            c.action,
            coalesce(c.new_row ->> 'name', c.old_row ->> 'name'),
            null,
            private.enclosure_change_lines(c.old_row, c.new_row),
            null,
            null
        from private.enclosure_changes c, period
        where c.changed_at >= period.from_at and c.changed_at < period.to_at
          and (person is null or c.changed_by = person)
        union all
        select
            c.changed_at,
            c.changed_by,
            coalesce(c.changed_by_name, private.staff_name(c.changed_by), split_part(c.changed_by_email, '@', 1)),
            c.table_name,
            c.action,
            case
                when c.table_name in ('editors', 'profiles') then
                    private.staff_name((coalesce(c.new_row, c.old_row) ->> 'user_id')::uuid)
                when c.table_name in ('troops', 'sections') then
                    coalesce(c.new_row, c.old_row) ->> 'name'
                when c.table_name in ('maintenance', 'monitoring_sessions') then
                    private.enclosure_name((coalesce(c.new_row, c.old_row) ->> 'enclosure_id')::bigint)
                else
                    private.monkey_name(private.row_monkey(c.table_name, coalesce(c.new_row, c.old_row)))
            end,
            private.row_monkey(c.table_name, coalesce(c.new_row, c.old_row)),
            null,
            c.old_row,
            c.new_row
        from private.record_changes c, period
        where c.changed_at >= period.from_at and c.changed_at < period.to_at
          and (person is null or c.changed_by = person)
    ) activity
    -- (admins only: anyone else gets nothing)
    where public.is_admin()
    order by 1 desc
    limit 500
$$;

commit;

-- Check: the new tables are there (0 sessions so far)
select count(*) as sessions_so_far from public.monitoring_sessions;
