-- Enclosures and introcages (vervetDB 1.2.0).
--
-- Troops (groups of monkeys) and enclosures (places) become separate things:
--   sections     Top, Middle, Bottom, Sickbay (until now only in the app,
--                src/sections.js)
--   enclosures   every troop enclosure (Robert) and introcage (Robert B1);
--                an introcage belongs to its troop enclosure
--   troops       each gets its home enclosure (the Bandits, being wild,
--                have none)
--   monkeys      in a troop (living in its home enclosure) OR in an
--                introcage, never both: introcage monkeys belong to the
--                enclosure, not the troop. (Nobody is moved here: every
--                monkey stays in its troop, so the live site, which doesn't
--                know about introcages yet, carries on as before. Aroha's
--                move is in move-aroha.sql, run with the new version.)
--   maintenance  a dated log for each enclosure / introcage
-- The counts and resident lists on the Enclosures page are worked out from
-- these, so nothing needs keeping in step by hand. Links and QR codes use an
-- enclosure's id number, never its name, so renaming never breaks them.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Everything runs as one step: if anything fails, nothing is changed.
-- The checks at the end list what was added.

begin;

------------------------------------------------------------------------
-- Sections
------------------------------------------------------------------------
create table public.sections (
    id          bigint generated always as identity primary key,
    name        text not null unique
                check (name = btrim(name) and name <> ''),
    sort_order  integer not null default 0
);

insert into public.sections (name, sort_order) values
    ('Top', 1), ('Middle', 2), ('Bottom', 3), ('Sickbay', 4);

------------------------------------------------------------------------
-- Enclosures: troop enclosures and introcages
------------------------------------------------------------------------
create table public.enclosures (
    id           bigint generated always as identity primary key,
    name         text not null unique
                 check (name = btrim(name) and name <> ''),
    type         text not null check (type in ('troop', 'introcage')),
    -- introcages: the troop enclosure they belong to (Robert B1 → Robert)
    parent_id    bigint,
    -- (always "troop" when there's a parent: makes the database check the
    -- parent really is a troop enclosure, see the foreign key below)
    parent_type  text generated always as (case when parent_id is not null then 'troop' end) stored,
    -- troop enclosures only (introcages are in their enclosure's section)
    section_id   bigint references public.sections (id),
    -- troop enclosures only: month and year, stored as the 1st of the month
    established  date check (extract(day from established) = 1),
    description  text not null default ''
                 check (description = btrim(description)),
    -- free text for now (a fixed list later)
    features     text not null default ''
                 check (features = btrim(features)),
    -- the floor area in whole square metres, e.g. 600 (shown as "600 m²");
    -- null = not recorded (both troop enclosures and introcages)
    size         integer check (size > 0),
    -- introcages only (null = not recorded): a door through to the troop,
    -- a slot for food plates, and how many sleeping perches (1 to 10)
    -- (added by introcage-fields.sql)
    troop_door       boolean,
    plate_slot       boolean,
    sleeping_perches smallint constraint enclosures_sleeping_perches_check check (sleeping_perches between 1 and 10),
    -- first photo is the main one; all https links (none is fine)
    photos       text[] not null default '{}'
                 check (cardinality(photos) = 0 or public.all_https(photos)),
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    updated_by   uuid references auth.users (id),

    unique (id, type),
    foreign key (parent_id, parent_type) references public.enclosures (id, type),
    -- an introcage has a parent; a troop enclosure doesn't
    check ((type = 'introcage') = (parent_id is not null)),
    -- a troop enclosure has a section; an introcage doesn't
    check ((type = 'troop') = (section_id is not null)),
    -- only troop enclosures have an established date and a description
    check (type = 'troop' or (established is null and description = '')),
    -- only introcages have a troop door, plate slot and sleeping perches
    constraint enclosures_introcage_details_check
        check (type = 'introcage' or (troop_door is null and plate_slot is null and sleeping_perches is null))
);

create index enclosures_parent_id_idx on public.enclosures (parent_id);

-- Keep updated_at / updated_by current (the same as for monkeys)
create trigger enclosures_stamp_update
    before insert or update on public.enclosures
    for each row execute function public.stamp_monkey_update();

-- One troop enclosure per troop, named after it, in its section
insert into public.enclosures (name, type, section_id, sort_order)
select t.name, 'troop', s.id, t.sort_order
from public.troops t
join (values
    ('Goliath', 'Top'), ('Gismo', 'Top'), ('D&D', 'Top'), ('Royal', 'Top'),
    ('Engeltjie', 'Middle'), ('Lankora', 'Middle'), ('Koko', 'Middle'), ('Camelot', 'Middle'),
    ('Skrow', 'Bottom'), ('Robert', 'Bottom'), ('Skunkey', 'Bottom'), ('H&B', 'Bottom'), ('Jalamango', 'Bottom'),
    ('Global', 'Sickbay'), ('James', 'Sickbay')
) as v (troop, section) on v.troop = t.name
join public.sections s on s.name = v.section;

-- The introcages, named "<enclosure> <code>", in the order given
insert into public.enclosures (name, type, parent_id, sort_order)
select p.name || ' ' || code.value, 'introcage', p.id, code.ordinality
from (values
    ('Goliath',   array['A', 'B', 'B1', 'C', 'D', 'E', 'F', 'F1', 'I', 'J']),
    ('Gismo',     array['A', 'C', 'D']),
    ('D&D',       array['A', 'A1', 'B', 'C', 'D', 'E']),
    ('Royal',     array['A1', 'A3', 'A4', 'C']),
    ('Engeltjie', array['1', '1A', '2', '3', '4', '5', '7', '8', '9']),
    ('Lankora',   array['A', 'B', 'C']),
    ('Koko',      array['A', 'A1', 'B', 'C', 'D']),
    ('Camelot',   array['A', 'C', 'D', 'E']),
    ('Skrow',     array['B', 'C']),
    ('Robert',    array['A', 'B1', 'B2', 'B3', 'C', 'D', 'E']),
    ('Skunkey',   array['A', 'B1', 'B2', 'D', 'E', 'F', 'F2']),
    ('H&B',       array['A', 'B', 'C1', 'C2']),
    ('Jalamango', array['A']),
    ('Global',    array['A', 'B', 'C', 'D', 'E', 'F']),
    ('James',     array['A', 'B'])
) as v (enclosure, codes)
join public.enclosures p on p.name = v.enclosure and p.type = 'troop'
cross join lateral unnest(v.codes) with ordinality as code (value, ordinality);

-- Introcages with their own name
update public.enclosures set name = 'Calypso''s Corner A' where name = 'Engeltjie 8' and type = 'introcage';
update public.enclosures set name = 'Calypso''s Corner B' where name = 'Engeltjie 9' and type = 'introcage';

------------------------------------------------------------------------
-- Troops: their home enclosure (none for the Bandits)
------------------------------------------------------------------------
alter table public.troops
    add column enclosure_id bigint unique references public.enclosures (id);

update public.troops t
set enclosure_id = e.id
from public.enclosures e
where e.name = t.name and e.type = 'troop';

------------------------------------------------------------------------
-- Monkeys: in a troop OR an introcage
------------------------------------------------------------------------
alter table public.monkeys
    alter column troop_id drop not null,
    add column introcage_id bigint,
    -- (always "introcage" when set: makes the database check it really is
    -- an introcage, not a troop enclosure)
    add column introcage_type text generated always as
        (case when introcage_id is not null then 'introcage' end) stored,
    add foreign key (introcage_id, introcage_type) references public.enclosures (id, type),
    -- exactly one of the two
    add constraint monkeys_troop_or_introcage
        check ((troop_id is null) <> (introcage_id is null));

create index monkeys_introcage_id_idx on public.monkeys (introcage_id);

------------------------------------------------------------------------
-- Maintenance log
------------------------------------------------------------------------
create table public.maintenance (
    id            bigint generated always as identity primary key,
    enclosure_id  bigint not null references public.enclosures (id) on delete cascade,
    -- the day it was done
    done_on       date not null,
    details       text not null
                  check (details = btrim(details) and details <> ''),
    -- who wrote it in and when, filled in automatically: their account, and
    -- the part of their email before the @, which the page shows (anyone
    -- can view vervetDB, so whole email addresses aren't kept here)
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default split_part(auth.jwt() ->> 'email', '@', 1),
    logged_at       timestamptz not null default now()
);

create index maintenance_enclosure_id_idx on public.maintenance (enclosure_id, done_on desc);

------------------------------------------------------------------------
-- Who can do what (the same pattern as monkeys and troops): anyone can
-- read; editors add and change; admins add enclosures and delete things.
-- Sections are set up here and changed only by admins.
------------------------------------------------------------------------
alter table public.sections    enable row level security;
alter table public.enclosures  enable row level security;
alter table public.maintenance enable row level security;

create policy "Anyone can read sections"
    on public.sections for select to anon, authenticated using (true);
create policy "Admins can add sections"
    on public.sections for insert to authenticated
    with check ((select public.is_admin()));
create policy "Admins can change sections"
    on public.sections for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete sections"
    on public.sections for delete to authenticated
    using ((select public.is_admin()));

create policy "Anyone can read enclosures"
    on public.enclosures for select to anon, authenticated using (true);
create policy "Admins can add enclosures"
    on public.enclosures for insert to authenticated
    with check ((select public.is_admin()));
-- (changing an enclosure's details: admins only, for now)
create policy "Admins can change enclosures"
    on public.enclosures for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete enclosures"
    on public.enclosures for delete to authenticated
    using ((select public.is_admin()));

create policy "Anyone can read maintenance"
    on public.maintenance for select to anon, authenticated using (true);
-- An entry is always in the name of whoever adds it
create policy "Editors can add maintenance"
    on public.maintenance for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));
create policy "Editors can change maintenance"
    on public.maintenance for update to authenticated
    using ((select public.is_editor())) with check ((select public.is_editor()));
create policy "Admins can delete maintenance"
    on public.maintenance for delete to authenticated
    using ((select public.is_admin()));

grant select on public.sections, public.enclosures, public.maintenance to anon, authenticated;
grant insert, update, delete on public.sections, public.enclosures to authenticated;
-- Maintenance: only the date and details are typed in; who and when are
-- filled in by the database, so nobody can log in someone else's name
grant insert (enclosure_id, done_on, details), update (done_on, details), delete
    on public.maintenance to authenticated;

------------------------------------------------------------------------
-- Change history (change-history.sql): a monkey's location is its
-- introcage if it's in one, otherwise its troop, and the summary email
-- calls it "Location", e.g. "Location: H&B → H&B C1"
------------------------------------------------------------------------
create or replace function private.field_text(r jsonb, field text)
returns text
language sql
stable
set search_path = ''
as $$
    select case field
        when 'troop' then coalesce(
            (select e.name from public.enclosures e where e.id = (r ->> 'introcage_id')::bigint),
            (select t.name from public.troops t where t.id = (r ->> 'troop_id')::bigint)
        )
        when 'sex' then initcap(r ->> 'sex')
        when 'chip' then case
            when r is null then null
            when r -> 'chip' = 'null'::jsonb then 'Unknown'
            when r ->> 'chip' = '' then 'No Chip'
            else r ->> 'chip'
        end
        else r ->> field
    end
$$;

-- The same as before, with "Troop" renamed "Location"
create or replace function private.change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    fields text[] := array['name', 'troop', 'sex', 'birth_year', 'chip', 'bio', 'description'];
    labels text[] := array['Name', 'Location', 'Sex', 'Birth year', 'Chip', 'Bio', 'Description'];
    lines text[] := '{}';
    before_text text;
    after_text text;
    before_photos text[] := private.real_photos(old_row);
    after_photos text[] := private.real_photos(new_row);
    added int;
    removed int;
begin
    for i in 1 .. array_length(fields, 1) loop
        before_text := private.field_text(old_row, fields[i]);
        after_text := private.field_text(new_row, fields[i]);
        if old_row is null or new_row is null then
            -- Added or deleted: list what's filled in (name and location are in the heading)
            if fields[i] not in ('name', 'troop') and coalesce(after_text, before_text, '') <> '' then
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
            lines := lines || 'Photos: reordered (new card photo)'::text;
        end if;
    end if;

    return lines;
end;
$$;

commit;

------------------------------------------------------------------------
-- Checks
------------------------------------------------------------------------
-- 1. Each section's troop enclosures and how many introcages they have
--    (15 enclosures, 73 introcages in all)
select s.name as section, e.name as enclosure,
       (select count(*) from public.enclosures i where i.parent_id = e.id) as introcages
from public.enclosures e
join public.sections s on s.id = e.section_id
order by s.sort_order, e.sort_order;

-- 2. Every troop's home enclosure (Bandits: none)
select t.name as troop, e.name as home_enclosure
from public.troops t left join public.enclosures e on e.id = t.enclosure_id
order by t.sort_order;

-- 3. Nobody's in an introcage yet (should say 0)
select count(*) as monkeys_in_introcages from public.monkeys where introcage_id is not null;
