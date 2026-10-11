-- In Sickbay: a monkey (troop or introcage) who is in Sickbay for now. Its
-- home (troop or introcage) never changes; this only says it's in Sickbay at
-- the moment, so the AM Plates List counts an introcage monkey as fed by
-- Sickbay until it returns (its own Fed By setting is left alone, so it
-- applies again by itself).
--   in_sickbay      true while it's in Sickbay
--   sickbay_since   the date it went in (optional)
--   sickbay_note    a few words on why (optional)
-- The Change History lists "Sickbay: No → Yes" (and back).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs feeding.sql to have been run first.

begin;

alter table public.monkeys
    add column in_sickbay boolean not null default false,
    add column sickbay_since date,
    add column sickbay_note text
        constraint monkeys_sickbay_note_check check (char_length(sickbay_note) <= 200);

------------------------------------------------------------------------
-- The history's words: "Sickbay: No → Yes"
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
        -- In Sickbay: only once this file has run (older history rows don't have it)
        when field = 'in_sickbay' then case
            when r is null or not (r ? 'in_sickbay') then null
            when (r ->> 'in_sickbay')::boolean then 'Yes'
            else 'No'
        end
        -- Feeding: only for a monkey in an introcage (and only once
        -- feeding.sql has run: older history rows don't have it)
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
                           'fed_by', 'am_food', 'pm_food', 'in_sickbay'];
    labels text[] := array['Name', 'Location', 'Sex', 'Birth year', 'Chip', 'Bio', 'Description',
                           'Fed By', 'AM Food', 'PM Food', 'Sickbay'];
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
            -- Added or deleted: list what's filled in (name and location are in the
            -- heading; "in Sickbay" only when it was)
            if fields[i] not in ('name', 'troop')
               and coalesce(after_text, before_text, '') <> ''
               and not (fields[i] = 'in_sickbay' and coalesce(after_text, before_text) = 'No') then
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

-- Check: nobody is in Sickbay to start with (this should list no rows)
select name, in_sickbay, sickbay_since, sickbay_note
from public.monkeys
where in_sickbay
order by name;
