-- Enclosure types: instead of "special" enclosures, every enclosure says
-- what kind it is.
--   Enclosures (the top level):
--     troop       a troop enclosure (Robert): a troop, plus its introcages
--     block       Bachelor Block: introcages only, no troop
--     care_unit   Baby Care, Quarantine, Sickbay Care Unit: where new
--                 arrivals go; areas only, no troop
--   Inside an enclosure (where monkeys not in a troop live):
--     introcage   in a troop enclosure or a block (Robert B1, Bachelor Block A)
--     area        in a care unit (Dreamland). A care unit that's one space
--                 has one area with its own name (Quarantine, Sickbay Care Unit)
-- The database checks each one is in the right kind of enclosure.
--
-- Also:
--   - the care units go in one "Care Units" section (their three sections
--     of their own are deleted)
--   - Quarantine's cages A–F become one area, "Quarantine": anyone in them
--     moves into it, and their maintenance moves to Quarantine itself
--   - maintenance logged on a one-area care unit's area moves to the unit
--     (the website shows it there)
--   - the hidden "special" flag is removed
--   - the daily summary email and the Changelog call areas "Area"
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs care-areas.sql and email-enclosures.sql to have been run first.
-- If Quarantine A–F have details or photos of their own it stops without
-- changing anything, and says so.

begin;

------------------------------------------------------------------------
-- Safety first: Quarantine A–F's own details would be lost when they're
-- merged, so stop if any have some
------------------------------------------------------------------------
do $$
begin
    if exists (
        select 1
        from public.enclosures c
        join public.enclosures p on p.id = c.parent_id
        where p.name = 'Quarantine' and c.name <> 'Quarantine'
          and (cardinality(c.photos) > 0 or c.features <> '' or c.size is not null
               or c.troop_door is not null or c.plate_slot is not null or c.sleeping_perches is not null)
    ) then
        raise exception 'Quarantine A–F have details or photos of their own. Nothing was changed: please ask Claude what to do with them.';
    end if;
end;
$$;

------------------------------------------------------------------------
-- The old rules (they only knew "troop" and "introcage"): removed, and
-- put back below for the new types
------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select conrelid::regclass as tbl, conname
        from pg_constraint
        where conrelid in ('public.enclosures'::regclass, 'public.monkeys'::regclass)
          and (
              -- the links that check a parent / a monkey's introcage
              (contype = 'f' and pg_get_constraintdef(oid) ~ '(parent_type|introcage_type)')
              -- unique (id, type) and unique (name, type)
              or (contype = 'u' and conrelid = 'public.enclosures'::regclass
                  and pg_get_constraintdef(oid) ~ '\mtype\M')
              -- the checks that mention the type
              or (contype = 'c' and conrelid = 'public.enclosures'::regclass
                  and pg_get_constraintdef(oid) ~ '\mtype\M')
          )
        -- (the links first: the unique ones can't go while they're used)
        order by contype = 'f' desc
    loop
        execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    end loop;
end;
$$;

alter table public.enclosures drop column parent_type;
alter table public.monkeys drop column introcage_type;

------------------------------------------------------------------------
-- The new types (from the "special" flag: a special enclosure in a section
-- of its own is a care unit, the other one a block)
------------------------------------------------------------------------
update public.enclosures e
set type = 'care_unit'
from public.sections s
where e.type = 'troop' and e.special and s.id = e.section_id and s.name = e.name;

update public.enclosures
set type = 'block'
where type = 'troop' and special;

update public.enclosures
set type = 'area'
where parent_id in (select id from public.enclosures where type = 'care_unit');

------------------------------------------------------------------------
-- One "Care Units" section, after Sickbay, instead of a section each
------------------------------------------------------------------------
insert into public.sections (name, sort_order) values ('Care Units', 5);

-- (in the same order as before: Baby Care, Quarantine, Sickbay Care Unit)
update public.enclosures
set section_id = (select id from public.sections where name = 'Care Units'),
    sort_order = case name when 'Baby Care' then 101 when 'Quarantine' then 102 else 103 end
where type = 'care_unit';

delete from public.sections s
where s.name in ('Baby Care', 'Quarantine', 'Sickbay Care Unit')
  and not exists (select 1 from public.enclosures e where e.section_id = s.id);

------------------------------------------------------------------------
-- Quarantine: one area, "Quarantine", instead of cages A–F
------------------------------------------------------------------------
insert into public.enclosures (name, type, parent_id, sort_order)
select 'Quarantine', 'area', p.id, 1
from public.enclosures p
where p.name = 'Quarantine' and p.type = 'care_unit'
  and not exists (select 1 from public.enclosures a where a.parent_id = p.id and a.name = 'Quarantine');

-- Anyone in A–F: into the one area
update public.monkeys m
set introcage_id = (
    select a.id from public.enclosures a
    join public.enclosures p on p.id = a.parent_id
    where p.name = 'Quarantine' and p.type = 'care_unit' and a.name = 'Quarantine'
)
where m.introcage_id in (
    select c.id from public.enclosures c
    join public.enclosures p on p.id = c.parent_id
    where p.name = 'Quarantine' and p.type = 'care_unit' and c.name <> 'Quarantine'
);

-- Maintenance logged on A–F: onto Quarantine itself (deleting them would
-- otherwise delete it)
update public.maintenance m
set enclosure_id = c.parent_id
from public.enclosures c
join public.enclosures p on p.id = c.parent_id
where m.enclosure_id = c.id
  and p.name = 'Quarantine' and p.type = 'care_unit' and c.name <> 'Quarantine';

delete from public.enclosures c
using public.enclosures p
where p.id = c.parent_id
  and p.name = 'Quarantine' and p.type = 'care_unit' and c.name <> 'Quarantine';

-- Maintenance logged on a one-area care unit's area: onto the unit, where
-- the website shows it
update public.maintenance m
set enclosure_id = a.parent_id
from public.enclosures a
join public.enclosures p on p.id = a.parent_id
where m.enclosure_id = a.id
  and a.type = 'area' and a.name = p.name
  and (select count(*) from public.enclosures o where o.parent_id = p.id) = 1;

alter table public.enclosures drop column special;

------------------------------------------------------------------------
-- The new rules
------------------------------------------------------------------------
alter table public.enclosures
    add constraint enclosures_type_check
        check (type in ('troop', 'block', 'care_unit', 'introcage', 'area')),
    -- the level: an enclosure, or a place inside one (an introcage or area)
    add column level text generated always as
        (case when type in ('introcage', 'area') then 'inside' else 'enclosure' end) stored,
    -- (always "enclosure" when there's a parent: makes the database check
    -- the parent really is an enclosure, see the link below)
    add column parent_level text generated always as
        (case when parent_id is not null then 'enclosure' end) stored,
    add constraint enclosures_id_level_key unique (id, level),
    -- names: different among the enclosures, and among the places inside
    -- them (so Sickbay Care Unit's one area can have its name)
    add constraint enclosures_name_level_key unique (name, level),
    -- an introcage or area has a parent; an enclosure doesn't
    add constraint enclosures_parent_check
        check ((type in ('introcage', 'area')) = (parent_id is not null)),
    -- an enclosure has a section; an introcage or area doesn't (it's in
    -- its enclosure's)
    add constraint enclosures_section_check
        check ((type in ('introcage', 'area')) = (section_id is null)),
    -- only enclosures have an established date and an About
    add constraint enclosures_enclosure_details_check
        check (type not in ('introcage', 'area') or (established is null and description = '')),
    -- only introcages and areas have a troop door, plate slot and sleeping perches
    add constraint enclosures_introcage_details_check
        check (type in ('introcage', 'area') or (troop_door is null and plate_slot is null and sleeping_perches is null));

alter table public.enclosures
    add constraint enclosures_parent_fkey
        foreign key (parent_id, parent_level) references public.enclosures (id, level);

-- Monkeys not in a troop: in an introcage or area (not an enclosure itself)
alter table public.monkeys
    add column introcage_level text generated always as
        (case when introcage_id is not null then 'inside' end) stored,
    add constraint monkeys_introcage_fkey
        foreign key (introcage_id, introcage_level) references public.enclosures (id, level);

-- The right kind of parent: an area in a care unit; an introcage in a
-- troop enclosure or a block (security definer, like the history's: it
-- runs on admins' saves from the website, and only reads)
create or replace function private.check_enclosure_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    parent_type text;
begin
    if new.parent_id is not null then
        select type into parent_type from public.enclosures where id = new.parent_id;
        if (new.type = 'area') <> (parent_type = 'care_unit') then
            raise exception 'An area belongs to a care unit, and an introcage to a troop enclosure or block (% is a %).',
                new.name, new.type;
        end if;
    end if;
    -- An enclosure changing type: its introcages / areas must still fit
    if tg_op = 'UPDATE' and new.type is distinct from old.type and exists (
        select 1 from public.enclosures c
        where c.parent_id = new.id and (c.type = 'area') <> (new.type = 'care_unit')
    ) then
        raise exception '% can''t become a % with the introcages / areas it has.', new.name, new.type;
    end if;
    return new;
end;
$$;
revoke all on function private.check_enclosure_parent() from public, anon, authenticated;

create trigger enclosures_check_parent
    before insert or update on public.enclosures
    for each row execute function private.check_enclosure_parent();

------------------------------------------------------------------------
-- The history's words: an area's one text is its "Description" (like an
-- introcage's), and the email and Changelog call it "Area"
------------------------------------------------------------------------
create or replace function private.enclosure_change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    is_introcage boolean := coalesce(new_row, old_row) ->> 'type' in ('introcage', 'area');
    fields text[] := array['name', 'section', 'description', 'features', 'size', 'established',
                           'troop_door', 'plate_slot', 'sleeping_perches'];
    -- (the website calls an introcage's or area's description "Description", an
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

create or replace function public.my_changes(max_rows int default 50)
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
            case when coalesce(c.new_row, c.old_row) ->> 'type' in ('introcage', 'area') then coalesce(c.new_row, c.old_row) ->> 'type' else 'enclosure' end
        from private.enclosure_changes c
        where c.changed_by = (select auth.uid())
        union all
        select
            m.logged_at,
            'maintenance',
            e.name,
            null,
            array[m.details],
            case when e.type in ('introcage', 'area') then e.type else 'enclosure' end
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

create or replace function private.summary_email(since timestamptz, until timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    settings private.summary_settings;
    c record;
    total int := 0;
    heading text;
    label text;
    who text;
    at_time text;
    colour text;
    lines text[];
    html text := '';
    txt text := '';
    day_text text;
    site text;
    -- the photo move (see is_photo_move): counted, then shown as one line
    moved int := 0;
    movers text[] := '{}';
    moved_html text := '';
    moved_txt text := '';
begin
    select * into settings from private.summary_settings;
    site := settings.site_url;

    for c in
        select * from (
            select changed_at, action, 'monkey' as subject, changed_by, changed_by_email,
                   changed_by_name, old_row, new_row
            from private.monkey_changes
            union all
            select changed_at, action,
                   case when coalesce(new_row, old_row) ->> 'type' in ('introcage', 'area') then coalesce(new_row, old_row) ->> 'type' else 'enclosure' end,
                   changed_by, changed_by_email, changed_by_name, old_row, new_row
            from private.enclosure_changes
        ) everything
        where changed_at > since and changed_at <= until
        order by changed_at
    loop
        -- Whoever made it: their name then, their name now, or their email
        who := coalesce(c.changed_by_name,
            (select p.full_name from public.profiles p where p.user_id = c.changed_by),
            c.changed_by_email, 'unknown');

        if c.subject = 'monkey' and c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row) then
            moved := moved + 1;
            if not (who = any (movers)) then
                movers := movers || who;
            end if;
            continue;
        end if;

        total := total + 1;
        heading := initcap(c.action) || ': ' || coalesce(c.new_row ->> 'name', c.old_row ->> 'name');
        if c.subject = 'monkey' then
            label := coalesce(private.field_text(coalesce(c.new_row, c.old_row), 'troop'), 'no troop');
            lines := private.change_lines(c.old_row, c.new_row);
        else
            label := initcap(c.subject);
            lines := private.enclosure_change_lines(c.old_row, c.new_row);
        end if;
        at_time := to_char(c.changed_at at time zone settings.time_zone, 'FMDD Mon, HH24:MI');
        colour := case c.action when 'added' then '#2e8b1e' when 'changed' then '#0b7fae' else '#c62828' end;

        txt := txt || heading || ' (' || label || ')' || E'\n'
            || 'By ' || who || ', ' || at_time || E'\n'
            || coalesce((select string_agg('  - ' || l || E'\n', '') from unnest(lines) l), '')
            || E'\n';

        html := html
            || '<div style="margin:0 0 16px;padding:10px 14px;border-left:4px solid ' || colour || ';background:#f6f6f4">'
            || '<p style="margin:0;font-weight:700;color:' || colour || '">' || private.esc(heading)
            || ' <span style="font-weight:400;color:#555">(' || private.esc(label) || ')</span></p>'
            || '<p style="margin:2px 0 0;font-size:13px;color:#666">By ' || private.esc(who) || ', ' || at_time || '</p>'
            || coalesce('<ul style="margin:6px 0 0;padding-left:20px">'
                || (select string_agg('<li>' || private.esc(l) || '</li>', '') from unnest(lines) l)
                || '</ul>', '')
            || '</div>';
    end loop;

    if moved > 0 then
        total := total + 1;
        heading := 'Photos moved to vervetDB storage: ' || moved
            || case when moved = 1 then ' monkey' else ' monkeys' end;
        who := array_to_string(movers, ', ');
        moved_txt := heading || E'\n' || 'By ' || who || E'\n'
            || '  - Copied from ImgBB; the photos themselves are unchanged' || E'\n\n';
        moved_html := '<div style="margin:0 0 16px;padding:10px 14px;border-left:4px solid #0b7fae;background:#f6f6f4">'
            || '<p style="margin:0;font-weight:700;color:#0b7fae">' || private.esc(heading) || '</p>'
            || '<p style="margin:2px 0 0;font-size:13px;color:#666">By ' || private.esc(who) || '</p>'
            || '<ul style="margin:6px 0 0;padding-left:20px"><li>Copied from ImgBB; the photos themselves are unchanged</li></ul>'
            || '</div>';
        txt := moved_txt || txt;
        html := moved_html || html;
    end if;

    if total = 0 then
        return null;
    end if;

    day_text := to_char(until at time zone settings.time_zone, 'FMDD Mon YYYY');
    return jsonb_build_object(
        'count', total,
        'subject', 'vervetDB: ' || total || case when total = 1 then ' change' else ' changes' end || ' (' || day_text || ')',
        'text', 'vervetDB changes up to ' || day_text || E'\n\n' || txt || site,
        'html', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px">'
            || '<h2 style="margin:0 0 16px">vervetDB changes</h2>'
            || html
            || '<p style="font-size:13px;color:#666"><a href="' || site || '">Open vervetDB</a></p></div>'
    );
end;
$$;

-- Nobody but you (the database owner) can run it
revoke all on function private.summary_email(timestamptz, timestamptz) from public, anon, authenticated;

commit;

-- Check 1: every enclosure's type and section, and what's inside it
select p.type, p.name, s.name as section,
       string_agg(c.name || ' (' || c.type || ')', ', ' order by c.sort_order) as inside
from public.enclosures p
join public.sections s on s.id = p.section_id
left join public.enclosures c on c.parent_id = p.id
where p.level = 'enclosure'
group by p.type, p.name, s.name, s.sort_order, p.sort_order
order by s.sort_order, p.sort_order;

-- Check 2: the monkeys in the care units, and where
select p.name as care_unit, a.name as area, count(m.id) as monkeys
from public.enclosures p
join public.enclosures a on a.parent_id = p.id
left join public.monkeys m on m.introcage_id = a.id
where p.type = 'care_unit'
group by p.name, a.name, p.sort_order, a.sort_order
order by p.sort_order, a.sort_order;
