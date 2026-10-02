-- Shows the photo move (scripts/move-photos.mjs) as ONE line in the daily
-- summary email, e.g. "Photos moved to vervetDB storage: 452 monkeys",
-- instead of a separate entry for every monkey. Other changes made the same
-- day are listed as normal. change-history.sql already includes this; this
-- is only for the database that was set up before it.
--
-- Run once in Supabase, BEFORE moving the photos:
-- SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

-- The one-off move of the old ImgBB photos into vervetDB's own storage
-- (scripts/move-photos.mjs): only photo links changed, each ImgBB link
-- swapped for a copy in the monkey-photos bucket, same order. The summary
-- shows these as a single line instead of one entry per monkey.
create function private.is_photo_move(old_row jsonb, new_row jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    with pairs as (
        select o.photo as before, n.photo as after
        from jsonb_array_elements_text(coalesce(old_row -> 'photos', '[]')) with ordinality as o (photo, i)
        full join jsonb_array_elements_text(coalesce(new_row -> 'photos', '[]')) with ordinality as n (photo, i)
            using (i)
    )
    select coalesce(
        old_row - 'photos' - 'updated_at' - 'updated_by'
            = new_row - 'photos' - 'updated_at' - 'updated_by'
        and exists (select 1 from pairs where before is distinct from after)
        and not exists (
            select 1 from pairs
            where before is distinct from after
              -- (a photo added or removed counts as "not a move")
              and not coalesce(before like 'https://i.ibb.co/%'
                   and after like '%/storage/v1/object/public/monkey-photos/%', false)
        ),
        false
    )
$$;

-- The summary of changes between two moments: { count, subject, html, text },
-- or null if there weren't any
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
    troop text;
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
        select * from private.monkey_changes
        where changed_at > since and changed_at <= until
        order by changed_at
    loop
        if c.action = 'changed' and private.is_photo_move(c.old_row, c.new_row) then
            moved := moved + 1;
            who := coalesce(c.changed_by_email, 'unknown');
            if not (who = any (movers)) then
                movers := movers || who;
            end if;
            continue;
        end if;

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

-- Nobody but you (the database owner) can run any of this
revoke all on all functions in schema private from public, anon, authenticated;
