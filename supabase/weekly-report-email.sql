-- Weekly Reports: the emails. Each admin with Weekly Report Email on gets
-- their week's report on their send day and hour (South African time), at
-- their sign-in email, from reports@vervetdb.com. And Email Me (Past
-- Reports): any week, straight away (one a minute at most).
--   private.weekly_report_view(week_from, sections)   the report's lines,
--       as Past Reports shows them (View, the PDF) and the email has them:
--       { title, ended, sections: [{ id, title, groups: [{ title, lines:
--       [{ text, sub?, alert? }], table? }], missing }] }
--   public.weekly_report(week_from, sections)   the same, for the website
--       (admins only; replaces weekly-report-contents.sql's)
--   public.email_me_weekly_report(week_from, sections)   Email Me
--   private.send_due_weekly_reports()   run every hour (the schedule at the
--       bottom): sends whoever's due, once a week each
-- Emails go through Resend with the key already saved for the daily summary
-- (change-history.sql).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs weekly-reports.sql, weekly-report-contents.sql and
-- change-history.sql to have been run first (they have been).

begin;

-- Who's been sent which week (the schedule sends each week once), and when
-- they last used Email Me (once a minute at most). Not changed by the
-- website: no grants.
alter table public.weekly_report_settings
    add column if not exists last_sent_week date,
    add column if not exists last_emailed_at timestamptz;

------------------------------------------------------------------------
-- The report's lines
------------------------------------------------------------------------

-- "2026-10-27" → "Tue 27 Oct"
create or replace function private.wr_day(d date)
returns text
language sql
immutable
set search_path = ''
as $$
    select to_char(d, 'Dy FMDD Mon')
$$;

-- " · Sam" (no name: nothing)
create or replace function private.wr_by(name text)
returns text
language sql
immutable
set search_path = ''
as $$
    select coalesce(' · ' || nullif(name, ''), '')
$$;

-- "Daisy (Skunkey)" (no troop: the name)
create or replace function private.wr_who(name text, troop text)
returns text
language sql
immutable
set search_path = ''
as $$
    select name || coalesce(' (' || troop || ')', '')
$$;

-- A line: { text, sub (only if any), alert (only if true) }
create or replace function private.wr_line(t text, sub text[] default null, alert boolean default false)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select jsonb_strip_nulls(jsonb_build_object(
        'text', t,
        'sub', case when cardinality(array_remove(sub, null)) > 0 then to_jsonb(array_remove(sub, null)) end,
        'alert', case when alert then true end
    ))
$$;

-- A check and its note: "Fence Not Working: North corner"
create or replace function private.wr_check(check_name text, value text, note text)
returns text
language sql
immutable
set search_path = ''
as $$
    select initcap(check_name) || ' ' || initcap(replace(value, '_', ' ')) || coalesce(': ' || note, '')
$$;

-- 1234 → "1,234"
create or replace function private.wr_number(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
    select to_char(n, 'FM999,999,990')
$$;

create or replace function private.weekly_report_view(week_from date, sections text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    r jsonb := private.weekly_report(week_from);
    m jsonb := r -> 'monitoring';
    b jsonb := r -> 'baby_care';
    i jsonb := r -> 'integration';
    x jsonb := r -> 'maintenance';
    parts jsonb := '[]';
begin
    if 'monitoring' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'monitoring', 'title', 'Monitoring', 'missing', m -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Troops Monitored', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(t ->> 'troop' || ' · ' ||
                        case when (t ->> 'sessions')::int = 1 then '1 session' else (t ->> 'sessions') || ' sessions' end))
                    from jsonb_array_elements(m -> 'troops') t where (t ->> 'sessions')::int > 0), '[]')),
                jsonb_build_object('title', 'Sessions', 'lines', coalesce((
                    select jsonb_agg(case
                        when s ->> 'status' <> 'finished' then
                            private.wr_line(private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'troop')
                                || private.wr_by(s ->> 'by') || ' · In Progress')
                        else
                            private.wr_line(
                                private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'troop') || private.wr_by(s ->> 'by')
                                    || ' · ' || (s ->> 'seen') || ' seen, ' || (s ->> 'not_seen') || ' not seen',
                                array[
                                    private.wr_check('fence', s ->> 'fence', s ->> 'fence_note') || ' · '
                                        || private.wr_check('waters', s ->> 'waters', s ->> 'waters_note') || ' · '
                                        || private.wr_check('food', s ->> 'food', s ->> 'food_note'),
                                    'Maintenance: ' || (s ->> 'maintenance'),
                                    'Notes: ' || (s ->> 'notes')
                                ])
                        end)
                    from jsonb_array_elements(m -> 'sessions') s), '[]')),
                jsonb_build_object('title', 'Not Seen', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_who(n ->> 'name', n ->> 'troop') || ': not seen '
                            || (select string_agg(private.wr_day(d::date), ', ') from jsonb_array_elements_text(n -> 'dates') d)
                            || ' · ' || case
                                when (n ->> 'missed')::int >= 2 then 'Must See'
                                when (n ->> 'missed')::int > 0 then 'still not seen at the week''s end'
                                else 'seen again ' || private.wr_day((n ->> 'last_seen')::date)
                            end,
                        null, (n ->> 'missed')::int > 0))
                    from jsonb_array_elements(m -> 'not_seen') n), '[]')),
                jsonb_build_object('title', 'Alerts', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((a ->> 'date')::date) || ' · ' || (a ->> 'troop') || ' · '
                            || private.wr_check(a ->> 'check', a ->> 'value', a ->> 'note'), null, true))
                    from jsonb_array_elements(m -> 'alerts') a), '[]')),
                jsonb_build_object('title', 'New Injuries', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((j ->> 'date')::date) || ' · ' || private.wr_who(j ->> 'name', j ->> 'troop')
                            || ': ' || (j ->> 'description') || private.wr_by(j ->> 'by')))
                    from jsonb_array_elements(m -> 'injuries') j), '[]')),
                jsonb_build_object('title', 'Needs Attention', 'lines',
                    coalesce((
                        select jsonb_agg(private.wr_line(
                            private.wr_who(j ->> 'name', j ->> 'troop') || ': ' || (j ->> 'description')
                                || ' · no injury update since ' || private.wr_day((j ->> 'since')::date), null, true))
                        from jsonb_array_elements(m -> 'stale_injuries') j), '[]')
                    || coalesce((
                        select jsonb_agg(private.wr_line(
                            (s ->> 'troop') || ': session from ' || private.wr_day((s ->> 'date')::date)
                                || ' still In Progress' || private.wr_by(s ->> 'by'), null, true))
                        from jsonb_array_elements(m -> 'in_progress') s), '[]'))
            )
        ));
    end if;

    if 'baby_care' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'baby_care', 'title', 'Baby Care', 'missing', b -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Milk Totals', 'lines', '[]'::jsonb, 'table', case
                    when jsonb_array_length(b -> 'babies') > 0 then jsonb_build_object(
                        'head', jsonb_build_array('') || (
                            select jsonb_agg(to_char(d::date, 'Dy FMDD')) from jsonb_array_elements_text(b -> 'days') d
                        ) || jsonb_build_array('Total'),
                        'rows', (
                            select jsonb_agg(jsonb_build_array(baby ->> 'name') || (
                                select jsonb_agg(coalesce(baby -> 'milk' ->> d, '–'))
                                from jsonb_array_elements_text(b -> 'days') d
                            ) || jsonb_build_array(coalesce(private.wr_number((baby ->> 'milk_total')::numeric) || ' ml', '–')))
                            from jsonb_array_elements(b -> 'babies') baby
                        ))
                    end),
                jsonb_build_object('title', 'Weights', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        (baby ->> 'name') || ': ' || private.wr_number((w ->> 'grams')::numeric) || ' g on '
                            || private.wr_day((w ->> 'date')::date) || ' (' || case
                                when w ->> 'change' is null then 'first weight'
                                when (w ->> 'change')::int > 0 then '+' || private.wr_number((w ->> 'change')::numeric) || ' g'
                                when (w ->> 'change')::int < 0 then '−' || private.wr_number(abs((w ->> 'change')::numeric)) || ' g'
                                else '±0 g'
                            end || ')'))
                    from jsonb_array_elements(b -> 'babies') baby, jsonb_array_elements(baby -> 'weights') w), '[]')),
                jsonb_build_object('title', 'Moves', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((v ->> 'date')::date) || ' · ' || (v ->> 'name') || ': ' || (v ->> 'details')))
                    from jsonb_array_elements(b -> 'moves') v), '[]'))
            )
        ));
    end if;

    if 'integration' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'integration', 'title', 'Integration', 'missing', i -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Reports', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        (p ->> 'name') || ' · ' || case
                            when p ->> 'from' = p ->> 'to' then private.wr_day((p ->> 'from')::date)
                            else private.wr_day((p ->> 'from')::date) || ' – ' || private.wr_day((p ->> 'to')::date)
                        end || private.wr_by(p ->> 'by'),
                        array[p ->> 'report']))
                    from jsonb_array_elements(i -> 'reports') p), '[]')),
                jsonb_build_object('title', 'New Integrations', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'name') || ' · '
                            || case s ->> 'kind' when 'foster_mum' then 'Foster-Mum' else initcap(s ->> 'kind') end
                            || private.wr_by(s ->> 'by')))
                    from jsonb_array_elements(i -> 'started') s), '[]')),
                jsonb_build_object('title', 'Status Changes', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((s ->> 'date')::date) || ' · ' || (s ->> 'name') || ' · '
                            || initcap(replace(s ->> 'status', '_', ' '))))
                    from jsonb_array_elements(i -> 'statuses') s), '[]'))
            )
        ));
    end if;

    if 'maintenance' = any (sections) then
        parts := parts || jsonb_build_array(jsonb_build_object(
            'id', 'maintenance', 'title', 'Maintenance', 'missing', x -> 'missing',
            'groups', jsonb_build_array(
                jsonb_build_object('title', 'Maintenance Completed', 'lines', coalesce((
                    select jsonb_agg(private.wr_line(
                        private.wr_day((d ->> 'date')::date) || ' · ' || (d ->> 'place')
                            || coalesce(' · ' || initcap(d ->> 'kind'), '') || private.wr_by(d ->> 'by'),
                        array[d ->> 'details']))
                    from jsonb_array_elements(x -> 'done') d), '[]'))
            )
        ));
    end if;

    return jsonb_build_object(
        'title', 'Weekly Report: ' || private.wr_day(week_from) || ' – ' || private.wr_day(week_from + 6),
        'ended', r -> 'ended',
        'sections', parts
    );
end;
$$;

------------------------------------------------------------------------
-- The website's report (Past Reports' View and PDF): admins only. Replaces
-- weekly-report-contents.sql's (which had no sections).
------------------------------------------------------------------------
drop function if exists public.weekly_report(date);

create or replace function public.weekly_report(week_from date, sections text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Weekly Reports are for admins only' using errcode = '42501';
    end if;
    return private.weekly_report_view(week_from, sections);
end;
$$;

revoke all on function public.weekly_report(date, text[]) from public, anon;
grant execute on function public.weekly_report(date, text[]) to authenticated;

------------------------------------------------------------------------
-- The email: { subject, html, text }
------------------------------------------------------------------------
create or replace function private.weekly_report_email(view jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    site text := coalesce((select site_url from private.summary_settings), 'https://vervetdb.com/');
    section jsonb;
    grp jsonb;
    line jsonb;
    cell jsonb;
    row_cells jsonb;
    html text := '';
    txt text := '';
    missing int := 0;
begin
    if not (view ->> 'ended')::boolean then
        html := html || '<p style="margin:0 0 12px;font-style:italic;color:#666">This week isn''t over yet: only the days so far are checked.</p>';
        txt := txt || 'This week isn''t over yet: only the days so far are checked.' || E'\n\n';
    end if;

    for section in select * from jsonb_array_elements(view -> 'sections') loop
        html := html || '<h2 style="margin:24px 0 4px;padding-bottom:4px;font-size:18px;border-bottom:2px solid #222">'
            || private.esc(section ->> 'title') || '</h2>';
        txt := txt || upper(section ->> 'title') || E'\n';

        for grp in select * from jsonb_array_elements(section -> 'groups') loop
            html := html || '<h3 style="margin:14px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#666">'
                || private.esc(grp ->> 'title') || '</h3>';
            txt := txt || E'\n' || (grp ->> 'title') || E'\n';

            if jsonb_typeof(grp -> 'table') = 'object' then
                html := html || '<table style="border-collapse:collapse;font-size:13px">';
                for row_cells in
                    select jsonb_build_array() || (grp -> 'table' -> 'head')
                    union all
                    select value from jsonb_array_elements(grp -> 'table' -> 'rows')
                loop
                    html := html || '<tr>';
                    for cell in select * from jsonb_array_elements(row_cells) loop
                        html := html || '<td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:center">'
                            || private.esc(cell #>> '{}') || '</td>';
                    end loop;
                    html := html || '</tr>';
                    txt := txt || '  ' || (select string_agg(c #>> '{}', ' | ') from jsonb_array_elements(row_cells) c) || E'\n';
                end loop;
                html := html || '</table>';
            elsif jsonb_array_length(grp -> 'lines') = 0 then
                html := html || '<p style="margin:0;font-style:italic;color:#888">None this week</p>';
                txt := txt || '  None this week' || E'\n';
            else
                html := html || '<ul style="margin:0;padding-left:18px">';
                for line in select * from jsonb_array_elements(grp -> 'lines') loop
                    html := html || '<li style="margin:2px 0;' || case when (line ->> 'alert')::boolean then 'color:#b3261e' else '' end || '">'
                        || private.esc(line ->> 'text')
                        || coalesce((select string_agg('<br><span style="color:#555">' || private.esc(s) || '</span>', '')
                                     from jsonb_array_elements_text(line -> 'sub') s), '')
                        || '</li>';
                    txt := txt || '  - ' || (line ->> 'text') || E'\n'
                        || coalesce((select string_agg('      ' || s || E'\n', '') from jsonb_array_elements_text(line -> 'sub') s), '');
                end loop;
                html := html || '</ul>';
            end if;
        end loop;

        if jsonb_array_length(section -> 'missing') > 0 then
            missing := missing + jsonb_array_length(section -> 'missing');
            html := html || '<div style="margin:12px 0 0;padding:6px 12px;border:1px solid #b3261e;border-radius:6px;color:#b3261e">'
                || '<p style="margin:4px 0;font-weight:700">Missing</p><ul style="margin:0 0 4px;padding-left:18px">'
                || (select string_agg('<li>' || private.esc(t) || '</li>', '') from jsonb_array_elements_text(section -> 'missing') t)
                || '</ul></div>';
            txt := txt || E'\nMISSING\n'
                || (select string_agg('  ! ' || t || E'\n', '') from jsonb_array_elements_text(section -> 'missing') t);
        end if;
        txt := txt || E'\n';
    end loop;

    return jsonb_build_object(
        'subject', 'vervetDB ' || (view ->> 'title')
            || case when missing > 0 then ' · ' || missing || ' missing' else '' end,
        'html', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:640px">'
            || '<h1 style="margin:0 0 8px;font-size:22px">' || private.esc(view ->> 'title') || '</h1>'
            || html
            || '<p style="margin-top:24px;font-size:13px;color:#666"><a href="' || site || '#admin/reports">Open Weekly Reports in vervetDB</a></p></div>',
        'text', (view ->> 'title') || E'\n\n' || txt || site || '#admin/reports'
    );
end;
$$;

-- Sends one person a week's report (via Resend: see the daily summary's
-- key in change-history.sql) → their email address
create or replace function private.send_weekly_report(person uuid, week_from date, sections text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    address text := (select email from auth.users where id = person);
    email jsonb := private.weekly_report_email(private.weekly_report_view(week_from, sections));
    api_key text;
begin
    if address is null then
        raise exception 'No email address for that account';
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
            'to', jsonb_build_array(address),
            'subject', email ->> 'subject',
            'html', email ->> 'html',
            'text', email ->> 'text'
        )
    );
    return address;
end;
$$;

------------------------------------------------------------------------
-- Email Me (Past Reports): the week chosen, to yourself, straight away.
-- Admins only; one a minute at most. → the address it went to
------------------------------------------------------------------------
create or replace function public.email_me_weekly_report(week_from date, sections text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
begin
    if not public.is_admin() then
        raise exception 'Weekly Reports are for admins only' using errcode = '42501';
    end if;
    if cardinality(sections) = 0 then
        raise exception 'Please tick at least one section.' using errcode = 'P0001';
    end if;
    insert into public.weekly_report_settings (user_id) values (me) on conflict (user_id) do nothing;
    if exists (select 1 from public.weekly_report_settings
               where user_id = me and last_emailed_at > now() - interval '1 minute') then
        raise exception 'Please wait a minute before emailing another report.' using errcode = 'P0001';
    end if;
    update public.weekly_report_settings set last_emailed_at = now() where user_id = me;
    return private.send_weekly_report(me, week_from, sections);
end;
$$;

revoke all on function public.email_me_weekly_report(date, text[]) from public, anon;
grant execute on function public.email_me_weekly_report(date, text[]) to authenticated;

------------------------------------------------------------------------
-- The schedule's job: everyone whose send day and hour it is now (South
-- African time), still an admin, with the email on, gets the latest full
-- week before now (once: last_sent_week) → how many were sent
------------------------------------------------------------------------
create or replace function private.send_due_weekly_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    now_here timestamp := now() at time zone 'Africa/Johannesburg';
    today date := now_here::date;
    s record;
    week_from date;
    sent integer := 0;
begin
    for s in
        select w.* from public.weekly_report_settings w
        join public.editors e on e.user_id = w.user_id and e.role = 'admin'
        where w.enabled
          and cardinality(w.sections) > 0
          and w.send_day = extract(dow from now_here)
          and w.send_hour = extract(hour from now_here)
    loop
        -- the latest full week: it ended at the start of the latest day the
        -- week starts on (today, if it's that day)
        week_from := today - ((extract(dow from today)::int - s.week_starts + 7) % 7) - 7;
        if s.last_sent_week is distinct from week_from then
            begin
                perform private.send_weekly_report(s.user_id, week_from, s.sections);
                update public.weekly_report_settings set last_sent_week = week_from where user_id = s.user_id;
                sent := sent + 1;
            exception when others then
                -- (one person's problem doesn't stop the others')
                raise warning 'Weekly report for % not sent: %', s.user_id, sqlerrm;
            end;
        end if;
    end loop;
    return sent;
end;
$$;

revoke all on function private.wr_day(date), private.wr_by(text), private.wr_who(text, text),
    private.wr_line(text, text[], boolean), private.wr_check(text, text, text), private.wr_number(numeric),
    private.weekly_report_view(date, text[]), private.weekly_report_email(jsonb),
    private.send_weekly_report(uuid, date, text[]), private.send_due_weekly_reports()
    from public, anon, authenticated;

commit;

------------------------------------------------------------------------
-- The schedule: every hour, on the hour (sends only to whoever's due)
------------------------------------------------------------------------
select cron.schedule(
    'vervetdb-weekly-reports',
    '0 * * * *',
    $$select private.send_due_weekly_reports()$$
);

-- Check: last week's report as an email (should show its subject)
select private.weekly_report_email(private.weekly_report_view(current_date - 7, array['monitoring', 'baby_care', 'integration', 'maintenance'])) ->> 'subject' as subject;

-- Handy later:
--   Did the last emails go? (200 = sent; anything else shows Resend's reason)
--     select created, status_code, content from net._http_response order by created desc limit 5;
--   Who's had which week:
--     select u.email, w.enabled, w.send_day, w.send_hour, w.last_sent_week
--     from public.weekly_report_settings w join auth.users u on u.id = w.user_id;
