-- Integrations: where it started (2026-11-06), so a monkey's Timeline can say
-- "Started foster-mum integration at Koko A". Filled in by the database when an
-- integration is started, from where the monkey is then. Older ones stay empty.
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs integrations.sql and movement-records.sql first (they have been).

begin;

alter table public.integrations add column if not exists place text;

create or replace function private.integration_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    select private.place_text(m.in_sickbay, m.stay_introcage_id, m.introcage_id, m.troop_id)
    into new.place
    from public.monkeys m
    where m.id = new.monkey_id;
    return new;
end;
$$;
revoke all on function private.integration_place() from public, anon, authenticated;

drop trigger if exists integrations_place on public.integrations;
create trigger integrations_place
    before insert on public.integrations
    for each row execute function private.integration_place();

commit;

-- Check: should say ready
select 'ready' as integration_place;
