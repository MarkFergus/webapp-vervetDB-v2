-- Sets someone's password directly, for when the "Forgot password?" email
-- isn't working for them. Also marks their email as confirmed, in case they
-- never finished the invite (a common reason reset emails don't help).
--
-- Don't delete and re-create the account instead: if they've ever edited a
-- monkey the delete fails, and an admin would lose their admin rights.
--
-- Supabase → SQL Editor → New query → paste this → change the PASSWORD and
-- EMAIL below → Run. "Success. No rows returned" is normal.
--
-- Then: tell them the password separately from the vervetdb.com link (e.g.
-- in person or by phone), and ask them to change it after signing in:
-- the account circle (or ☰ → Account) → Change password.

update auth.users
set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'them@example.com';

-- Check (run separately if you like): their email, a date under
-- "confirmed", and is_editor = true
select u.email, u.email_confirmed_at as confirmed, e.user_id is not null as is_editor
from auth.users u
left join public.editors e on e.user_id = u.id
where u.email = 'them@example.com';
