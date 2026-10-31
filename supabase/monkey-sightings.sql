-- Sightings (Records → Sections → Monitoring, and the monkey's pop-up): a
-- missing monkey seen between sessions, ticked off on its own ("Malawi
-- seen 01/11 by Sam"). It counts as last seen, so it clears Not Seen Last
-- Session and Must See; only sessions after it count towards Must See
-- again.
--
-- Who can do what (the database enforces it, not just the website):
--   read     staff only (any account with a role)
--   add      editors and admins, in their own name (not in the future)
--   delete   whoever added it, or an admin
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monitoring-sessions.sql and staff-activity.sql to have been run
-- (they have been).

begin;

create table public.monkey_sightings (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    seen_on         date not null,
    note            text
                    check (note is null or (note = btrim(note) and note <> '' and char_length(note) <= 200)),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now()
);

create index monkey_sightings_monkey_idx on public.monkey_sightings (monkey_id, seen_on desc);

alter table public.monkey_sightings enable row level security;

create policy "Staff can read sightings"
    on public.monkey_sightings for select to authenticated
    using ((select public.can_log_maintenance()));

create policy "Editors can add sightings"
    on public.monkey_sightings for insert to authenticated
    with check (
        (select public.is_editor())
        and logged_by = (select auth.uid())
        and seen_on <= (now() at time zone 'Africa/Johannesburg')::date
    );

create policy "Admins or the writer can delete sightings"
    on public.monkey_sightings for delete to authenticated
    using ((select public.is_admin()) or ((select public.is_editor()) and logged_by = (select auth.uid())));

grant select on public.monkey_sightings to authenticated;
grant insert (monkey_id, seen_on, note), delete on public.monkey_sightings to authenticated;

-- Staff Activity: in the history too
create trigger monkey_sightings_record_change
    after insert or update or delete on public.monkey_sightings
    for each row execute function private.record_change();

commit;

-- Check: the new table is there (0 sightings so far)
select count(*) as sightings_so_far from public.monkey_sightings;
