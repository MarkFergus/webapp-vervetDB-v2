-- Every account added in Supabase becomes an editor automatically, so
-- adding someone is just: Authentication → Users → Add user.
--
-- Safe because public sign-ups are switched off: the only accounts that can
-- exist are ones added by you in Supabase.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
--
-- To make an account view-only instead, remove its editor entry:
--   delete from public.editors
--   where user_id = (select id from auth.users where email = 'them@example.com');
-- To remove someone completely: Authentication → Users → … → Delete user.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.make_new_account_an_editor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.editors (user_id) values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

revoke all on function private.make_new_account_an_editor() from public, anon, authenticated;

create trigger on_new_account_make_editor
    after insert on auth.users
    for each row execute function private.make_new_account_an_editor();
