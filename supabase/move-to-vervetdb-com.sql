-- Moving to vervetDB.com: points the "Open vervetDB" link in the daily
-- summary email at the new address. (It becomes a setting, so a future
-- move is a one-line change.) change-history.sql already includes this;
-- this is only for the database that was set up before the move.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.

alter table private.summary_settings
    add column site_url text not null default 'https://vervetdb.com/';

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
