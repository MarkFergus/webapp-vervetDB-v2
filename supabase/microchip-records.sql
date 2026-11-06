-- Microchip records: a new Medical category. Adding one also adds its number
-- to the monkey's chip ("1011", then "1011 & 1604"), both or neither.
--   details   "Microchipped 12345", then ": a note" (optional)
--   A number the monkey already has isn't added twice, so a record can be
--   added later for an existing chip, with its real date.
--   Changing or deleting a record leaves the monkey's chip as it is.
-- And no more limit of two chips.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm.

begin;

-- Medical gets Microchip (the rest as deworming-results.sql left them)
alter table public.monkey_records
    drop constraint monkey_records_category_check,
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'observation', 'escape', 'integration', 'status'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation', 'food_monitoring', 'deworming', 'microchip'))
    );

-- A Microchip record always starts with its number
alter table public.monkey_records drop constraint if exists monkey_records_microchip_words;
alter table public.monkey_records
    add constraint monkey_records_microchip_words check (
        category <> 'microchip' or details ~ '^Microchipped \d+(: .+)?$'
    );

-- Any number of chips: the old rule stopped at two (whatever it's called)
do $$
declare
    rule record;
begin
    for rule in
        select conname from pg_constraint
        where conrelid = 'public.monkeys'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%chip%'
    loop
        execute format('alter table public.monkeys drop constraint %I', rule.conname);
    end loop;
end $$;
alter table public.monkeys
    add constraint monkeys_chip_check check (chip ~ '^(\d+( & \d+)*)?$');

-- A new record: its number onto the monkey. (Only admins can add records, by
-- their own rule; this runs with the rights to change an archived monkey too)
create or replace function private.microchip_record_adds_chip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    number text := substring(new.details from '^Microchipped (\d+)');
begin
    update public.monkeys
    set chip = case
        when coalesce(chip, '') = '' then number
        else chip || ' & ' || number
    end
    where id = new.monkey_id
      and not coalesce(number = any (string_to_array(chip, ' & ')), false);
    return null;
end;
$$;
revoke all on function private.microchip_record_adds_chip() from public;

drop trigger if exists monkey_records_microchip on public.monkey_records;
create trigger monkey_records_microchip
    after insert on public.monkey_records
    for each row
    when (new.category = 'microchip')
    execute function private.microchip_record_adds_chip();

commit;

-- Check: should say "ready" twice
select
    case when pg_get_constraintdef(c.oid) like '%microchip%' then 'ready' else 'not updated' end as microchip_category,
    (select case when count(*) = 1 then 'ready' else 'not updated' end
     from pg_trigger where tgname = 'monkey_records_microchip') as chip_trigger
from pg_constraint c
where c.conname = 'monkey_records_category_check';
