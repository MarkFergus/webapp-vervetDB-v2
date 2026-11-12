-- Meds & Sickbay: Vet Visits and Vasectomies (Records → Meds & Sickbay).
--
--   vet_visits    a monkey's visit to a vet: the date, the practice (Serala
--                 Animal Clinic, Tzaneen Animal Clinic, Dr GJ Scheepers
--                 Animal & Bird Clinic, or another, typed in), the reason
--                 and details (up to 500 characters)
--   vasectomies   a monkey's vasectomy: the date, where (On Site, or one of
--                 the vets), details
--   monkeys.vasectomised   Vasectomised? on the Full Profile (males): set to
--                 Yes by a vasectomy, and can be changed by hand in Edit
--
-- By themselves (the database does these, whoever adds them):
--   - every vet visit and vasectomy adds a Medical record to the monkey
--     ("Vet Visit": "Assessment at Serala Animal Clinic: …"; "Vasectomy":
--     "At Serala Animal Clinic" or "On site"), kept in step when it's
--     changed, and gone when it's deleted
--   - a vet visit for a Vasectomy adds the vasectomy too
--   - a vasectomy at a vet (not On Site) adds the vet visit too
--     (either way round, nothing is added twice: one of each)
--   - a vasectomy sets the monkey's Vasectomised? to Yes (deleting it
--     leaves Vasectomised? as it is)
--
-- Who can do what: staff read; editors and admins add; admins, or whoever
-- added it, change or delete (as Integration Reports).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monkey-records.sql, last-seen.sql and staff-activity.sql to have
-- been run first (they have been).

begin;

-- Medical gets Vasectomy (the rest as last-seen.sql left them)
alter table public.monkey_records drop constraint if exists monkey_records_category_check;
alter table public.monkey_records
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'escape', 'integration', 'status', 'behaviour', 'trapped'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation', 'food_monitoring', 'deworming', 'microchip', 'vasectomy'))
    );

-- Vasectomised? (null: not recorded, i.e. no)
alter table public.monkeys add column if not exists vasectomised boolean;

------------------------------------------------------------------------
-- The tables
------------------------------------------------------------------------

create table if not exists public.vet_visits (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    visit_date      date not null,
    practice        text not null check (practice in ('serala', 'tzaneen', 'scheepers', 'other')),
    practice_other  text check (practice_other is null
                         or (practice_other = btrim(practice_other) and practice_other <> '' and char_length(practice_other) <= 100)),
    reason          text not null
                    check (reason in ('assessment', 'check_up', 'vasectomy', 'emergency', 'surgery', 'euthanasia', 'necropsy', 'other')),
    details         text check (details is null or (details = btrim(details) and details <> '' and char_length(details) <= 500)),
    -- its Medical record
    record_id       bigint references public.monkey_records (id) on delete set null,
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint vet_visits_other_check check ((practice = 'other') = (practice_other is not null))
);
create index if not exists vet_visits_date_idx on public.vet_visits (visit_date desc);
create index if not exists vet_visits_monkey_idx on public.vet_visits (monkey_id, visit_date desc);

create table if not exists public.vasectomies (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    done_on         date not null,
    vet             text not null check (vet in ('on_site', 'serala', 'tzaneen', 'scheepers', 'other')),
    vet_other       text check (vet_other is null
                         or (vet_other = btrim(vet_other) and vet_other <> '' and char_length(vet_other) <= 100)),
    details         text check (details is null or (details = btrim(details) and details <> '' and char_length(details) <= 500)),
    -- the vet visit it was part of (none: on site)
    vet_visit_id    bigint references public.vet_visits (id) on delete set null,
    -- its Medical record
    record_id       bigint references public.monkey_records (id) on delete set null,
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint vasectomies_other_check check ((vet = 'other') = (vet_other is not null))
);
create index if not exists vasectomies_date_idx on public.vasectomies (done_on desc);
create index if not exists vasectomies_monkey_idx on public.vasectomies (monkey_id);

------------------------------------------------------------------------
-- Who can do what
------------------------------------------------------------------------

alter table public.vet_visits enable row level security;
alter table public.vasectomies enable row level security;

drop policy if exists "Staff can read vet visits" on public.vet_visits;
create policy "Staff can read vet visits"
    on public.vet_visits for select to authenticated
    using ((select public.can_log_maintenance()));
drop policy if exists "Editors can add vet visits" on public.vet_visits;
create policy "Editors can add vet visits"
    on public.vet_visits for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));
drop policy if exists "Admins or the writer can change vet visits" on public.vet_visits;
create policy "Admins or the writer can change vet visits"
    on public.vet_visits for update to authenticated
    using ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())));
drop policy if exists "Admins or the writer can delete vet visits" on public.vet_visits;
create policy "Admins or the writer can delete vet visits"
    on public.vet_visits for delete to authenticated
    using ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

drop policy if exists "Staff can read vasectomies" on public.vasectomies;
create policy "Staff can read vasectomies"
    on public.vasectomies for select to authenticated
    using ((select public.can_log_maintenance()));
drop policy if exists "Editors can add vasectomies" on public.vasectomies;
create policy "Editors can add vasectomies"
    on public.vasectomies for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));
drop policy if exists "Admins or the writer can change vasectomies" on public.vasectomies;
create policy "Admins or the writer can change vasectomies"
    on public.vasectomies for update to authenticated
    using ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())));
drop policy if exists "Admins or the writer can delete vasectomies" on public.vasectomies;
create policy "Admins or the writer can delete vasectomies"
    on public.vasectomies for delete to authenticated
    using ((select public.is_editor()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

grant select on public.vet_visits, public.vasectomies to authenticated;
-- Only what's typed in; who, when and the links are filled in by the database
grant insert (monkey_id, visit_date, practice, practice_other, reason, details),
      update (visit_date, practice, practice_other, reason, details), delete
    on public.vet_visits to authenticated;
grant insert (monkey_id, done_on, vet, vet_other, details),
      update (done_on, vet, vet_other, details), delete
    on public.vasectomies to authenticated;

------------------------------------------------------------------------
-- Their words
------------------------------------------------------------------------

-- "Serala Animal Clinic", "On site", or the one typed in
create or replace function private.vet_name(code text, other text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case code
        when 'serala' then 'Serala Animal Clinic'
        when 'tzaneen' then 'Tzaneen Animal Clinic'
        when 'scheepers' then 'Dr GJ Scheepers Animal & Bird Clinic'
        when 'on_site' then 'On site'
        else coalesce(nullif(btrim(other), ''), 'Another vet')
    end;
$$;

-- A vet visit's record: "Assessment at Serala Animal Clinic: details"
create or replace function private.vet_visit_words(v public.vet_visits)
returns text
language sql
stable
set search_path = ''
as $$
    select left(
        case v.reason
            when 'check_up' then 'Check-Up'
            else initcap(v.reason)
        end || ' at ' || private.vet_name(v.practice, v.practice_other)
            || coalesce(': ' || v.details, ''),
        1000);
$$;

-- A vasectomy's record: "At Serala Animal Clinic: details" or "On site"
create or replace function private.vasectomy_words(v public.vasectomies)
returns text
language sql
stable
set search_path = ''
as $$
    select left(
        case when v.vet = 'on_site' then 'On site' else 'At ' || private.vet_name(v.vet, v.vet_other) end
            || coalesce(': ' || v.details, ''),
        1000);
$$;

------------------------------------------------------------------------
-- What happens by itself (security definer: editors can't add records or
-- change monkeys themselves here; it's all in the changer's name)
------------------------------------------------------------------------

create or replace function private.vet_visit_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    rid bigint;
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
    else
        delete from public.monkey_records where id = old.record_id;
    end if;
    return null;
end;
$$;

revoke all on function private.vet_visit_changed() from public, anon, authenticated;
revoke all on function private.vasectomy_changed() from public, anon, authenticated;
revoke all on function private.vet_name(text, text) from public, anon, authenticated;
revoke all on function private.vet_visit_words(public.vet_visits) from public, anon, authenticated;
revoke all on function private.vasectomy_words(public.vasectomies) from public, anon, authenticated;

-- (an edit to what was typed in, not the links being filled in)
drop trigger if exists vet_visits_changed on public.vet_visits;
create trigger vet_visits_changed
    after insert or delete or update of visit_date, practice, practice_other, reason, details
    on public.vet_visits
    for each row execute function private.vet_visit_changed();

drop trigger if exists vasectomies_changed on public.vasectomies;
create trigger vasectomies_changed
    after insert or delete or update of done_on, vet, vet_other, details
    on public.vasectomies
    for each row execute function private.vasectomy_changed();

-- Staff Activity
drop trigger if exists vet_visits_record_change on public.vet_visits;
create trigger vet_visits_record_change
    after insert or update or delete on public.vet_visits
    for each row execute function private.record_change();
drop trigger if exists vasectomies_record_change on public.vasectomies;
create trigger vasectomies_record_change
    after insert or update or delete on public.vasectomies
    for each row execute function private.record_change();

commit;

-- Check: should say "ready" three times
select
    (select case when count(*) = 2 then 'ready' else 'not ready' end
     from information_schema.tables where table_schema = 'public' and table_name in ('vet_visits', 'vasectomies')) as tables,
    (select case when count(*) = 1 then 'ready' else 'not ready' end
     from information_schema.columns where table_schema = 'public' and table_name = 'monkeys' and column_name = 'vasectomised') as vasectomised,
    (select case when count(*) = 2 then 'ready' else 'not ready' end
     from pg_trigger where tgname in ('vet_visits_changed', 'vasectomies_changed')) as triggers;
