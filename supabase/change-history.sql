-- vervetDB change history and daily summary emails.
--
-- Every time a monkey is added, changed or deleted, the database notes who
-- did it, when, and what it looked like before and after. Once a day, a
-- summary of the changes since the last one is emailed (via Resend). Days
-- with no changes send nothing.
--
-- Everything here lives in a "private" schema, which the website's API
-- can't reach: visitors and editors can't read the history, change the
-- settings or trigger emails. Only you can, here in the SQL Editor.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Then do the set-up steps at the bottom of this file.

-- Scheduling (pg_cron) and calling web services such as Resend (pg_net)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

------------------------------------------------------------------------
-- The change history
------------------------------------------------------------------------
create table private.monkey_changes (
    id                bigint generated always as identity primary key,
    changed_at        timestamptz not null default now(),
    action            text not null check (action in ('added', 'changed', 'deleted')),
    monkey_id         bigint not null,
    changed_by        uuid references auth.users (id) on delete set null,
    -- kept as well, in case the account is removed later
    changed_by_email  text,
    -- the monkey before (null when added) and after (null when deleted)
    old_row           jsonb,
    new_row           jsonb
);

create index monkey_changes_changed_at_idx on private.monkey_changes (changed_at);

-- Runs after every add / change / delete of a monkey and notes it down.
-- security definer: runs with the owner's rights, so it can write to the
-- private history (and look up the editor's email) on the editor's behalf.
create function private.record_monkey_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    who uuid := auth.uid();
begin
    -- A save that didn't actually change anything isn't worth noting
    if tg_op = 'UPDATE'
        and to_jsonb(new) - 'updated_at' - 'updated_by'
          = to_jsonb(old) - 'updated_at' - 'updated_by' then
        return null;
    end if;

    insert into private.monkey_changes
        (action, monkey_id, changed_by, changed_by_email, old_row, new_row)
    values (
        case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
        case tg_op when 'DELETE' then old.id else new.id end,
        who,
        (select email from auth.users where id = who),
        case when tg_op <> 'INSERT' then to_jsonb(old) end,
        case when tg_op <> 'DELETE' then to_jsonb(new) end
    );
    return null;
end;
$$;

create trigger monkeys_record_change
    after insert or update or delete on public.monkeys
    for each row execute function private.record_monkey_change();

------------------------------------------------------------------------
-- Summary email settings (one row: filled in during set-up, below)
------------------------------------------------------------------------
create table private.summary_settings (
    only_row      boolean primary key default true check (only_row),
    -- who gets the summary
    send_to       text[] not null check (cardinality(send_to) >= 1),
    -- who it's from: an address on a domain verified in Resend (without
    -- one, only onboarding@resend.dev works, and only to your own address)
    send_from     text not null default 'vervetDB <updates@vervetdb.com>',
    -- times in the email are shown in this time zone
    time_zone     text not null default 'Africa/Johannesburg',
    -- the "Open vervetDB" link at the bottom of the email
    site_url      text not null default 'https://vervetdb.com/',
    -- the next summary covers changes after this moment
    last_sent_at  timestamptz not null default now()
);

------------------------------------------------------------------------
-- Building the email
------------------------------------------------------------------------

-- Makes text safe to put in the email's HTML
create function private.esc(t text)
returns text
language sql
immutable
set search_path = ''
as $$
    select replace(replace(replace(replace(coalesce(t, ''),
        '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- A value as shown in the email: "(blank)" when empty, long text shortened
create function private.shown(t text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case
        when t is null or t = '' then '(blank)'
        when length(t) > 200 then left(t, 200) || '…'
        else t
    end
$$;

-- The site's "no photo yet" picture: not counted as a photo
create function private.real_photos(r jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
    select coalesce(array_agg(p), '{}')
    from jsonb_array_elements_text(coalesce(r -> 'photos', '[]')) as p
    where p <> 'https://i.ibb.co/2YvYtBJ/blank-image-min.jpg'
$$;

-- One field of a monkey, as words (troop name rather than its number, etc.)
create function private.field_text(r jsonb, field text)
returns text
language sql
stable
set search_path = ''
as $$
    select case field
        when 'troop' then (
            select t.name from public.troops t where t.id = (r ->> 'troop_id')::bigint
        )
        when 'sex' then initcap(r ->> 'sex')
        else r ->> field
    end
$$;

-- The lines listed under one change, e.g. "Troop: Goliath → Hendrik".
-- Added / deleted monkeys list what they had.
create function private.change_lines(old_row jsonb, new_row jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
    fields text[] := array['name', 'troop', 'sex', 'birth_year', 'chip', 'bio', 'description'];
    labels text[] := array['Name', 'Troop', 'Sex', 'Birth year', 'Chip', 'Bio', 'Description'];
    lines text[] := '{}';
    before_text text;
    after_text text;
    before_photos text[] := private.real_photos(old_row);
    after_photos text[] := private.real_photos(new_row);
    added int;
    removed int;
begin
    for i in 1 .. array_length(fields, 1) loop
        before_text := private.field_text(old_row, fields[i]);
        after_text := private.field_text(new_row, fields[i]);
        if old_row is null or new_row is null then
            -- Added or deleted: list what's filled in (name and troop are in the heading)
            if fields[i] not in ('name', 'troop') and coalesce(after_text, before_text, '') <> '' then
                lines := lines || (labels[i] || ': ' || private.shown(coalesce(after_text, before_text)));
            end if;
        elsif before_text is distinct from after_text then
            lines := lines || (labels[i] || ': ' || private.shown(before_text) || ' → ' || private.shown(after_text));
        end if;
    end loop;

    if old_row is null or new_row is null then
        if cardinality(before_photos) + cardinality(after_photos) > 0 then
            lines := lines || ('Photos: ' || (cardinality(before_photos) + cardinality(after_photos)));
        end if;
    else
        added := (select count(*) from unnest(after_photos) p where p <> all (before_photos));
        removed := (select count(*) from unnest(before_photos) p where p <> all (after_photos));
        if added > 0 or removed > 0 then
            lines := lines || ('Photos: ' || concat_ws(', ',
                case when added > 0 then added || ' added' end,
                case when removed > 0 then removed || ' removed' end));
        elsif before_photos <> after_photos then
            lines := lines || 'Photos: reordered (new card photo)'::text;
        end if;
    end if;

    return lines;
end;
$$;

-- The summary of changes between two moments: { count, subject, html, text },
-- or null if there weren't any
create function private.summary_email(since timestamptz, until timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    settings private.summary_settings;
    c record;
    total int := 0;
    heading text;
    troop text;
    who text;
    at_time text;
    colour text;
    lines text[];
    html text := '';
    txt text := '';
    day_text text;
    site text;
begin
    select * into settings from private.summary_settings;
    site := settings.site_url;

    for c in
        select * from private.monkey_changes
        where changed_at > since and changed_at <= until
        order by changed_at
    loop
        total := total + 1;
        heading := initcap(c.action) || ': ' || coalesce(c.new_row ->> 'name', c.old_row ->> 'name');
        troop := coalesce(private.field_text(coalesce(c.new_row, c.old_row), 'troop'), 'no troop');
        who := coalesce(c.changed_by_email, 'unknown');
        at_time := to_char(c.changed_at at time zone settings.time_zone, 'FMDD Mon, HH24:MI');
        colour := case c.action when 'added' then '#2e8b1e' when 'changed' then '#0b7fae' else '#c62828' end;
        lines := private.change_lines(c.old_row, c.new_row);

        txt := txt || heading || ' (' || troop || ')' || E'\n'
            || 'By ' || who || ', ' || at_time || E'\n'
            || coalesce((select string_agg('  - ' || l || E'\n', '') from unnest(lines) l), '')
            || E'\n';

        html := html
            || '<div style="margin:0 0 16px;padding:10px 14px;border-left:4px solid ' || colour || ';background:#f6f6f4">'
            || '<p style="margin:0;font-weight:700;color:' || colour || '">' || private.esc(heading)
            || ' <span style="font-weight:400;color:#555">(' || private.esc(troop) || ')</span></p>'
            || '<p style="margin:2px 0 0;font-size:13px;color:#666">By ' || private.esc(who) || ', ' || at_time || '</p>'
            || coalesce('<ul style="margin:6px 0 0;padding-left:20px">'
                || (select string_agg('<li>' || private.esc(l) || '</li>', '') from unnest(lines) l)
                || '</ul>', '')
            || '</div>';
    end loop;

    if total = 0 then
        return null;
    end if;

    day_text := to_char(until at time zone settings.time_zone, 'FMDD Mon YYYY');
    return jsonb_build_object(
        'count', total,
        'subject', 'vervetDB: ' || total || case when total = 1 then ' change' else ' changes' end || ' (' || day_text || ')',
        'text', 'vervetDB changes up to ' || day_text || E'\n\n' || txt || site,
        'html', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px">'
            || '<h2 style="margin:0 0 16px">vervetDB changes</h2>'
            || html
            || '<p style="font-size:13px;color:#666"><a href="' || site || '">Open vervetDB</a></p></div>'
    );
end;
$$;

------------------------------------------------------------------------
-- Sending it (run by the daily schedule below)
--   select private.send_daily_summary();             normal: changes since the last summary
--   select private.send_daily_summary(test => true);  a test: the last 7 days, sent even if
--                                                     empty, and the next summary isn't affected
------------------------------------------------------------------------
create function private.send_daily_summary(test boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    settings private.summary_settings;
    until timestamptz := now();
    email jsonb;
    api_key text;
    request_id bigint;
begin
    select * into settings from private.summary_settings for update;
    if not found then
        raise exception 'No summary settings yet: see the set-up steps at the bottom of change-history.sql';
    end if;

    email := private.summary_email(
        case when test then until - interval '7 days' else settings.last_sent_at end,
        until
    );

    if email is null and not test then
        update private.summary_settings set last_sent_at = until;
        return 'No changes since the last summary, so no email.';
    end if;

    if test then
        email := coalesce(email, jsonb_build_object(
            'count', 0,
            'subject', 'vervetDB: no changes',
            'text', 'No changes in the last 7 days.',
            'html', '<p style="font-family:Arial,sans-serif">No changes in the last 7 days.</p>'
        ));
        email := email || jsonb_build_object('subject', '[Test] ' || (email ->> 'subject'));
    end if;

    select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key';
    if api_key is null then
        raise exception 'No Resend API key saved yet: see the set-up steps at the bottom of change-history.sql';
    end if;

    select net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || api_key,
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
            'from', settings.send_from,
            'to', to_jsonb(settings.send_to),
            'subject', email ->> 'subject',
            'html', email ->> 'html',
            'text', email ->> 'text'
        )
    ) into request_id;

    if not test then
        update private.summary_settings set last_sent_at = until;
    end if;

    return format('Sending %s change(s) to %s.', email ->> 'count', array_to_string(settings.send_to, ', '));
end;
$$;

-- Nobody but you (the database owner) can run any of this
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

------------------------------------------------------------------------
-- The schedule: every day at 16:00 UTC (18:00 in South Africa).
-- To change the time, run this again with a different time. The format is
-- 'minute hour * * *' in UTC, e.g. '0 6 * * *' = 06:00 UTC every day.
------------------------------------------------------------------------
select cron.schedule(
    'vervetdb-daily-summary',
    '0 16 * * *',
    $$select private.send_daily_summary()$$
);

------------------------------------------------------------------------
-- SET-UP (run separately, after the above, in a new query).
-- Replace the email address and the key, then Run:
--
--   insert into private.summary_settings (send_to)
--   values (array['you@example.com']);
--
--   select vault.create_secret('re_your_resend_key', 'resend_api_key');
--
--   select private.send_daily_summary(test => true);
--
-- The key is stored encrypted in Supabase's Vault, never in the website.
--
-- Handy later:
--   Add another recipient (needs your own domain set up in Resend):
--     update private.summary_settings set send_to = send_to || 'someone@example.com';
--   Did the last emails go? (200 = sent; anything else shows Resend's reason)
--     select created, status_code, content from net._http_response order by created desc limit 5;
--   See the change history:
--     select changed_at, action, changed_by_email, new_row ->> 'name', old_row ->> 'name'
--     from private.monkey_changes order by changed_at desc limit 50;
------------------------------------------------------------------------
