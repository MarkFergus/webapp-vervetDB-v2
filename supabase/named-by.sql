-- Named By: who named a monkey (often an adopter), for staff only. Shown in
-- the Arrival section of the Full Profile and typed in beside Name in Add
-- New Monkey / the Full Profile's Edit.
--   monkey_id     the monkey (one per monkey)
--   name          up to 100 characters
--   updated_by_name / updated_at   who last changed it and when, filled in
--                 automatically (their full name)
-- Kept in its own table, like arrival_info, so that visitors can't read it
-- (the names are people's personal details):
--   read     staff only: any account with a role (admin, editor, maintenance)
--   write    editors and admins
-- Changes show in Staff Activity.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs arrival-info.sql and staff-activity.sql to have been run first (they have been).

begin;

create table public.named_by (
    monkey_id        bigint primary key references public.monkeys (id) on delete cascade,
    name             text not null
                     check (name = btrim(name) and name <> '' and char_length(name) <= 100),
    updated_by       uuid references auth.users (id) on delete set null default auth.uid(),
    updated_by_name  text default public.my_name(),
    updated_at       timestamptz not null default now()
);

-- Who and when are noted again each time it's changed (as Arrival Info)
create trigger named_by_touch
    before update on public.named_by
    for each row execute function public.arrival_info_touch();

-- Staff Activity
create trigger named_by_record_change
    after insert or update or delete on public.named_by
    for each row execute function private.record_change();

alter table public.named_by enable row level security;

create policy "Staff can read named by"
    on public.named_by for select to authenticated
    using ((select public.can_log_maintenance()));

create policy "Editors can add named by"
    on public.named_by for insert to authenticated
    with check ((select public.is_editor()) and updated_by = (select auth.uid()));

create policy "Editors can change named by"
    on public.named_by for update to authenticated
    using ((select public.is_editor())) with check ((select public.is_editor()));

create policy "Editors can delete named by"
    on public.named_by for delete to authenticated
    using ((select public.is_editor()));

grant select on public.named_by to authenticated;
-- Only the name is typed in; who and when are filled in by the database
grant insert (monkey_id, name), update (name), delete on public.named_by to authenticated;

commit;

-- Check: none yet (this should list no rows)
select * from public.named_by;
