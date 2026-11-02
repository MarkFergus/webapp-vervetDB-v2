-- Deworming: the schedule from Outlook (2026-11-02)
-- Outlook's calendar is where the dewormings are planned. Its published
-- (ICS) link is kept in Supabase's Vault; every hour the database fetches
-- the calendar and keeps its deworming events (any title with "deworm" in
-- it): each one's title and date. The website reads those titles ("H&B &
-- Jala 6m deworming") into groups and sessions (dewormingSchedule.js) for
-- Records → Sections → Deworming → Schedule.
--   deworming_calendar        the events (the next 6 months, and the last 4)
-- An event over several days counts from its first day (DTSTART); its title
-- can go on after "deworming" ("… deworming due this week").
--   deworming_calendar_sync   the last fetch: when, and whether it worked
-- Admins can also Refresh Now (once a minute at most).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Then the SET-UP at the bottom, in a new query.
-- Safe to run more than once.

begin;

-- (fetching a web page from the database, and waiting for it)
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

------------------------------------------------------------------------
-- The calendar's deworming events, and the last fetch
------------------------------------------------------------------------
create table if not exists public.deworming_calendar (
    uid        text not null,
    title      text not null,
    starts_on  date not null,
    primary key (uid, starts_on)
);
alter table public.deworming_calendar enable row level security;
drop policy if exists "Staff can read the deworming calendar" on public.deworming_calendar;
create policy "Staff can read the deworming calendar"
    on public.deworming_calendar for select to authenticated
    using ((select public.can_log_maintenance()));
grant select on public.deworming_calendar to authenticated;

create table if not exists public.deworming_calendar_sync (
    id         boolean primary key default true check (id),
    synced_at  timestamptz,
    ok         boolean,
    message    text,
    events     integer
);
alter table public.deworming_calendar_sync enable row level security;
drop policy if exists "Staff can read the deworming calendar sync" on public.deworming_calendar_sync;
create policy "Staff can read the deworming calendar sync"
    on public.deworming_calendar_sync for select to authenticated
    using ((select public.can_log_maintenance()));
grant select on public.deworming_calendar_sync to authenticated;

------------------------------------------------------------------------
-- An ICS calendar's deworming events → (uid, title, starts_on)
--   (lines folded onto the next one, starting with a space, joined back;
--   cancelled events left out; the date: the first 8 digits of DTSTART)
------------------------------------------------------------------------
create or replace function private.deworming_events(ics text)
returns table (uid text, title text, starts_on date)
language sql
immutable
set search_path = ''
as $$
    with unfolded as (
        select regexp_replace(ics, '\r?\n[ \t]', '', 'g') as body
    ), events as (
        select m[1] as event
        from unfolded, regexp_matches(unfolded.body, 'BEGIN:VEVENT(.*?)END:VEVENT', 'g') as m
    ), fields as (
        select substring(event from '\nUID[^:\r\n]*:([^\r\n]*)') as uid,
               substring(event from '\nSUMMARY[^:\r\n]*:([^\r\n]*)') as summary,
               substring(event from '\nDTSTART[^:\r\n]*:(\d{8})') as starts,
               event ~* '\nSTATUS:CANCELLED' as cancelled
        from events
    )
    select coalesce(nullif(btrim(f.uid), ''), md5(f.summary || f.starts)),
           btrim(replace(replace(replace(replace(f.summary, '\,', ','), '\;', ';'), '\n', ' '), '\\', '\')),
           to_date(f.starts, 'YYYYMMDD')
    from fields f
    where f.summary ~* 'deworm' and f.starts is not null and not f.cancelled
$$;

------------------------------------------------------------------------
-- Fetch the calendar and keep its deworming events → a message
------------------------------------------------------------------------
create or replace function private.sync_deworming_calendar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    link text;
    next_link text;
    reply extensions.http_response;
    found_events integer;
begin
    select decrypted_secret into link from vault.decrypted_secrets where name = 'deworming_calendar_url';
    if link is null then
        insert into public.deworming_calendar_sync (id, synced_at, ok, message, events)
        values (true, now(), false, 'No calendar link saved yet: see the set-up steps in deworming-calendar.sql', null)
        on conflict (id) do update set synced_at = excluded.synced_at, ok = false, message = excluded.message;
        return 'No calendar link saved yet';
    end if;

    -- (a webcal:// link is the same calendar over https)
    link := regexp_replace(btrim(link), '^webcal://', 'https://', 'i');
    begin
        perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');
        -- (Outlook can send it on to another address: followed, up to 4 times)
        for hop in 1..5 loop
            reply := extensions.http_get(link);
            exit when reply.status not in (301, 302, 303, 307, 308);
            select h.value into next_link from unnest(reply.headers) h where lower(h.field) = 'location' limit 1;
            exit when next_link is null;
            link := next_link;
        end loop;
    exception when others then
        insert into public.deworming_calendar_sync (id, synced_at, ok, message, events)
        values (true, now(), false, 'Couldn''t reach the calendar: ' || sqlerrm, null)
        on conflict (id) do update set synced_at = excluded.synced_at, ok = false, message = excluded.message;
        return 'Couldn''t reach the calendar';
    end;
    if reply.status <> 200 or reply.content not like '%BEGIN:VCALENDAR%' then
        insert into public.deworming_calendar_sync (id, synced_at, ok, message, events)
        values (true, now(), false, 'The calendar link didn''t give a calendar (status ' || reply.status
                || coalesce(', ' || reply.content_type, '')
                || case when reply.content ilike '%<html%' then ': a web page, is it the HTML link instead of the ICS one?' else '' end
                || ')', null)
        on conflict (id) do update set synced_at = excluded.synced_at, ok = false, message = excluded.message;
        return 'Not a calendar';
    end if;

    -- (the events kept: the next 6 months, and the last 4 for what's
    -- overdue and when each group's next one is due)
    delete from public.deworming_calendar;
    insert into public.deworming_calendar (uid, title, starts_on)
    select distinct on (e.uid, e.starts_on) e.uid, left(e.title, 200), e.starts_on
    from private.deworming_events(reply.content) e
    where e.starts_on between current_date - 125 and current_date + 183;
    get diagnostics found_events = row_count;

    insert into public.deworming_calendar_sync (id, synced_at, ok, message, events)
    values (true, now(), true, null, found_events)
    on conflict (id) do update set synced_at = excluded.synced_at, ok = true, message = null, events = excluded.events;
    return found_events || ' deworming events';
end;
$$;

------------------------------------------------------------------------
-- Refresh Now (admins, from the Schedule): once a minute at most
------------------------------------------------------------------------
create or replace function public.refresh_deworming_calendar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Only admins can refresh the deworming calendar' using errcode = '42501';
    end if;
    if exists (select 1 from public.deworming_calendar_sync where synced_at > now() - interval '1 minute') then
        raise exception 'It was just refreshed: please wait a minute.' using errcode = 'P0001';
    end if;
    return private.sync_deworming_calendar();
end;
$$;

revoke all on function private.deworming_events(text), private.sync_deworming_calendar() from public, anon, authenticated;
revoke all on function public.refresh_deworming_calendar() from public, anon;
grant execute on function public.refresh_deworming_calendar() to authenticated;

-- Every hour, at 20 past
select cron.unschedule('vervetdb-deworming-calendar')
where exists (select 1 from cron.job where jobname = 'vervetdb-deworming-calendar');
select cron.schedule('vervetdb-deworming-calendar', '20 * * * *', $$select private.sync_deworming_calendar()$$);

commit;

------------------------------------------------------------------------
-- SET-UP (run separately, after the above, in a new query).
-- Paste your Outlook ICS link between the quotes, then Run:
--
--   select vault.create_secret('https://outlook.office365.com/owa/calendar/…/calendar.ics', 'deworming_calendar_url');
--   select private.sync_deworming_calendar();
--
-- The second line fetches it straight away: it should say
-- "N deworming events". The link is stored encrypted in Supabase's Vault,
-- never in the website.
--
-- Handy later:
--   A new link (if you republish the calendar):
--     select vault.update_secret((select id from vault.secrets where name = 'deworming_calendar_url'), 'the new link');
--   The events found:
--     select starts_on, title from public.deworming_calendar order by starts_on;
------------------------------------------------------------------------
