-- Staff Activity, from any start to any end: the Admin Dashboard's Staff
-- Activity page can now show 24 Hours, 7, 14 or 30 Days, or a Custom
-- From and To date. Replaces staff_activity(person, days) from
-- staff-activity.sql with staff_activity(person, since, until): the
-- changes from since up to until (a year at most). Nothing else changes,
-- and the history kept so far stays as it is.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs staff-activity.sql to have been run (it has been).

begin;

drop function public.staff_activity(uuid, int);

------------------------------------------------------------------------
-- Staff Activity (admins only). One row per change, newest first (the
-- same as before). person: one staff member (null: everyone); since /
-- until: the period (until not included)
------------------------------------------------------------------------
create function public.staff_activity(person uuid default null, since timestamptz default now() - interval '7 days', until timestamptz default now())
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
                when c.table_name = 'maintenance' then
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

revoke all on function public.staff_activity(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_activity(uuid, timestamptz, timestamptz) to authenticated;

commit;

-- Check: runs (empty here: the SQL Editor isn't signed in as an admin)
select * from public.staff_activity(null, now() - interval '14 days', now());
