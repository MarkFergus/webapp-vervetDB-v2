-- Monitoring: what the people monitoring a troop should look out for, and
-- updates on injuries. Both are for staff only, and both feed the Troop
-- Monitoring Notes PDF (Documents → Troop Monitoring).
--
-- monitoring: one row per monkey (only for monkeys that have something)
--   monkey_id        the monkey it's about
--   condition_check  true: listed under "Check general condition"
--   notes            Notes for Monitoring, up to 1000 characters (e.g. check
--                    she's eating ok, watch interactions): under "Other Notes"
--   updated_by_name / updated_at   who last changed it and when, filled in
--                    automatically
--   read     staff only: any account with a role (admin, editor, maintenance)
--   write    admins (for now)
--
-- injury_updates: dated updates on an injury (e.g. "wound healing well")
--   injury_id        the injury it's about (deleted with it)
--   update_date      the day it was seen
--   details          up to 500 characters
--   logged_by / logged_by_name / logged_at   who added it and when, filled in
--                    automatically
--   read     staff only
--   add      editors and admins
--   change / delete  admins, or whoever added it
-- (the same as the injuries themselves)
--
-- Kept in their own tables, not on the monkey, so that visitors can't read
-- them.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql, names.sql and injuries.sql to have been run first (they
-- have been).

begin;

-- ---- Monitoring ----

create table public.monitoring (
    monkey_id        bigint primary key references public.monkeys (id) on delete cascade,
    condition_check  boolean not null default false,
    notes            text
                     check (notes is null or (notes = btrim(notes) and notes <> '' and char_length(notes) <= 1000)),
    updated_by       uuid references auth.users (id) on delete set null default auth.uid(),
    updated_by_name  text default public.my_name(),
    updated_at       timestamptz not null default now()
);

-- Who and when are noted again each time it's changed
create function public.monitoring_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.updated_by := auth.uid();
    new.updated_by_name := public.my_name();
    new.updated_at := now();
    return new;
end;
$$;

create trigger monitoring_touch
    before update on public.monitoring
    for each row execute function public.monitoring_touch();

alter table public.monitoring enable row level security;

create policy "Staff can read monitoring"
    on public.monitoring for select to authenticated
    using ((select public.can_log_maintenance()));

create policy "Admins can add monitoring"
    on public.monitoring for insert to authenticated
    with check ((select public.is_admin()) and updated_by = (select auth.uid()));

create policy "Admins can change monitoring"
    on public.monitoring for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admins can delete monitoring"
    on public.monitoring for delete to authenticated
    using ((select public.is_admin()));

grant select on public.monitoring to authenticated;
-- Only the tick and the notes are typed in; who and when are filled in by
-- the database
grant insert (monkey_id, condition_check, notes), update (condition_check, notes), delete
    on public.monitoring to authenticated;

-- ---- Injury updates ----

create table public.injury_updates (
    id              bigint generated always as identity primary key,
    injury_id       bigint not null references public.injuries (id) on delete cascade,
    update_date     date not null,
    details         text not null
                    check (details = btrim(details) and details <> '' and char_length(details) <= 500),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now()
);

create index injury_updates_injury_id_idx
    on public.injury_updates (injury_id, update_date);

alter table public.injury_updates enable row level security;

create policy "Staff can read injury updates"
    on public.injury_updates for select to authenticated
    using ((select public.can_log_maintenance()));

create policy "Editors can add injury updates"
    on public.injury_updates for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change injury updates"
    on public.injury_updates for update to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

create policy "Admins or the writer can delete injury updates"
    on public.injury_updates for delete to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

grant select on public.injury_updates to authenticated;
-- Only the date and details are typed in; who and when are filled in by
-- the database
grant insert (injury_id, update_date, details), update (update_date, details), delete
    on public.injury_updates to authenticated;

commit;

-- Check: none yet (both of these should list no rows)
select * from public.monitoring;
select * from public.injury_updates;
