-- Feeding: what each introcage monkey is fed, for its pop-up and the AM
-- Plate Summary PDF.
--   fed_by          'local_team' or 'sickbay' (Sickbay's plates are made
--                   with the AM plates but delivered by Sickbay, so they
--                   only show as "Fed by Sickbay")
--   am_plates       AM plates: 1 or 2 (larger monkeys, e.g. adult males, 2)
--   am_cut_small, am_fruit, am_metal_plate   extras on the AM plates
--   pm_bowls        PM main feed bowls: 1 or 2
--   pm_cut_small    the PM bowl cut small
-- Every monkey has them (Local Team, 1 plate, 1 bowl, nothing extra to
-- start with), but they only mean something, and only show, while it's in
-- an introcage (not a troop, and not a care unit's area). Kept when it
-- moves, so nothing needs filling in again if it comes back.
-- The daily summary email and the Changelog list feeding changes too.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs enclosure-types.sql to have been run first.

begin;

alter table public.monkeys
    add column fed_by text not null default 'local_team'
        constraint monkeys_fed_by_check check (fed_by in ('local_team', 'sickbay')),
    add column am_plates smallint not null default 1
        constraint monkeys_am_plates_check check (am_plates between 1 and 2),
    add column am_cut_small boolean not null default false,
    add column am_fruit boolean not null default false,
    add column am_metal_plate boolean not null default false,
    add column pm_bowls smallint not null default 1
        constraint monkeys_pm_bowls_check check (pm_bowls between 1 and 2),
    add column pm_cut_small boolean not null default false;

------------------------------------------------------------------------
-- The history's words: "Fed By: Local Team → Sickbay",
-- "AM Food: 1 plate → 2 plates, cut small" (introcage monkeys only)
------------------------------------------------------------------------
create or replace function private.field_text(r jsonb, field text)
returns text
language sql
stable
set search_path = ''
as $$
    select case
        when field = 'troop' then coalesce(
            (select e.name from public.enclosures e where e.id = (r ->> 'introcage_id')::bigint),
            (select t.name from public.troops t where t.id = (r ->> 'troop_id')::bigint)
        )
        when field = 'sex' then initcap(r ->> 'sex')
        when field = 'chip' then case
            when r is null then null
            when r -> 'chip' = 'null'::jsonb then 'Unknown'
            when r ->> 'chip' = '' then 'No Chip'
            else r ->> 'chip'
        end
        -- Feeding: only for a monkey in an introcage (and only once
        -- this file has run: older history rows don't have it)
        when field in ('fed_by', 'am_food', 'pm_food') then (
            case
                when r is null or not (r ? 'fed_by') then null
                when not exists (
                    select 1 from public.enclosures e
                    where e.id = (r ->> 'introcage_id')::bigint and e.type = 'introcage'
                ) then null
                when field = 'fed_by' then
                    case r ->> 'fed_by' when 'sickbay' then 'Sickbay' else 'Local Team' end
                when r ->> 'fed_by' = 'sickbay' then null
                when field = 'am_food' then concat_ws(', ',
                    (r ->> 'am_plates') || case when r ->> 'am_plates' = '1' then ' plate' else ' plates' end,
                    case
                        when (r ->> 'am_cut_small')::boolean and (r ->> 'am_fruit')::boolean then 'cut small + fruit'
                        when (r ->> 'am_cut_small')::boolean then 'cut small'
                        when (r ->> 'am_fruit')::boolean then 'add fruit'
                    end,
                    case when (r ->> 'am_metal_plate')::boolean then 'metal plate' end)
                else concat_ws(', ',
                    (r ->> 'pm_bowls') || case when r ->> 'pm_bowls' = '1' then ' bowl' else ' bowls' end,
                    case when (r ->> 'pm_cut_small')::boolean then 'cut small' end)
            end
        )
        else r ->> field
    end
$$;

create or replace function private.change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    fields text[] := array['name', 'troop', 'sex', 'birth_year', 'chip', 'bio', 'description',
                           'fed_by', 'am_food', 'pm_food'];
    labels text[] := array['Name', 'Location', 'Sex', 'Birth year', 'Chip', 'Bio', 'Description',
                           'Fed By', 'AM Food', 'PM Food'];
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

-- Check: the introcage monkeys and their feeding (all Local Team, 1 plate,
-- 1 bowl to start with)
select m.name, e.name as introcage, m.fed_by, m.am_plates, m.am_cut_small, m.am_fruit,
       m.am_metal_plate, m.pm_bowls, m.pm_cut_small
from public.monkeys m
join public.enclosures e on e.id = m.introcage_id and e.type = 'introcage'
order by e.name, m.name;
