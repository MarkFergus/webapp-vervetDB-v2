-- Arrival Info: what is known about a new rescue's arrival (more than a bio,
-- and it may include names), for staff only. It replaces the Bio on a new
-- rescue's pop-up and Add / Edit form while it lives in a care unit; once
-- it's moved to a troop enclosure the Bio shows again (the Arrival Info
-- stays on its record).
--   monkey_id     the monkey it's about (one per monkey)
--   info          up to 2000 characters
--   updated_by_name / updated_at   who last changed it and when, filled in
--                 automatically (their full name)
-- Kept in its own table, not on the monkey, so that visitors can't read it:
--   read     staff only: any account with a role (admin, editor, maintenance)
--   write    editors and admins
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql and names.sql to have been run first (they have been).

begin;

create table public.arrival_info (
    monkey_id        bigint primary key references public.monkeys (id) on delete cascade,
    info             text not null
                     check (info = btrim(info) and info <> '' and char_length(info) <= 2000),
    updated_by       uuid references auth.users (id) on delete set null default auth.uid(),
    updated_by_name  text default public.my_name(),
    updated_at       timestamptz not null default now()
);

-- Who and when are noted again each time it's changed
create function public.arrival_info_touch()
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

create trigger arrival_info_touch
    before update on public.arrival_info
    for each row execute function public.arrival_info_touch();

alter table public.arrival_info enable row level security;

create policy "Staff can read arrival info"
    on public.arrival_info for select to authenticated
    using ((select public.can_log_maintenance()));

create policy "Editors can add arrival info"
    on public.arrival_info for insert to authenticated
    with check ((select public.is_editor()) and updated_by = (select auth.uid()));

create policy "Editors can change arrival info"
    on public.arrival_info for update to authenticated
    using ((select public.is_editor())) with check ((select public.is_editor()));

create policy "Editors can delete arrival info"
    on public.arrival_info for delete to authenticated
    using ((select public.is_editor()));

grant select on public.arrival_info to authenticated;
-- Only the text is typed in; who and when are filled in by the database
grant insert (monkey_id, info), update (info), delete on public.arrival_info to authenticated;

commit;

-- Check: none yet (this should list no rows)
select * from public.arrival_info;
