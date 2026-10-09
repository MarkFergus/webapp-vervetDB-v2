-- The daily summary email, now with enclosures and introcages: changes to
-- monkeys (change-history.sql) and to enclosures and introcages
-- (enclosure-history.sql), all in time order. Each entry says what it is:
-- a monkey's troop, or "Enclosure" / "Introcage", e.g.
--     Changed: Robert B1 (Introcage)
--     By Mark Fergus Ashcroft, 9 Oct, 14:05
--       - Size: 12 m² → 14 m²
-- Everything else is as before (names, the photo move as one line, the
-- subject, the schedule and the recipients).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs enclosure-history.sql (and names.sql) to have been run first.

create or replace function private.summary_email(since timestamptz, until timestamptz)
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
    label text;
    who text;
    at_time text;
    colour text;
    lines text[];
    html text := '';
    txt text := '';
    day_text text;
    site text;
    -- the photo move (see is_photo_move): counted, then shown as one line
    moved int := 0;
    movers text[] := '{}';
    moved_html text := '';
    moved_txt text := '';
begin
    select * into settings from private.summary_settings;
    site := settings.site_url;

    for c in
        select * from (
            select changed_at, action, 'monkey' as subject, changed_by, changed_by_email,
                   changed_by_name, old_row, new_row
            from private.monkey_changes
            union all
            select changed_at, action,
                   case when coalesce(new_row, old_row) ->> 'type' = 'introcage' then 'introcage' else 'enclosure' end,
                   changed_by, changed_by_email, changed_by_name, old_row, new_row
            from private.enclosure_changes
        ) everything
        where changed_at > since and changed_at <= until
        order by changed_at
    loop
        -- Whoever made it: their name then, their name now, or their email
        who := coalesce(c.changed_by_name,
            (select p.full_name from public.profiles p where p.user_id = c.changed_by),
            c.changed_by_email, 'unknown');

        if c.subject = 'monkey' and c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row) then
            moved := moved + 1;
            if not (who = any (movers)) then
                movers := movers || who;
            end if;
            continue;
        end if;

        total := total + 1;
        heading := initcap(c.action) || ': ' || coalesce(c.new_row ->> 'name', c.old_row ->> 'name');
        if c.subject = 'monkey' then
            label := coalesce(private.field_text(coalesce(c.new_row, c.old_row), 'troop'), 'no troop');
            lines := private.change_lines(c.old_row, c.new_row);
        else
            label := initcap(c.subject);
            lines := private.enclosure_change_lines(c.old_row, c.new_row);
        end if;
        at_time := to_char(c.changed_at at time zone settings.time_zone, 'FMDD Mon, HH24:MI');
        colour := case c.action when 'added' then '#2e8b1e' when 'changed' then '#0b7fae' else '#c62828' end;

        txt := txt || heading || ' (' || label || ')' || E'\n'
            || 'By ' || who || ', ' || at_time || E'\n'
            || coalesce((select string_agg('  - ' || l || E'\n', '') from unnest(lines) l), '')
            || E'\n';

        html := html
            || '<div style="margin:0 0 16px;padding:10px 14px;border-left:4px solid ' || colour || ';background:#f6f6f4">'
            || '<p style="margin:0;font-weight:700;color:' || colour || '">' || private.esc(heading)
            || ' <span style="font-weight:400;color:#555">(' || private.esc(label) || ')</span></p>'
            || '<p style="margin:2px 0 0;font-size:13px;color:#666">By ' || private.esc(who) || ', ' || at_time || '</p>'
            || coalesce('<ul style="margin:6px 0 0;padding-left:20px">'
                || (select string_agg('<li>' || private.esc(l) || '</li>', '') from unnest(lines) l)
                || '</ul>', '')
            || '</div>';
    end loop;

    if moved > 0 then
        total := total + 1;
        heading := 'Photos moved to vervetDB storage: ' || moved
            || case when moved = 1 then ' monkey' else ' monkeys' end;
        who := array_to_string(movers, ', ');
        moved_txt := heading || E'\n' || 'By ' || who || E'\n'
            || '  - Copied from ImgBB; the photos themselves are unchanged' || E'\n\n';
        moved_html := '<div style="margin:0 0 16px;padding:10px 14px;border-left:4px solid #0b7fae;background:#f6f6f4">'
            || '<p style="margin:0;font-weight:700;color:#0b7fae">' || private.esc(heading) || '</p>'
            || '<p style="margin:2px 0 0;font-size:13px;color:#666">By ' || private.esc(who) || '</p>'
            || '<ul style="margin:6px 0 0;padding-left:20px"><li>Copied from ImgBB; the photos themselves are unchanged</li></ul>'
            || '</div>';
        txt := moved_txt || txt;
        html := moved_html || html;
    end if;

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

-- Nobody but you (the database owner) can run it
revoke all on function private.summary_email(timestamptz, timestamptz) from public, anon, authenticated;

-- Check: a preview of what the last 7 days' email would say (nothing is
-- sent). "null" means no changes in that time.
select private.summary_email(now() - interval '7 days', now()) ->> 'text' as preview;
