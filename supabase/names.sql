-- Names: each account's full name, shown instead of its email address
-- ("Logged by Mark Fergus Ashcroft" in the maintenance log, "By Mark Fergus
-- Ashcroft" in the daily summary email). Only admins set names, here in the
-- SQL Editor (set-name.sql); nobody can change them from the website.
-- Accounts without a name yet show as before (the email, or the part before
-- the @), so nothing breaks while names are being added.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql to have been run first.

begin;

-- One name per account
create table public.profiles (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    full_name   text not null
                check (full_name = btrim(full_name) and length(full_name) between 1 and 80),
    updated_at  timestamptz not null default now()
);

-- Staff (any role) can see everyone's names, e.g. who logged what. Nobody
-- can add or change them from the website: no rules for that, on purpose.
alter table public.profiles enable row level security;
create policy "Staff can read names"
    on public.profiles for select to authenticated
    using ((select public.can_log_maintenance()));
grant select on public.profiles to authenticated;

-- The name of whoever is making this request: their full name, or until
-- they have one, the part of their email before the @
create function public.my_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select full_name from public.profiles where user_id = (select auth.uid())),
        split_part(auth.jwt() ->> 'email', '@', 1)
    )
$$;

-- New maintenance entries: logged in their full name
alter table public.maintenance alter column logged_by_name set default public.my_name();

-- The change history: the name of whoever made each change, kept with it
-- (filled in as each change is noted down)
alter table private.monkey_changes add column changed_by_name text;

create function private.fill_changed_by_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.changed_by_name := (select full_name from public.profiles where user_id = new.changed_by);
    return new;
end;
$$;
revoke all on function private.fill_changed_by_name() from public, anon, authenticated;

create trigger monkey_changes_fill_name
    before insert on private.monkey_changes
    for each row execute function private.fill_changed_by_name();

-- The daily summary: "By <name>" instead of the email. The name kept with
-- the change, or the account's name now (changes from before names), or
-- the email as before. Changes the live summary in place, so nothing else
-- in it is touched.
do $$
declare
    def text := pg_get_functiondef('private.summary_email(timestamptz, timestamptz)'::regprocedure);
    old_who text := 'coalesce(c.changed_by_email, ''unknown'')';
    new_who text := 'coalesce(c.changed_by_name, '
        || '(select p.full_name from public.profiles p where p.user_id = c.changed_by), '
        || 'c.changed_by_email, ''unknown'')';
begin
    if position(old_who in def) = 0 then
        raise exception 'The summary email has changed since this was written: not updated';
    end if;
    execute replace(def, old_who, new_who);
end;
$$;

commit;

-- Check: everyone with an account, their role and name (blank until set)
select u.email, e.role, p.full_name
from public.editors e
join auth.users u on u.id = e.user_id
left join public.profiles p on p.user_id = e.user_id
order by e.role, u.email;
