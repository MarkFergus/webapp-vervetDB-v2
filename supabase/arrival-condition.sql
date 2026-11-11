-- Condition Received: the condition a monkey arrived in (Healthy, Injured
-- or Sick; blank = not recorded), in the Full Profile's Arrival section,
-- beside Arrival Date and Arrival Reason. Changes show in Staff Activity
-- ("Condition Received: Healthy → Injured").
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs arrival-details.sql and latest-news.sql to have been run first
-- (they have been).

begin;

alter table public.monkeys
    add column if not exists arrival_condition text
        constraint monkeys_arrival_condition_check
        check (arrival_condition in ('healthy', 'injured', 'sick'));

-- Staff Activity's lines for a monkey change: as latest-news.sql, with
-- Condition Received added
create or replace function private.more_change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    fields text[] := array['species', 'birth_date', 'arrival_date', 'arrival_reason', 'arrival_condition'];
    labels text[] := array['Species', 'Birth Date', 'Arrival Date', 'Arrival Reason', 'Condition Received'];
    lines text[] := '{}';
    before_text text;
    after_text text;
begin
    if old_row is null or new_row is null then
        return lines;
    end if;
    for i in 1 .. array_length(fields, 1) loop
        before_text := initcap(replace(old_row ->> fields[i], '_', ' '));
        after_text := initcap(replace(new_row ->> fields[i], '_', ' '));
        if before_text is distinct from after_text then
            lines := lines || (labels[i] || ': ' || private.shown(before_text) || ' → ' || private.shown(after_text));
        end if;
    end loop;
    return lines;
end;
$$;

commit;

-- Check: should list arrival_condition
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'monkeys' and column_name = 'arrival_condition';
