-- Meds & Sickbay: Edit for vet visits and vasectomies, keeping a vasectomy
-- and its vet visit in step (after vet-visits.sql).
--
-- When one is changed (Records → Meds & Sickbay → Edit):
--   - its Medical record follows (as before)
--   - a vasectomy at a vet and its vet visit: a new date or vet on one
--     moves the other too (and its Medical record)
--   - a vasectomy changed to On Site: its vet visit is removed (it wasn't
--     one); changed from On Site to a vet: the vet visit is added
--   - a vet visit's reason changed from Vasectomy: its vasectomy is removed;
--     changed to Vasectomy: the vasectomy is added (Vasectomised? Yes)
--   (a vasectomy with no vet visit, e.g. the imported ones, keeps none
--   unless it's changed from On Site to a vet)
-- Deleting one still leaves the other as it is.
-- A vasectomy's Medical record now says "Vasectomised at Serala Animal
-- Clinic: …" or "Vasectomised on site: …" (was "At …" / "On site"): the
-- ones already there are changed to match.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

-- A vasectomy's record: "Vasectomised at Serala Animal Clinic: details" or
-- "Vasectomised on site"
create or replace function private.vasectomy_words(v public.vasectomies)
returns text
language sql
stable
set search_path = ''
as $$
    select left(
        case when v.vet = 'on_site' then 'Vasectomised on site'
             else 'Vasectomised at ' || private.vet_name(v.vet, v.vet_other) end
            || coalesce(': ' || v.details, ''),
        1000);
$$;
revoke all on function private.vasectomy_words(public.vasectomies) from public, anon, authenticated;

create or replace function private.vet_visit_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    rid bigint;
    vas public.vasectomies;
begin
    if tg_op = 'INSERT' then
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
        values
            (new.monkey_id, 'medical', new.visit_date, 'vet_visit', private.vet_visit_words(new),
             new.logged_by, new.logged_by_name)
        returning id into rid;
        update public.vet_visits set record_id = rid where id = new.id;
        -- A vasectomy at the vet: the vasectomy too (unless it's already
        -- there: added from Vasectomies, which added this visit)
        if new.reason = 'vasectomy' and not exists (
            select 1 from public.vasectomies
            where monkey_id = new.monkey_id and done_on = new.visit_date
        ) then
            insert into public.vasectomies
                (monkey_id, done_on, vet, vet_other, vet_visit_id, logged_by, logged_by_name)
            values
                (new.monkey_id, new.visit_date, new.practice, new.practice_other, new.id,
                 new.logged_by, new.logged_by_name);
        end if;
    elsif tg_op = 'UPDATE' then
        update public.monkey_records
        set record_date = new.visit_date, details = private.vet_visit_words(new)
        where id = new.record_id;
        select * into vas from public.vasectomies where vet_visit_id = new.id limit 1;
        if vas.id is not null then
            if new.reason <> 'vasectomy' then
                -- (not a vasectomy after all: its record goes with it)
                delete from public.vasectomies where id = vas.id;
            else
                -- (only if it's different: so the two don't keep
                -- changing each other)
                update public.vasectomies
                set done_on = new.visit_date, vet = new.practice, vet_other = new.practice_other
                where id = vas.id
                  and (done_on, vet, coalesce(vet_other, ''))
                      is distinct from (new.visit_date, new.practice, coalesce(new.practice_other, ''));
            end if;
        elsif new.reason = 'vasectomy' and old.reason <> 'vasectomy' and not exists (
            select 1 from public.vasectomies
            where monkey_id = new.monkey_id and done_on = new.visit_date
        ) then
            insert into public.vasectomies
                (monkey_id, done_on, vet, vet_other, vet_visit_id, logged_by, logged_by_name)
            values
                (new.monkey_id, new.visit_date, new.practice, new.practice_other, new.id,
                 coalesce(auth.uid(), new.logged_by), coalesce(public.my_name(), new.logged_by_name));
        end if;
    else
        delete from public.monkey_records where id = old.record_id;
    end if;
    return null;
end;
$$;

create or replace function private.vasectomy_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    rid bigint;
    vid bigint;
begin
    if tg_op = 'INSERT' then
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
        values
            (new.monkey_id, 'medical', new.done_on, 'vasectomy', private.vasectomy_words(new),
             new.logged_by, new.logged_by_name)
        returning id into rid;
        update public.vasectomies set record_id = rid where id = new.id;
        update public.monkeys set vasectomised = true where id = new.monkey_id;
        -- At a vet: the vet visit too (unless this came from one)
        if new.vet <> 'on_site' and new.vet_visit_id is null then
            select id into vid from public.vet_visits
            where monkey_id = new.monkey_id and visit_date = new.done_on and reason = 'vasectomy'
            limit 1;
            if vid is null then
                insert into public.vet_visits
                    (monkey_id, visit_date, practice, practice_other, reason, details, logged_by, logged_by_name)
                values
                    (new.monkey_id, new.done_on, new.vet, new.vet_other, 'vasectomy', new.details,
                     new.logged_by, new.logged_by_name)
                returning id into vid;
            end if;
            update public.vasectomies set vet_visit_id = vid where id = new.id;
        end if;
    elsif tg_op = 'UPDATE' then
        update public.monkey_records
        set record_date = new.done_on, details = private.vasectomy_words(new)
        where id = new.record_id;
        if new.vet_visit_id is not null then
            if new.vet = 'on_site' then
                -- (done on site after all: no vet visit)
                delete from public.vet_visits where id = new.vet_visit_id;
            else
                update public.vet_visits
                set visit_date = new.done_on, practice = new.vet, practice_other = new.vet_other
                where id = new.vet_visit_id
                  and (visit_date, practice, coalesce(practice_other, ''))
                      is distinct from (new.done_on, new.vet, coalesce(new.vet_other, ''));
            end if;
        elsif old.vet = 'on_site' and new.vet <> 'on_site' then
            -- (at a vet after all: the vet visit, in the changer's name)
            insert into public.vet_visits
                (monkey_id, visit_date, practice, practice_other, reason, details, logged_by, logged_by_name)
            values
                (new.monkey_id, new.done_on, new.vet, new.vet_other, 'vasectomy', new.details,
                 coalesce(auth.uid(), new.logged_by), coalesce(public.my_name(), new.logged_by_name))
            returning id into vid;
            update public.vasectomies set vet_visit_id = vid where id = new.id;
        end if;
    else
        delete from public.monkey_records where id = old.record_id;
    end if;
    return null;
end;
$$;

revoke all on function private.vet_visit_changed() from public, anon, authenticated;
revoke all on function private.vasectomy_changed() from public, anon, authenticated;

-- (the vet visit's trigger also on a new reason: already, in vet-visits.sql)

-- The vasectomy records already there, in the new words (not a staff edit:
-- not in Staff Activity or Latest News)
alter table public.monkey_records disable trigger user;
update public.monkey_records r
set details = private.vasectomy_words(v)
from public.vasectomies v
where v.record_id = r.id and r.details is distinct from private.vasectomy_words(v);
alter table public.monkey_records enable trigger user;

select 'meds-edit.sql: ready' as done,
    (select count(*) from public.monkey_records where category = 'vasectomy' and details like 'Vasectomised %') as vasectomy_records_reworded;
