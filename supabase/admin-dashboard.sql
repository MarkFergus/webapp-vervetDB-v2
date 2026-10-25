-- The Admin Dashboard (#admin, admins only): every staff account, and
-- changing their user type in the website.
--   staff_list()              every account: its name (set-name.sql),
--                             email and user type (none: no access yet)
--   set_staff_role(id, role)  gives an account a user type: editor,
--                             maintenance or limited (nobody is made an
--                             admin here: ask Mark, who uses make-admin.sql)
-- Admins only (the database checks, not just the website). Nobody can
-- change their own user type here, so an admin can't lock themselves out.
--
-- And a new user type, limited: sees everything staff see (Full Profile,
-- Monitoring Notes, Injuries, Documents…) but can't change anything, not
-- even their own old entries. For taking someone's editing away for a
-- while, or showing someone the whole app. (Their account photo they can
-- still change.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql and names.sql to have been run first (they have been).

begin;

------------------------------------------------------------------------
-- The limited user type
------------------------------------------------------------------------
-- (the old list of user types, whatever it's called, replaced)
do $$
declare
    old_check text;
begin
    for old_check in
        select conname from pg_constraint
        where conrelid = 'public.editors'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%role%'
    loop
        execute format('alter table public.editors drop constraint %I', old_check);
    end loop;
end;
$$;
alter table public.editors
    add constraint editors_role_check check (role in ('admin', 'editor', 'maintenance', 'limited'));

-- Whether the signed-in account is limited
create or replace function public.is_limited()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.editors
        where user_id = (select auth.uid()) and role = 'limited'
    )
$$;

-- Limited accounts can't add, change or delete anything. (Monkeys, photos,
-- arrival info, enclosures and monitoring already need an editor or an
-- admin; these are the ones any staff account could write to.) Added as
-- extra "restrictive" rules, so every rule already there stays as it is.
do $$
declare
    t text;
begin
    foreach t in array array['maintenance', 'monkey_records', 'injuries', 'integration_reports', 'injury_updates', 'milk_totals']
    loop
        execute format('drop policy if exists "Limited accounts can''t add" on public.%I', t);
        execute format('drop policy if exists "Limited accounts can''t change" on public.%I', t);
        execute format('drop policy if exists "Limited accounts can''t delete" on public.%I', t);
        execute format('create policy "Limited accounts can''t add" on public.%I as restrictive for insert to authenticated with check (not (select public.is_limited()))', t);
        execute format('create policy "Limited accounts can''t change" on public.%I as restrictive for update to authenticated using (not (select public.is_limited())) with check (not (select public.is_limited()))', t);
        execute format('create policy "Limited accounts can''t delete" on public.%I as restrictive for delete to authenticated using (not (select public.is_limited()))', t);
    end loop;
end;
$$;

------------------------------------------------------------------------
-- The staff list, and changing a user type
------------------------------------------------------------------------
-- Every account: admins first, then editors, maintenance, limited, no
-- access; by name within each
create or replace function public.staff_list()
returns table (
    user_id uuid,
    full_name text,
    email text,
    role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Only admins can see the staff list' using errcode = '42501';
    end if;
    return query
        select u.id, p.full_name, u.email::text, e.role
        from auth.users u
        left join public.profiles p on p.user_id = u.id
        left join public.editors e on e.user_id = u.id
        order by
            case e.role when 'admin' then 1 when 'editor' then 2 when 'maintenance' then 3 when 'limited' then 4 else 5 end,
            coalesce(p.full_name, u.email);
end;
$$;

-- Gives an account a user type (added to the editors table if it had none);
-- never admin
create or replace function public.set_staff_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Only admins can change user types' using errcode = '42501';
    end if;
    if target = (select auth.uid()) then
        raise exception 'You can''t change your own user type' using errcode = '42501';
    end if;
    if new_role = 'admin' then
        raise exception 'Upgrading to admin is disabled, please request access changes to Mark' using errcode = '42501';
    end if;
    if new_role not in ('editor', 'maintenance', 'limited') then
        raise exception 'Unknown user type: %', new_role using errcode = '22023';
    end if;
    if not exists (select 1 from auth.users where id = target) then
        raise exception 'No such account' using errcode = '22023';
    end if;
    insert into public.editors (user_id, role) values (target, new_role)
    on conflict (user_id) do update set role = excluded.role;
end;
$$;

-- Signed-in accounts only (and each checks for an admin itself)
revoke all on function public.staff_list() from public, anon;
grant execute on function public.staff_list() to authenticated;
revoke all on function public.set_staff_role(uuid, text) from public, anon;
grant execute on function public.set_staff_role(uuid, text) to authenticated;

commit;

-- Check: should list three rows: is_limited, set_staff_role and staff_list
select proname from pg_proc
where proname in ('staff_list', 'set_staff_role', 'is_limited') and pronamespace = 'public'::regnamespace
order by proname;
