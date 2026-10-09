-- Enclosure change history: every time an enclosure or introcage is added,
-- changed or deleted, the database notes who did it, when, and what it
-- looked like before and after (the same as for monkeys, change-history.sql).
-- Each person sees their own in the website's Changelog (my_changes, below,
-- replacing the one from my-changes.sql). Like the monkey history, it lives
-- in the private schema: only you can read all of it, here in the SQL Editor.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs change-history.sql, enclosures.sql, introcage-fields.sql and
-- my-changes.sql to have been run.

begin;

------------------------------------------------------------------------
-- The history
------------------------------------------------------------------------
create table private.enclosure_changes (
    id                bigint generated always as identity primary key,
    changed_at        timestamptz not null default now(),
    action            text not null check (action in ('added', 'changed', 'deleted')),
    enclosure_id      bigint not null,
    changed_by        uuid references auth.users (id) on delete set null,
    -- kept as well, in case the account is removed later
    changed_by_email  text,
    changed_by_name   text,
    -- the enclosure before (null when added) and after (null when deleted)
    old_row           jsonb,
    new_row           jsonb
);

create index enclosure_changes_changed_at_idx on private.enclosure_changes (changed_at);
create index enclosure_changes_changed_by_idx on private.enclosure_changes (changed_by);

-- Runs after every add / change / delete of an enclosure and notes it down
-- (security definer: writes to the private history on the person's behalf)
create function private.record_enclosure_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    who uuid := auth.uid();
begin
    -- A save that didn't actually change anything isn't worth noting
    if tg_op = 'UPDATE'
        and to_jsonb(new) - 'updated_at' - 'updated_by'
          = to_jsonb(old) - 'updated_at' - 'updated_by' then
        return null;
    end if;

    insert into private.enclosure_changes
        (action, enclosure_id, changed_by, changed_by_email, changed_by_name, old_row, new_row)
    values (
        case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
        case tg_op when 'DELETE' then old.id else new.id end,
        who,
        (select email from auth.users where id = who),
        (select full_name from public.profiles where user_id = who),
        case when tg_op <> 'INSERT' then to_jsonb(old) end,
        case when tg_op <> 'DELETE' then to_jsonb(new) end
    );
    return null;
end;
$$;
revoke all on function private.record_enclosure_change() from public, anon, authenticated;

create trigger enclosures_record_change
    after insert or update or delete on public.enclosures
    for each row execute function private.record_enclosure_change();

------------------------------------------------------------------------
-- What changed, in words (as the website shows them)
------------------------------------------------------------------------

-- One field of an enclosure, as words
create function private.enclosure_field_text(r jsonb, field text)
returns text
language sql
stable
set search_path = ''
as $$
    select case
        when r is null then null
        when field = 'section' then (
            select s.name from public.sections s where s.id = (r ->> 'section_id')::bigint
        )
        when field = 'size' then (r ->> 'size') || ' m²'
        when field = 'established' then to_char((r ->> 'established')::date, 'FMMonth YYYY')
        when field in ('troop_door', 'plate_slot') then case r ->> field
            when 'true' then 'Yes' when 'false' then 'No' end
        else nullif(r ->> field, '')
    end
$$;

-- The lines listed under one change, e.g. "Size: 600 m² → 650 m²".
-- Added / deleted ones list what they had.
create function private.enclosure_change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    is_introcage boolean := coalesce(new_row, old_row) ->> 'type' = 'introcage';
    fields text[] := array['name', 'section', 'description', 'features', 'size', 'established',
                           'troop_door', 'plate_slot', 'sleeping_perches'];
    -- (the website calls an introcage's description "Description", a troop
    -- enclosure's "About")
    labels text[] := array['Name', 'Section', case when is_introcage then 'Description' else 'About' end,
                           'Features', 'Size', 'Established',
                           'Troop Door', 'Plate Slot', 'Sleeping Perches'];
    lines text[] := '{}';
    before_text text;
    after_text text;
    before_photos text[] := array(select jsonb_array_elements_text(coalesce(old_row -> 'photos', '[]')));
    after_photos text[] := array(select jsonb_array_elements_text(coalesce(new_row -> 'photos', '[]')));
    added int;
    removed int;
begin
    for i in 1 .. array_length(fields, 1) loop
        before_text := private.enclosure_field_text(old_row, fields[i]);
        after_text := private.enclosure_field_text(new_row, fields[i]);
        if old_row is null or new_row is null then
            -- Added or deleted: list what's filled in (the name is in the heading)
            if fields[i] <> 'name' and coalesce(after_text, before_text, '') <> '' then
                lines := lines || (labels[i] || ': ' || private.shown(coalesce(after_text, before_text)));
            end if;
        elsif before_text is distinct from after_text then
            lines := lines || (labels[i] || ': ' || private.shown(before_text) || ' → ' || private.shown(after_text));
        end if;
    end loop;

    if old_row is null or new_row is null then
        if cardinality(before_photos) + cardinality(after_photos) > 0 then
            lines := lines || ('Photos: ' || (cardinality(before_photos) + cardinality(after_photos)));
        end if;
    else
        added := (select count(*) from unnest(after_photos) p where p <> all (before_photos));
        removed := (select count(*) from unnest(before_photos) p where p <> all (after_photos));
        if added > 0 or removed > 0 then
            lines := lines || ('Photos: ' || concat_ws(', ',
                case when added > 0 then added || ' added' end,
                case when removed > 0 then removed || ' removed' end));
        elsif before_photos <> after_photos then
            lines := lines || 'Photos: reordered (new main photo)'::text;
        end if;
    end if;

    return lines;
end;
$$;

------------------------------------------------------------------------
-- My Changelog, now with enclosures. One row per change:
--   changed_at  when
--   kind        'added', 'changed' or 'deleted', or 'maintenance'
--   title       the monkey's or enclosure's name
--   troop       the monkey's troop (monkeys only)
--   lines       what changed (maintenance: what was done)
--   subject     'monkey', 'enclosure' or 'introcage' (new: the website
--               shows "Enclosure" / "Introcage" beside the name)
------------------------------------------------------------------------
drop function public.my_changes(int);

create function public.my_changes(max_rows int default 50)
returns table (
    changed_at timestamptz,
    kind text,
    title text,
    troop text,
    lines text[],
    subject text
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
            private.change_lines(c.old_row, c.new_row),
            'monkey'
        from private.monkey_changes c
        where c.changed_by = (select auth.uid())
          -- (not the one-off photo move: a change in name only)
          and not (c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row))
        union all
        select
            c.changed_at,
            c.action,
            coalesce(c.new_row ->> 'name', c.old_row ->> 'name'),
            null,
            private.enclosure_change_lines(c.old_row, c.new_row),
            case when coalesce(c.new_row, c.old_row) ->> 'type' = 'introcage' then 'introcage' else 'enclosure' end
        from private.enclosure_changes c
        where c.changed_by = (select auth.uid())
        union all
        select
            m.logged_at,
            'maintenance',
            e.name,
            null,
            array[m.details],
            case when e.type = 'introcage' then 'introcage' else 'enclosure' end
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

commit;

-- Check: the history is ready (0 changes so far) and the Changelog runs
-- (empty here: the SQL Editor isn't signed in as anyone)
select count(*) as enclosure_changes_so_far from private.enclosure_changes;
select * from public.my_changes();
