-- (staff_activity() since replaced by staff-activity-dates.sql: any start
-- and end, not just the last few days.)
--
-- Staff Activity: a change history for everything else, and the Admin
-- Dashboard's Staff Activity page (admins only).
--
-- Monkeys and enclosures already keep a history (change-history.sql,
-- enclosure-history.sql). This adds one for every other table staff can
-- change: injuries and their updates, records, weights, milk totals,
-- integrations and their reports, maintenance, monitoring, arrival info,
-- names, user types, troops and sections. Each add, change and delete is
-- noted: who, when, and the row before and after (so a change can be
-- undone later). It lives in the private schema: nobody can read or change
-- it through the website, except admins through staff_activity() below.
--
--   staff_activity(person, days)   one person's changes (person null:
--                                  everyone's) in the last few days,
--                                  newest first: monkeys and enclosures
--                                  (with what changed, in words) and the
--                                  rest (with the row before and after,
--                                  put into words by the website)
--
-- History starts when this is run: changes before then aren't in it.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs change-history.sql, enclosure-history.sql, latest-news.sql and
-- admin-dashboard.sql to have been run (they have been).

begin;

------------------------------------------------------------------------
-- The history
------------------------------------------------------------------------
create table private.record_changes (
    id                bigint generated always as identity primary key,
    changed_at        timestamptz not null default now(),
    -- which table, and which row of it (its id, or its monkey / account)
    table_name        text not null,
    record_key        text not null,
    action            text not null check (action in ('added', 'changed', 'deleted')),
    changed_by        uuid references auth.users (id) on delete set null,
    -- kept as well, in case the account is removed later
    changed_by_email  text,
    changed_by_name   text,
    -- the row before (null when added) and after (null when deleted)
    old_row           jsonb,
    new_row           jsonb
);

create index record_changes_changed_at_idx on private.record_changes (changed_at);
create index record_changes_changed_by_idx on private.record_changes (changed_by, changed_at);
create index record_changes_record_idx on private.record_changes (table_name, record_key);

-- Runs after every add / change / delete in the tables below and notes it
-- down (security definer: writes to the private history on the person's
-- behalf)
create function private.record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    who uuid := auth.uid();
    old_json jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    new_json jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    the_row jsonb := coalesce(new_json, old_json);
    -- (who and when it was last saved: not a change of its own)
    stamps text[] := array['updated_at', 'updated_by', 'updated_by_name'];
begin
    -- A save that didn't actually change anything isn't worth noting
    if tg_op = 'UPDATE' and (new_json - stamps) = (old_json - stamps) then
        return null;
    end if;

    insert into private.record_changes
        (table_name, record_key, action, changed_by, changed_by_email, changed_by_name, old_row, new_row)
    values (
        tg_table_name,
        coalesce(the_row ->> 'id', the_row ->> 'monkey_id', the_row ->> 'user_id', '?'),
        case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
        who,
        (select email from auth.users where id = who),
        (select full_name from public.profiles where user_id = who),
        old_json,
        new_json
    );
    return null;
end;
$$;
revoke all on function private.record_change() from public, anon, authenticated;

-- Every table staff can change, apart from monkeys and enclosures (which
-- have their own). Favourites and account photos are left out: they're
-- each person's own. (Any table not in this database yet is skipped.)
do $$
declare
    t text;
begin
    foreach t in array array[
        'arrival_info', 'editors', 'injuries', 'injury_updates', 'integration_reports',
        'integrations', 'maintenance', 'milk_totals', 'monitoring', 'monkey_records',
        'profiles', 'sections', 'troops', 'weights'
    ] loop
        if to_regclass('public.' || t) is not null then
            execute format('drop trigger if exists %I on public.%I', t || '_record_change', t);
            execute format(
                'create trigger %I after insert or update or delete on public.%I '
                'for each row execute function private.record_change()',
                t || '_record_change', t);
        end if;
    end loop;
end;
$$;

------------------------------------------------------------------------
-- Names for the Staff Activity page
------------------------------------------------------------------------

-- A monkey's name: as it is now, or (deleted) as it last was
create function private.monkey_name(monkey bigint)
returns text
language sql
stable
set search_path = ''
as $$
    select coalesce(
        (select m.name from public.monkeys m where m.id = monkey),
        (select coalesce(c.old_row ->> 'name', c.new_row ->> 'name')
         from private.monkey_changes c where c.monkey_id = monkey
         order by c.id desc limit 1)
    )
$$;

-- An enclosure's name: as it is now, or (deleted) as it last was
create function private.enclosure_name(enclosure bigint)
returns text
language sql
stable
set search_path = ''
as $$
    select coalesce(
        (select e.name from public.enclosures e where e.id = enclosure),
        (select coalesce(c.old_row ->> 'name', c.new_row ->> 'name')
         from private.enclosure_changes c where c.enclosure_id = enclosure
         order by c.id desc limit 1)
    )
$$;

-- The monkey a row is about (an injury update: its injury's monkey, even
-- if the injury's been deleted since)
create function private.row_monkey(table_name text, r jsonb)
returns bigint
language sql
stable
set search_path = ''
as $$
    select case
        when table_name = 'injury_updates' then coalesce(
            (select i.monkey_id from public.injuries i where i.id = (r ->> 'injury_id')::bigint),
            (select (coalesce(c.old_row, c.new_row) ->> 'monkey_id')::bigint
             from private.record_changes c
             where c.table_name = 'injuries' and c.record_key = r ->> 'injury_id'
             order by c.id desc limit 1)
        )
        else (r ->> 'monkey_id')::bigint
    end
$$;

-- A staff member's name (their account's, or its email's first part)
create function private.staff_name(person uuid)
returns text
language sql
stable
set search_path = ''
as $$
    select coalesce(
        (select p.full_name from public.profiles p where p.user_id = person),
        (select split_part(u.email, '@', 1) from auth.users u where u.id = person)
    )
$$;

------------------------------------------------------------------------
-- Staff Activity (admins only). One row per change, newest first:
--   changed_at       when
--   changed_by       who (their account), and changed_by_name: their name
--   source           'monkey', 'enclosure', or the table ('injuries'…)
--   action           'added', 'changed' or 'deleted'
--   title            what it's about: the monkey's, enclosure's or staff
--                    member's name (troops and sections: their own)
--   monkey_id        the monkey it's about, if any
--   lines            monkeys and enclosures: what changed, in words
--   old_row/new_row  the rest: the row before and after (the website
--                    puts them into words)
-- person: one staff member (null: everyone); days: how far back (1–366)
------------------------------------------------------------------------
create function public.staff_activity(person uuid default null, days int default 7)
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
    with since as (
        select now() - make_interval(days => least(greatest(days, 1), 366)) as at
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
        from private.monkey_changes c, since
        where c.changed_at >= since.at
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
        from private.enclosure_changes c, since
        where c.changed_at >= since.at
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
                when c.table_name = 'maintenance' then
                    private.enclosure_name((coalesce(c.new_row, c.old_row) ->> 'enclosure_id')::bigint)
                else
                    private.monkey_name(private.row_monkey(c.table_name, coalesce(c.new_row, c.old_row)))
            end,
            private.row_monkey(c.table_name, coalesce(c.new_row, c.old_row)),
            null,
            c.old_row,
            c.new_row
        from private.record_changes c, since
        where c.changed_at >= since.at
          and (person is null or c.changed_by = person)
    ) activity
    -- (admins only: anyone else gets nothing)
    where public.is_admin()
    order by 1 desc
    limit 500
$$;

revoke all on function public.staff_activity(uuid, int) from public, anon;
grant execute on function public.staff_activity(uuid, int) to authenticated;

commit;

-- Check: the history is ready (0 changes so far), and Staff Activity runs
-- (empty here: the SQL Editor isn't signed in as an admin)
select count(*) as record_changes_so_far from private.record_changes;
select * from public.staff_activity(null, 7);
