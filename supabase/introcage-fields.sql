-- Three more details for introcages: Troop Door (yes / no), Plate Slot
-- (yes / no) and Sleeping Perches (1 to 10). Blank (null) = not recorded.
-- Troop enclosures don't have them. Admins change them like the other
-- details (the existing "Admins can change enclosures" rule covers them).
--
-- Supabase → SQL Editor → New query → paste this → Run.
-- Safe to run before or after the app update; running it twice does no harm.
begin;

alter table public.enclosures
    add column if not exists troop_door       boolean,
    add column if not exists plate_slot       boolean,
    add column if not exists sleeping_perches smallint;

alter table public.enclosures drop constraint if exists enclosures_sleeping_perches_check;
alter table public.enclosures
    add constraint enclosures_sleeping_perches_check check (sleeping_perches between 1 and 10);

alter table public.enclosures drop constraint if exists enclosures_introcage_details_check;
alter table public.enclosures
    add constraint enclosures_introcage_details_check
    check (type = 'introcage' or (troop_door is null and plate_slot is null and sleeping_perches is null));

-- Check: the new columns (all blank to start with)
select count(*) as introcages,
       count(troop_door) as troop_door_recorded,
       count(plate_slot) as plate_slot_recorded,
       count(sleeping_perches) as perches_recorded
from public.enclosures where type = 'introcage';

commit;
