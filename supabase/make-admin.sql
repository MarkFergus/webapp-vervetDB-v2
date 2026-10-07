-- Makes someone an admin: as well as editing, they can add new monkeys and
-- delete monkeys, and change enclosure details. Their Account pop-up then
-- shows a pink ADMIN badge, and "Add New Monkey" appears for them (after
-- they reopen the app).
--
-- They need a vervetDB account first: Authentication → Users → Add user →
-- Send invitation (every account added there is an editor automatically).
--
-- Supabase → SQL Editor → New query → paste this → change the EMAIL → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- (Needs roles.sql to have been run.)

update public.editors
set role = 'admin'
where user_id = (select id from auth.users where email = 'manager@example.com');

-- Check (it runs with the line above): everyone and their role
select u.email, e.role
from public.editors e
join auth.users u on u.id = e.user_id
order by e.role, u.email;

-- To take admin away again, run the update with role = 'editor'.
