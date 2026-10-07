-- Sets (or changes) someone's full name. It's shown instead of their email:
-- in the maintenance log, the daily summary email and their Account pop-up.
-- Their maintenance entries so far are updated to show it too.
--
-- They need a vervetDB account first (Authentication → Users → Add user).
-- Supabase → SQL Editor → New query → paste this → change the NAME and the
-- EMAIL on the first line → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- (Needs names.sql to have been run.)

with who as (select id, 'Full Name' as full_name from auth.users where email = 'staff@example.com'),
saved as (
    insert into public.profiles (user_id, full_name)
    select id, full_name from who
    on conflict (user_id) do update set full_name = excluded.full_name, updated_at = now()
    returning user_id, full_name
)
update public.maintenance m
set logged_by_name = saved.full_name
from saved
where m.logged_by = saved.user_id;

-- Check (it runs with the lines above): everyone, their role and name
select u.email, e.role, p.full_name
from public.editors e
join auth.users u on u.id = e.user_id
left join public.profiles p on p.user_id = e.user_id
order by e.role, u.email;
