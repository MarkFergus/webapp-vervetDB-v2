-- Lets a monkey's chip be "unknown" as well as "no chip":
--   chip = ''   → No Chip
--   chip = null → Unknown
-- The edit form's "Unknown?" button saves null.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Existing blank chips stay "No Chip". Running it twice does no harm.

alter table public.monkeys alter column chip drop not null;

-- Change history: show "No Chip" / "Unknown" instead of "(blank)" for both
create or replace function private.field_text(r jsonb, field text)
returns text
language sql
stable
set search_path = ''
as $$
    select case field
        when 'troop' then (
            select t.name from public.troops t where t.id = (r ->> 'troop_id')::bigint
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

-- Check: how many monkeys have a chip, no chip, or unknown
select
    count(*) filter (where chip <> '') as chipped,
    count(*) filter (where chip = '') as no_chip,
    count(*) filter (where chip is null) as unknown
from public.monkeys;
