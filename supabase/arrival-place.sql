-- Where a new monkey was taken when they arrived, kept for good so it stays
-- true after they move on (the Timeline: "Orphaned, taken to Baby Care
-- (Dreamland)").
--   arrival_place     the place's name, as written then ("Dreamland")
--   arrival_place_id  the place itself, so a later rename doesn't lose it
-- Set by the database when a monkey with an Arrival Date is added: the home
-- they're added with. Adding an Arrival Date to an older monkey later sets
-- nothing, as nobody knows where they first went.
--
-- Monkeys who already have an Arrival Date are filled in below: where their
-- first move after arriving was from, or with no moves, their home. This
-- doesn't appear in Staff Activity or the summary email.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- The list at the end shows what was filled in, to check by eye.

begin;

alter table public.monkeys
    add column if not exists arrival_place text,
    add column if not exists arrival_place_id bigint references public.enclosures (id) on delete set null;

------------------------------------------------------------------------
-- A new monkey: the home they're added with
------------------------------------------------------------------------
-- security definer: reads the places in private on the editor's behalf
create or replace function private.set_arrival_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.arrival_place := null;
    new.arrival_place_id := null;
    if new.arrival_date is not null then
        new.arrival_place := private.place_text(new.in_sickbay, new.stay_introcage_id, new.introcage_id, new.troop_id);
        new.arrival_place_id := private.find_place(new.arrival_place);
    end if;
    return new;
end;
$$;

revoke all on function private.set_arrival_place() from public, anon, authenticated;

drop trigger if exists monkeys_set_arrival_place on public.monkeys;
create trigger monkeys_set_arrival_place
    before insert on public.monkeys
    for each row execute function private.set_arrival_place();

------------------------------------------------------------------------
-- Monkeys who already have an Arrival Date
------------------------------------------------------------------------
-- (triggers off: this isn't a staff edit, so no history or summary email)
alter table public.monkeys disable trigger user;

update public.monkeys m
set arrival_place = p.place,
    arrival_place_id = private.find_place(p.place)
from (
    select m2.id,
           case
               when first_move.id is not null then first_move.from_place
               else private.place_text(false, null, m2.introcage_id, m2.troop_id)
           end as place
    from public.monkeys m2
    left join lateral (
        select r.id, r.from_place
        from public.monkey_records r
        where r.monkey_id = m2.id
          and r.category = 'movement'
          and r.record_date >= m2.arrival_date
        order by r.record_date, r.id
        limit 1
    ) first_move on true
    where m2.arrival_date is not null
      and m2.arrival_place is null
) p
where m.id = p.id;

alter table public.monkeys enable trigger user;

commit;

-- Check: what was filled in (a blank place: not known)
select name, arrival_date, arrival_reason, arrival_place
from public.monkeys
where arrival_date is not null
order by arrival_date desc, name;
