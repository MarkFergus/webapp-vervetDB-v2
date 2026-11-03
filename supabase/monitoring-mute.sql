-- Mute Missing Alerts (2026-11-03): a long-term setting (admins, the Full
-- Profile's Edit → Monitoring) for a monkey that can't be reliably told
-- apart in monitoring (mostly Camelot's, with so many monkeys): it's never
-- flagged Must See or Not Seen Last Session, nor listed as missing. It
-- still counts in the sessions' "seen" numbers and "Not seen" lists, and
-- its injuries and conditions still show.
--   monitoring.alerts_muted   (admins only can change it)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monitoring.sql. Safe to run more than once.

begin;

alter table public.monitoring add column if not exists alerts_muted boolean not null default false;

-- Only admins can mute or unmute (editors can change the rest of the
-- monitoring from the pop-up's Edit)
create or replace function public.monitoring_mute_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (tg_op = 'INSERT' and new.alerts_muted)
       or (tg_op = 'UPDATE' and new.alerts_muted is distinct from old.alerts_muted) then
        if not public.is_admin() then
            raise exception 'Only admins can mute or unmute missing alerts' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists monitoring_mute_admins on public.monitoring;
create trigger monitoring_mute_admins
    before insert or update on public.monitoring
    for each row execute function public.monitoring_mute_admins();
revoke all on function public.monitoring_mute_admins() from public, anon, authenticated;

commit;

-- Check: should say 1
select count(*) as alerts_muted_column from information_schema.columns
where table_schema = 'public' and table_name = 'monitoring' and column_name = 'alerts_muted';
