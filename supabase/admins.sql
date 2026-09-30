-- Admins: editors who can also DELETE monkeys and troops. Other editors can
-- still add and edit monkeys (and add / remove photos), but not delete a
-- monkey, so nothing gets deleted by accident. The database enforces this,
-- not just the website.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- The last part makes mark@vervet.za.org the admin; if you sign in with a
-- different email, change it there first. The result at the end should
-- list that email with is_admin = true.
--
-- Later:
--   Make someone else an admin:
--     update public.editors set is_admin = true
--     where user_id = (select id from auth.users where email = 'them@example.com');
--   Take it away again: the same with "is_admin = false".

alter table public.editors
    add column is_admin boolean not null default false;

-- Is the person making this request an admin?
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.editors
        where user_id = (select auth.uid()) and is_admin
    )
$$;

-- Deleting: admins only (was: any editor)
drop policy "Editors can delete monkeys" on public.monkeys;
create policy "Admins can delete monkeys"
    on public.monkeys for delete to authenticated
    using ((select public.is_admin()));

drop policy "Editors can delete troops" on public.troops;
create policy "Admins can delete troops"
    on public.troops for delete to authenticated
    using ((select public.is_admin()));

-- You are the admin
update public.editors set is_admin = true
where user_id = (select id from auth.users where email = 'mark@vervet.za.org');

-- Check: everyone who can edit, and who's an admin
select u.email, e.is_admin
from public.editors e join auth.users u on u.id = e.user_id
order by e.is_admin desc, u.email;
