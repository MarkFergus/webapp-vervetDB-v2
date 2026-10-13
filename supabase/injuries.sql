-- Injuries: a staff record of a monkey's injuries, shown in the Injuries
-- section of its pop-up (staff only). An injury stays current until it's
-- marked Healed; then it moves to the History (it is never lost).
--   monkey_id     the monkey it's about
--   injury_date   when it happened (or was found)
--   description   what it is (up to 500 characters)
--   logged_by / logged_by_name / logged_at   who added it and when, filled
--                 in automatically (their full name, as the maintenance log)
--   healed_on / healed_by / healed_by_name   when it was marked healed and
--                 by whom (empty while it's current)
-- Who can do what (the database enforces it, not just the website):
--   read     staff only: any account with a role (admin, editor, maintenance)
--   add      editors and admins, in their own name
--   healed   editors and admins (set_injury_healed, below), on any injury
--   change / delete   admins, or whoever added it
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql and names.sql to have been run first (they have been).

begin;

create table public.injuries (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    injury_date     date not null,
    description     text not null
                    check (description = btrim(description) and description <> '' and char_length(description) <= 500),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    healed_on       date,
    healed_by       uuid references auth.users (id) on delete set null,
    healed_by_name  text
);

create index injuries_monkey_id_idx
    on public.injuries (monkey_id, injury_date desc);

alter table public.injuries enable row level security;

-- Staff only: visitors (not signed in) can't read them
create policy "Staff can read injuries"
    on public.injuries for select to authenticated
    using ((select public.can_log_maintenance()));

-- An injury is always in the name of whoever adds it
create policy "Editors can add injuries"
    on public.injuries for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change injuries"
    on public.injuries for update to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())))
    with check ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

create policy "Admins or the writer can delete injuries"
    on public.injuries for delete to authenticated
    using ((select public.can_log_maintenance()) and ((select public.is_admin()) or logged_by = (select auth.uid())));

grant select on public.injuries to authenticated;
-- Only the date and description are typed in; who and when are filled in by
-- the database. Healed is set through set_injury_healed only.
grant insert (monkey_id, injury_date, description), update (injury_date, description), delete
    on public.injuries to authenticated;

-- Healed? (healed = true): today, in the name of whoever marks it.
-- Reopen (healed = false): back to current. Editors and admins, on any injury.
create function public.set_injury_healed(injury_id bigint, healed boolean)
returns setof public.injuries
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_editor() then
        raise exception 'Only editors and admins can mark injuries healed.';
    end if;
    return query
        update public.injuries
        set healed_on = case when healed then current_date end,
            healed_by = case when healed then auth.uid() end,
            healed_by_name = case when healed then public.my_name() end
        where id = injury_id
        returning *;
end;
$$;

revoke execute on function public.set_injury_healed(bigint, boolean) from public, anon;
grant execute on function public.set_injury_healed(bigint, boolean) to authenticated;

commit;

-- Check: none yet (this should list no rows)
select * from public.injuries;
