-- Makes someone a maintenance account: they can log maintenance on
-- enclosures and introcages, and nothing else (no monkey changes, no photo
-- uploads). Their Account pop-up then shows a MAINTENANCE badge.
--
-- They need a vervetDB account first: Authentication → Users → Add user →
-- Send invitation (every account added there starts as an editor, so run
-- this straight away, before they've set their password).
--
-- Supabase → SQL Editor → New query → paste this → change the EMAIL → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

update public.editors
set role = 'maintenance'
where user_id = (select id from auth.users where email = 'staff@example.com');

-- Check (it runs with the line above): everyone and their role
select u.email, e.role
from public.editors e
join auth.users u on u.id = e.user_id
order by e.role, u.email;

-- To make them a normal editor again, run the update with role = 'editor'.
