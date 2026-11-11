-- Crashes in the website, noted for Mark (src/appErrors.js): when a page
-- shows "Something went wrong", what went wrong, on which page, which
-- version and browser, and who was signed in (if anyone).
--   log_app_error(...)   anyone can add one (visitors too: their crashes
--                        matter as well); nothing else can be done with it
--   app_errors           admins can read them; nobody can change them
-- See them: Supabase → Table Editor → app_errors (newest at the bottom, or
-- sort by "at").
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

create table if not exists public.app_errors (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    message text not null,
    stack text,
    page text,
    version text,
    browser text,
    user_id uuid default auth.uid()
);

alter table public.app_errors enable row level security;

drop policy if exists "Admins read app errors" on public.app_errors;
create policy "Admins read app errors" on public.app_errors
    for select to authenticated
    using ((select public.is_admin()));

-- (only through log_app_error: kept short, and at most 50 an hour in all)
create or replace function public.log_app_error(
    p_message text, p_stack text, p_page text, p_version text, p_browser text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if (select count(*) from public.app_errors where at > now() - interval '1 hour') >= 50 then
        return;
    end if;
    insert into public.app_errors (message, stack, page, version, browser, user_id)
    values (left(coalesce(p_message, ''), 1000), left(p_stack, 8000), left(p_page, 200),
            left(p_version, 20), left(p_browser, 300), auth.uid());
end;
$$;

revoke all on function public.log_app_error(text, text, text, text, text) from public;
grant execute on function public.log_app_error(text, text, text, text, text) to anon, authenticated;

commit;
