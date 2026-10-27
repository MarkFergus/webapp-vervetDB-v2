-- Fed By's words: "Mainfeed" (the area that feeds it) instead of "Local
-- Team", to match "Sickbay": both are the areas responsible for feeding.
-- Only the words change (the history, My Changes, the summary email): the
-- saved value is still 'local_team'. Old history rows show the new words too.
-- (The same function as in introcage-stays.sql, with that one word changed.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

------------------------------------------------------------------------
-- The history's words: "Fed By: Mainfeed → Sickbay"
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
        -- Status: only once released-status.sql has run (older history rows don't have it)
        when field = 'status' then case
            when r is null or not (r ? 'status') then null
            when r ->> 'status' = 'released' then 'Released'
            else 'Sanctuary'
        end
        -- In Sickbay: only once sickbay.sql has run (older history rows don't have it)
        when field = 'in_sickbay' then case
            when r is null or not (r ? 'in_sickbay') then null
            when (r ->> 'in_sickbay')::boolean then 'Yes'
            else 'No'
        end
        -- A stay: only once this file has run (older history rows don't have it)
        when field = 'stay' then case
            when r is null or not (r ? 'stay_introcage_id') then null
            when r ->> 'stay_introcage_id' is null then 'Home'
            else (select e.name from public.enclosures e where e.id = (r ->> 'stay_introcage_id')::bigint)
        end
        -- Feeding: only for a monkey in an introcage, at home or staying
        -- there (and only once feeding.sql has run: older history rows
        -- don't have it)
        when field in ('fed_by', 'am_food', 'pm_food') then (
            case
                when r is null or not (r ? 'fed_by') then null
                when not exists (
                    select 1 from public.enclosures e
                    where e.id in ((r ->> 'introcage_id')::bigint, (r ->> 'stay_introcage_id')::bigint)
                        and e.type = 'introcage'
                ) then null
                when field = 'fed_by' then
                    case r ->> 'fed_by' when 'sickbay' then 'Sickbay' else 'Mainfeed' end
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

commit;

-- Check: should say Mainfeed
select private.field_text(
    jsonb_build_object('fed_by', 'local_team', 'introcage_id', (select id from public.enclosures where type = 'introcage' limit 1)),
    'fed_by'
) as fed_by_words;
