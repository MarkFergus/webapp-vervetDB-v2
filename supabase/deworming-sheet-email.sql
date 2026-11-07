-- Deworming: the paper sheet's photo emailed on Approve (2026-11-02), and
-- Email Sheet on an approved list (2026-11-07)
-- When an admin approves a deworming list, the website makes a PDF of the
-- paper sheet's photos and this emails it, attached, from
-- reports@vervetdb.com to mark@vervet.za.org (for now: change
-- private.deworming_sheet_to below).
--
-- Admins only, approved lists only, and not more than once a minute for a
-- list, so it can't be used to send other emails.
-- Uses the Resend key already saved in the Vault (as the weekly reports).
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs deworming-results.sql and weekly-report-email.sql first.

begin;

-- When the sheet's photo was emailed (once)
alter table public.deworming_sheets add column if not exists photo_emailed_at timestamptz;

-- Who gets the submitted sheets' photos
create or replace function private.deworming_sheet_to()
returns jsonb
language sql
immutable
as $$ select '["mark@vervet.za.org"]'::jsonb $$;

------------------------------------------------------------------------
-- Email the sheet's PDF (base64), just after Approve → the addresses
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

    title := s.group_name || ' ' || (sessions ->> s.session) || ' Deworming';
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

revoke all on function private.deworming_sheet_to() from public, anon, authenticated;
revoke all on function public.email_deworming_sheet(bigint, text, text) from public, anon;
grant execute on function public.email_deworming_sheet(bigint, text, text) to authenticated;

commit;

-- Check: should say "ready"
select case when prosrc like '%Only admins can email%' then 'ready' else 'not updated' end as sheet_email
from pg_proc where proname = 'email_deworming_sheet';
