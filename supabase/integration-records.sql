-- Integration records: starting an integration, and every Status Update
-- (Records → Integration → Current Integrations), adds an Integration record
-- to the monkey's Rehabilitation records by itself, on that day:
--   "Foster-Mum integration started at Goliath A"
--   "Integration placed on hold: <reason>"
--   "Integration resumed"
--   "Integration completed" (": <notes>" when there are some)
--   "Integration cancelled: <reason>"
-- The notes typed in the Status Update are kept with the integration
-- (status_note) so the record can include them.
-- Also adds the records for integrations from before this file (each one's
-- start, and its On Hold / Completed / Cancelled entries in its Integration
-- reports). Running this again is harmless: nothing is added twice.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs integrations.sql, integration-place.sql and monkey-records.sql to
-- have been run first (they have been).

begin;

-- The Status Update's notes (the reason for On Hold / Cancelled)
alter table public.integrations add column if not exists status_note text
    check (status_note is null or char_length(status_note) <= 970);
grant update (status_note) on public.integrations to authenticated;

-- "Foster-Mum", "Adult", "Group"
create or replace function private.integration_kind_name(kind text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case kind when 'foster_mum' then 'Foster-Mum' else initcap(kind) end;
$$;

-- "Integration placed on hold: why"
create or replace function private.integration_status_words(status text, note text)
returns text
language sql
immutable
set search_path = ''
as $$
    select left(
        case status
            when 'on_hold' then 'Integration placed on hold'
            when 'active' then 'Integration resumed'
            when 'completed' then 'Integration completed'
            when 'cancelled' then 'Integration cancelled'
            else 'Integration ' || replace(status, '_', ' ')
        end || coalesce(': ' || nullif(btrim(note), ''), ''),
        1000);
$$;

-- security definer: editors change integrations, but only admins can add
-- records themselves; the record is still in the changer's name
create or replace function private.integration_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
        values
            (new.monkey_id, 'rehabilitation', new.started_on, 'integration',
             private.integration_kind_name(new.kind) || ' integration started'
                 || coalesce(' at ' || nullif(btrim(new.place), ''), ''),
             auth.uid(), public.my_name());
    elsif new.status is distinct from old.status then
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
        values
            (new.monkey_id, 'rehabilitation', coalesce(new.status_on, current_date), 'integration',
             private.integration_status_words(new.status, new.status_note),
             auth.uid(), public.my_name());
    end if;
    return null;
end;
$$;
revoke all on function private.integration_record() from public, anon, authenticated;
revoke all on function private.integration_kind_name(text) from public, anon, authenticated;
revoke all on function private.integration_status_words(text, text) from public, anon, authenticated;

-- (after the place is filled in: integrations_place runs before insert)
drop trigger if exists integrations_record on public.integrations;
create trigger integrations_record
    after insert or update of status on public.integrations
    for each row execute function private.integration_record();

------------------------------------------------------------------------
-- The integrations from before: their records, in the name of whoever
-- started them / wrote the status entry. (No Staff Activity or Last Seen
-- for these: the history trigger is paused while they're added.)
------------------------------------------------------------------------
alter table public.monkey_records disable trigger user;

-- Each one's start
insert into public.monkey_records
    (monkey_id, section, record_date, category, details, logged_by, logged_by_name, logged_at)
select i.monkey_id, 'rehabilitation', i.started_on, 'integration',
       private.integration_kind_name(i.kind) || ' integration started'
           || coalesce(' at ' || nullif(btrim(i.place), ''), ''),
       i.logged_by, i.logged_by_name, i.logged_at
from public.integrations i
where not exists (
    select 1 from public.monkey_records r
    where r.monkey_id = i.monkey_id and r.category = 'integration'
      and r.record_date = i.started_on and r.details like '% integration started%'
);

-- Each On Hold / Completed / Cancelled, from its entry in the Integration
-- reports ("Integration on hold: why", on the day of the Status Update)
insert into public.monkey_records
    (monkey_id, section, record_date, category, details, logged_by, logged_by_name, logged_at)
select e.monkey_id, 'rehabilitation', e.to_date, 'integration',
       private.integration_status_words(
           case s.word when 'on hold' then 'on_hold' else s.word end,
           nullif(btrim(substr(e.report, length('Integration ' || s.word) + 2)), '')),
       e.logged_by, e.logged_by_name, e.logged_at
from public.integration_reports e
cross join lateral (
    select substring(e.report from '^Integration (on hold|completed|cancelled)(?::|$)') as word
) s
where s.word is not null
  and e.from_date = e.to_date
  and not exists (
      select 1 from public.monkey_records r
      where r.monkey_id = e.monkey_id and r.category = 'integration'
        and r.record_date = e.to_date
        and r.details like private.integration_status_words(case s.word when 'on hold' then 'on_hold' else s.word end, null) || '%'
  );

alter table public.monkey_records enable trigger user;

commit;

-- Check: the Integration records, newest first (Nicholas's should be here)
select m.name, r.record_date, r.details, r.logged_by_name
from public.monkey_records r
join public.monkeys m on m.id = r.monkey_id
where r.category = 'integration'
order by r.record_date desc, r.id desc;
