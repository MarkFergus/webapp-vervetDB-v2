-- (Since replaced by enclosure-history.sql, which adds enclosure changes.)
--
-- My Changelog: each staff member can see their OWN recent changes in the
-- website (the account menu → Changelog): monkeys they added, changed or
-- deleted (from the change history, change-history.sql), and maintenance
-- they logged. Newest first. Nobody can see anyone else's this way; the
-- full history stays private, here in the SQL Editor.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs change-history.sql, enclosures.sql and roles.sql to have been run.

-- One row per change:
--   changed_at  when
--   kind        'added', 'changed' or 'deleted' (monkeys), or 'maintenance'
--   title       the monkey's name, or the enclosure's
--   troop       the monkey's troop (monkeys only)
--   lines       what changed, e.g. "Troop: Goliath → Hendrik" (the same
--               words as the daily summary email); maintenance: what was done
create or replace function public.my_changes(max_rows int default 50)
returns table (
    changed_at timestamptz,
    kind text,
    title text,
    troop text,
    lines text[]
)
language sql
stable
security definer
set search_path = ''
as $$
    select * from (
        select
            c.changed_at,
            c.action,
            coalesce(c.new_row ->> 'name', c.old_row ->> 'name'),
            private.field_text(coalesce(c.new_row, c.old_row), 'troop'),
            private.change_lines(c.old_row, c.new_row)
        from private.monkey_changes c
        where c.changed_by = (select auth.uid())
          -- (not the one-off photo move: a change in name only)
          and not (c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row))
        union all
        select
            m.logged_at,
            'maintenance',
            e.name,
            null,
            array[m.details]
        from public.maintenance m
        join public.enclosures e on e.id = m.enclosure_id
        where m.logged_by = (select auth.uid())
    ) mine
    order by 1 desc
    limit least(greatest(max_rows, 1), 200)
$$;

-- Signed-in accounts only (and each only ever gets their own)
revoke all on function public.my_changes(int) from public, anon;
grant execute on function public.my_changes(int) to authenticated;

-- Check: runs without errors (empty here: the SQL Editor isn't signed in
-- as anyone)
select * from public.my_changes();
