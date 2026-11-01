-- Weekly Reports (Admin Dashboard → Weekly Reports, admins only): each
-- admin's own weekly report email settings. Off until they turn it on.
--   enabled      Weekly Report Email: on / off
--   week_starts  the day their week starts (0 Sunday, 1 Monday … 6 Saturday):
--                7 days, midnight to midnight (e.g. 2 Tuesday: Tue–Mon)
--   send_day     the day it's emailed (0 Sunday … 6 Saturday) and
--   send_hour    the hour (0–23, South African time): the email covers the
--                latest full week before then
--   sections     what's in it: 'monitoring', 'baby_care', 'integration',
--                'maintenance'
-- Sent to each admin's sign-in email. (The reports themselves and the
-- schedule come next.)
--
-- Who can do what (the database enforces it, not just the website):
--   read / add / change   admins, their own settings only
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs admins.sql to have been run (it has been).

begin;

create table public.weekly_report_settings (
    user_id      uuid primary key references auth.users (id) on delete cascade default auth.uid(),
    enabled      boolean not null default false,
    week_starts  smallint not null default 1 check (week_starts between 0 and 6),
    send_day     smallint not null default 1 check (send_day between 0 and 6),
    send_hour    smallint not null default 7 check (send_hour between 0 and 23),
    sections     text[] not null default array['monitoring', 'baby_care', 'integration', 'maintenance']
                 check (sections <@ array['monitoring', 'baby_care', 'integration', 'maintenance']),
    updated_at   timestamptz not null default now()
);

alter table public.weekly_report_settings enable row level security;

create policy "Admins read their own weekly report settings"
    on public.weekly_report_settings for select to authenticated
    using ((select public.is_admin()) and user_id = (select auth.uid()));

create policy "Admins add their own weekly report settings"
    on public.weekly_report_settings for insert to authenticated
    with check ((select public.is_admin()) and user_id = (select auth.uid()));

create policy "Admins change their own weekly report settings"
    on public.weekly_report_settings for update to authenticated
    using ((select public.is_admin()) and user_id = (select auth.uid()))
    with check ((select public.is_admin()) and user_id = (select auth.uid()));

grant select on public.weekly_report_settings to authenticated;
grant insert (user_id, enabled, week_starts, send_day, send_hour, sections),
      update (enabled, week_starts, send_day, send_hour, sections)
    on public.weekly_report_settings to authenticated;

-- (updated_at: stamped on every change)
create function private.stamp_weekly_report_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger weekly_report_settings_stamp
    before update on public.weekly_report_settings
    for each row execute function private.stamp_weekly_report_settings();

commit;

-- Check: the new table is there, with nobody's settings yet (should say 0)
select count(*) as settings from public.weekly_report_settings;
