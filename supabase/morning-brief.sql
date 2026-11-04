-- The Morning Brief's email (2026-11-04): every day at 06:50 (South African
-- time), from reports@vervetdb.com. While it's being tried out it only goes
-- to private.morning_brief_to below.
-- The brief's worked out by a Supabase function (supabase/functions/
-- morning-brief), which uses the website's own rules. The function holds no
-- email key and decides nothing about sending; this file does:
--   morning_brief_due()    the function asks: is one due? 'daily', 'test' or
--                          null
--   send_morning_brief()   the function hands over the email, and it's sent
--                          (once a day: a second try does nothing)
--   email_morning_brief()  Email Me (admins; once a minute at most)
-- The schedule asks at 06:50 and again at 06:55, in case of a hiccup.
-- Uses the Resend key already saved in the Vault (as the weekly reports).
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-report-email.sql first. Then deploy the function: npm run
-- brief:deploy

begin;

create table if not exists private.morning_brief_state (
    id                 boolean primary key default true check (id),
    last_sent_on       date,
    test_requested_at  timestamptz
);
insert into private.morning_brief_state (id) values (true) on conflict (id) do nothing;

-- Who gets it (for now)
create or replace function private.morning_brief_to()
returns jsonb
language sql
immutable
as $$ select '["mark@vervet.za.org"]'::jsonb $$;

-- Asks the function to run
create or replace function private.ask_morning_brief()
returns void
language sql
security definer
set search_path = ''
as $$
    select net.http_post(
        url := 'https://demlwtsrnlkiskcntbcc.supabase.co/functions/v1/morning-brief',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
    );
$$;

------------------------------------------------------------------------
-- Is one due? (Email Me first: it's asked for just now)
------------------------------------------------------------------------
create or replace function public.morning_brief_due()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when s.test_requested_at > now() - interval '2 minutes' then 'test'
        when (now() at time zone 'Africa/Johannesburg')::time >= time '06:50'
             and s.last_sent_on is distinct from (now() at time zone 'Africa/Johannesburg')::date then 'daily'
    end
    from private.morning_brief_state s
$$;

------------------------------------------------------------------------
-- Send it → whether it was sent
------------------------------------------------------------------------
create or replace function public.send_morning_brief(brief_kind text, subject text, html text, body_text text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    today date := (now() at time zone 'Africa/Johannesburg')::date;
    s private.morning_brief_state;
    api_key text;
begin
    select * into s from private.morning_brief_state for update;
    if brief_kind = 'test' then
        if s.test_requested_at is null or s.test_requested_at <= now() - interval '2 minutes' then
            return false;
        end if;
        update private.morning_brief_state set test_requested_at = null where id;
    elsif brief_kind = 'daily' then
        if s.last_sent_on is not distinct from today then
            return false;
        end if;
        update private.morning_brief_state set last_sent_on = today where id;
    else
        return false;
    end if;

    select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
    if api_key is null then
        raise exception 'No Resend API key saved yet: see the set-up steps at the bottom of change-history.sql';
    end if;
    perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
            'from', 'vervetDB Reports <reports@vervetdb.com>',
            'to', private.morning_brief_to(),
            'subject', subject,
            'html', html,
            'text', body_text
        )
    );
    return true;
end;
$$;

------------------------------------------------------------------------
-- Email Me (the page): admins, once a minute at most
------------------------------------------------------------------------
create or replace function public.email_morning_brief()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'The Morning Brief is for admins only' using errcode = '42501';
    end if;
    if exists (select 1 from private.morning_brief_state where test_requested_at > now() - interval '1 minute') then
        raise exception 'Please wait a minute before emailing another brief.' using errcode = 'P0001';
    end if;
    update private.morning_brief_state set test_requested_at = now() where id;
    perform private.ask_morning_brief();
end;
$$;

revoke all on table private.morning_brief_state from public, anon, authenticated;
revoke all on function private.morning_brief_to(), private.ask_morning_brief() from public, anon, authenticated;
revoke all on function public.morning_brief_due(), public.send_morning_brief(text, text, text, text),
    public.email_morning_brief() from public, anon, authenticated;
grant execute on function public.morning_brief_due(), public.send_morning_brief(text, text, text, text) to service_role;
grant execute on function public.email_morning_brief() to authenticated;

commit;

------------------------------------------------------------------------
-- The schedule: 06:50 and 06:55 South African time (04:50 and 04:55 UTC)
------------------------------------------------------------------------
select cron.schedule(
    'vervetdb-morning-brief',
    '50,55 4 * * *',
    $$select private.ask_morning_brief()$$
);

-- Check: should say ready
select case when exists (select 1 from cron.job where jobname = 'vervetdb-morning-brief')
    then 'ready' else 'not scheduled' end as morning_brief;

-- Handy later:
--   Did the last emails go? (200 = sent; anything else shows the reason)
--     select created, status_code, content from net._http_response order by created desc limit 5;
