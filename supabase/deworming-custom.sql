-- Custom deworming lists (2026-11-10): one-off dewormings that don't follow
-- the schedule ("Full Moon Deworming"), made by admins: their own title and
-- any monkeys, completed like the other lists. Saved as a sheet with group
-- 'custom:…' and session 'custom' (the title is its group name). They're
-- never due or overdue (the Deworming Schedule leaves them out). The
-- Weekly Report and the sheet email call them by their title.
-- Safe to run more than once.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs deworming-sheet-email.sql and weekly-report-deworming-issues.sql first
-- (they have been).

begin;

alter table public.deworming_sheets drop constraint if exists deworming_sheets_group_key_check;
alter table public.deworming_sheets
    add constraint deworming_sheets_group_key_check
        check (group_key ~ '^(troop|ics|enclosure|custom):[A-Za-z0-9 ]+$');

alter table public.deworming_sheets drop constraint if exists deworming_sheets_session_check;
alter table public.deworming_sheets
    add constraint deworming_sheets_session_check
        check (session in ('6_month', '6_month_fu', '3_month', '3_month_fu', 'custom'));

------------------------------------------------------------------------
-- The sheet email: a custom list's own title
------------------------------------------------------------------------
create or replace function public.email_deworming_sheet(sheet bigint, pdf text, file_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    s public.deworming_sheets;
    title text;
    site text := coalesce((select site_url from private.summary_settings), 'https://vervetdb.com/');
    api_key text;
    sessions jsonb := '{"6_month": "6-Month", "6_month_fu": "6-Month F/U", "3_month": "3-Month", "3_month_fu": "3-Month F/U"}';
begin
    select * into s from public.deworming_sheets where id = sheet for update;
    if not found then
        raise exception 'That deworming list no longer exists.' using errcode = 'P0001';
    end if;
    if not public.is_admin() then
        raise exception 'Only admins can email a deworming sheet.' using errcode = '42501';
    end if;
    if s.status <> 'approved' then
        raise exception 'Only an approved list can be emailed.' using errcode = 'P0001';
    end if;
    if s.photo_emailed_at > now() - interval '1 minute' then
        raise exception 'This list was emailed a moment ago. Please check your inbox first.' using errcode = 'P0001';
    end if;
    if pdf is null or char_length(pdf) > 30000000 or pdf !~ '^[A-Za-z0-9+/=]+$' then
        raise exception 'That PDF can''t be emailed.' using errcode = 'P0001';
    end if;
    select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
    if api_key is null then
        raise exception 'No Resend API key saved yet.' using errcode = 'P0001';
    end if;

    -- (a custom list: its own title)
    title := case when s.session = 'custom' then s.group_name
                  else s.group_name || ' ' || (sessions ->> s.session) || ' Deworming' end;
    perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
            'from', 'vervetDB Reports <reports@vervetdb.com>',
            'to', private.deworming_sheet_to(),
            'subject', 'Deworming Sheet: ' || title,
            'html', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">'
                || '<p>The paper sheet for <b>' || replace(replace(title, '&', '&amp;'), '<', '&lt;') || '</b> is attached.</p>'
                || '<p>Submitted by ' || coalesce(replace(replace(s.submitted_by_name, '&', '&amp;'), '<', '&lt;'), 'staff')
                || ', approved by ' || coalesce(replace(replace(s.approved_by_name, '&', '&amp;'), '<', '&lt;'), 'an admin')
                || '.</p>'
                || '<p style="font-size:13px;color:#666"><a href="' || site || '#records/sections/deworming">Open Deworming in vervetDB</a></p></div>',
            'text', 'The paper sheet for ' || title || ' is attached.' || E'\n'
                || 'Submitted by ' || coalesce(s.submitted_by_name, 'staff')
                || ', approved by ' || coalesce(s.approved_by_name, 'an admin') || '.' || E'\n\n'
                || site || '#records/sections/deworming',
            'attachments', jsonb_build_array(jsonb_build_object(
                'filename', coalesce(nullif(regexp_replace(file_name, '[^A-Za-z0-9_.-]', '', 'g'), ''), 'deworming_sheet.pdf'),
                'content', pdf
            ))
        ),
        timeout_milliseconds := 20000
    );
    update public.deworming_sheets set photo_emailed_at = now() where id = sheet;
    return private.deworming_sheet_to();
end;
$$;

------------------------------------------------------------------------
-- Weekly Reports: a custom list's own title
------------------------------------------------------------------------
create or replace function private.wr_deworming(week_from date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with sheets as (
        select s.id, s.group_name, s.session, s.staff_names, s.started_on, s.days_done,
               coalesce(s.started_on, s.start_date) as first_day,
               case when exists (
                   select 1 from public.deworming_lines l
                   where l.sheet_id = s.id and (l.day_4 is true or exists (
                       select 1 from public.deworming_doses d where d.line_id = l.id and d.day = 4))
               ) then 4 else 3 end as days
        from public.deworming_sheets s
    ), worked as (
        select x.*, x.first_day + x.days - 1 as last_day,
               x.days_done @> array(select generate_series(1, x.days)::smallint) as all_done,
               -- (a custom list: its own title)
               case when x.session = 'custom' then x.group_name else
               private.full_place(x.group_name) || ' · ' || case x.session
                   when '6_month' then '6-Month'
                   when '6_month_fu' then '6-Month F/U'
                   when '3_month' then '3-Month'
                   else '3-Month F/U'
               end end as title,
               (select count(*) from public.deworming_lines l where l.sheet_id = x.id and l.kind <> 'accidental') as monkeys,
               (select string_agg(m.name, ', ' order by m.name)
                from public.deworming_lines l join public.monkeys m on m.id = l.monkey_id
                where l.sheet_id = x.id and l.kind <> 'accidental') as names,
               (select array_agg(i order by i) from (
                    select private.wr_deworming_issue(l.id) as i
                    from public.deworming_lines l where l.sheet_id = x.id
                ) issues where i is not null) as issues
        from sheets x
    ), completed as (
        select * from worked where all_done and last_day between week_from and week_from + 6
    ), in_progress as (
        select * from worked
        where first_day <= least(week_from + 6, (now() at time zone 'Africa/Johannesburg')::date)
          and not (all_done and last_day <= week_from + 6)
    ), due as (
        -- (the same deworming entered day by day: once, on its first day)
        select c.title, c.starts_on
        from public.deworming_calendar c
        where c.starts_on between week_from + 7 and week_from + 20
          and not exists (
              select 1 from public.deworming_calendar e
              where lower(btrim(e.title)) = lower(btrim(c.title))
                and e.starts_on between c.starts_on - 7 and c.starts_on - 1
          )
    )
    select jsonb_build_object(
        'id', 'deworming', 'title', 'Deworming', 'missing', '[]'::jsonb,
        'groups', jsonb_build_array(
            jsonb_build_object('title', 'Completed', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    c.title || ' · ' || private.wr_day(c.first_day) || ' – ' || private.wr_day(c.last_day)
                        || private.wr_by(c.staff_names) || ' · ' || c.monkeys || case when c.monkeys = 1 then ' monkey' else ' monkeys' end,
                    case when c.issues is null then array['No issues'] else array['Issues:'] || c.issues end
                ) order by c.last_day, c.title)
                from completed c), '[]')),
            jsonb_build_object('title', 'In Progress', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    p.title || ' · ' || case when p.started_on is null then 'planned ' else 'started ' end
                        || private.wr_day(p.first_day) || private.wr_by(p.staff_names),
                    array[p.monkeys || case when p.monkeys = 1 then ' monkey' else ' monkeys' end
                        || ' · ' || case
                            when done.n = 0 then 'no days done yet'
                            else 'Day ' || done.n || ' of ' || p.days || ' done'
                        end]
                ) order by p.first_day, p.title)
                from in_progress p
                -- (the days done by the week's end, for an older week)
                cross join lateral (
                    select count(*) as n from unnest(p.days_done) dd where p.first_day + dd - 1 <= week_from + 6
                ) done), '[]')),
            jsonb_build_object('title', 'Due in the Next 2 Weeks', 'lines', coalesce((
                select jsonb_agg(private.wr_line(
                    private.wr_day(d.starts_on) || ' · ' || private.full_place(d.title)
                ) order by d.starts_on, d.title)
                from due d), jsonb_build_array(private.wr_line('None due'))))
        )
    )
$$;

revoke all on function private.wr_deworming(date) from public, anon, authenticated;

commit;

-- Check: should say ready
select 'ready' as custom_deworming_lists
from pg_constraint
where conname = 'deworming_sheets_session_check' and pg_get_constraintdef(oid) like '%custom%';
