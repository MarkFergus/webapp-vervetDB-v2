-- Maintenance Issues: something that needs doing, as opposed to a Maintenance
-- report (work that's been done). Reported from the Interactive Map (a pin) or
-- Records → Maintenance; stays open until it's fixed, which adds a Maintenance
-- report, or closed without one (a false alarm or a duplicate, with a reason).
--
-- Staff only: editors, maintenance staff and admins report, change, fix and
-- close them; only admins delete them. Visitors and Limited accounts can't see
-- them. Their photos are kept privately in their own storage bucket.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Safe to run more than once.

begin;

create table if not exists public.maintenance_issues (
    id             bigint generated always as identity primary key,
    -- the phone's code for it, so one sent twice is only saved once
    client_ref     uuid unique,
    enclosure_id   bigint not null references public.enclosures (id) on delete cascade,
    -- the pin: where on the map file (none if it was reported without the map)
    map_x          double precision,
    map_y          double precision,
    details        text not null check (details = btrim(details) and details <> ''),
    urgent         boolean not null default false,
    -- up to 4 (their paths in the maintenance-issues bucket)
    photo_paths    text[] not null default '{}' check (cardinality(photo_paths) <= 4),
    status         text not null default 'open' check (status in ('open', 'fixed', 'closed')),
    -- closed without a report: why
    close_reason   text,
    -- fixed: the Maintenance report that says so
    report_id      bigint references public.maintenance (id) on delete set null,
    closed_at      timestamptz,
    closed_by      uuid references auth.users (id) on delete set null,
    closed_by_name text,
    reported_by       uuid references auth.users (id) on delete set null default auth.uid(),
    reported_by_name  text default public.my_name(),
    reported_at       timestamptz not null default now(),
    check ((map_x is null) = (map_y is null)),
    check (status <> 'closed' or btrim(coalesce(close_reason, '')) <> '')
);

-- (If an earlier copy of this file has been run: one photo becomes a list)
alter table public.maintenance_issues
    add column if not exists photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4);
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'maintenance_issues' and column_name = 'photo_path'
    ) then
        update public.maintenance_issues set photo_paths = array[photo_path] where photo_path is not null;
        alter table public.maintenance_issues drop column photo_path;
    end if;
end;
$$;

create index if not exists maintenance_issues_open_idx
    on public.maintenance_issues (enclosure_id) where status = 'open';

-- Who closed it and when: filled in here, not by the phone
create or replace function private.maintenance_issue_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.status = 'open' and new.status <> 'open' then
        new.closed_at := now();
        new.closed_by := auth.uid();
        new.closed_by_name := public.my_name();
    end if;
    return new;
end;
$$;
revoke all on function private.maintenance_issue_closed() from public;

drop trigger if exists maintenance_issue_closed on public.maintenance_issues;
create trigger maintenance_issue_closed
    before update on public.maintenance_issues
    for each row execute function private.maintenance_issue_closed();

-- Who can do what
alter table public.maintenance_issues enable row level security;

drop policy if exists "Staff can see maintenance issues" on public.maintenance_issues;
create policy "Staff can see maintenance issues"
    on public.maintenance_issues for select to authenticated
    using ((select public.can_log_maintenance()) and not (select public.is_limited()));

drop policy if exists "Staff can report maintenance issues" on public.maintenance_issues;
create policy "Staff can report maintenance issues"
    on public.maintenance_issues for insert to authenticated
    with check ((select public.can_log_maintenance()) and not (select public.is_limited()) and reported_by = (select auth.uid()));

drop policy if exists "Staff can change maintenance issues" on public.maintenance_issues;
create policy "Staff can change maintenance issues"
    on public.maintenance_issues for update to authenticated
    using ((select public.can_log_maintenance()) and not (select public.is_limited()))
    with check ((select public.can_log_maintenance()) and not (select public.is_limited()));

drop policy if exists "Admins can delete maintenance issues" on public.maintenance_issues;
create policy "Admins can delete maintenance issues"
    on public.maintenance_issues for delete to authenticated
    using ((select public.is_admin()));

revoke all on public.maintenance_issues from anon, authenticated;
grant select, delete on public.maintenance_issues to authenticated;
grant insert (client_ref, enclosure_id, map_x, map_y, details, urgent, photo_paths)
    on public.maintenance_issues to authenticated;
grant update (enclosure_id, details, urgent, photo_paths, status, close_reason, report_id)
    on public.maintenance_issues to authenticated;

-- Staff Activity: noted like the other records
drop trigger if exists maintenance_issues_record_change on public.maintenance_issues;
create trigger maintenance_issues_record_change
    after insert or update or delete on public.maintenance_issues
    for each row execute function private.record_change();

-- The photos: a private bucket (staff only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maintenance-issues', 'maintenance-issues', false, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "Staff can see maintenance issue photos" on storage.objects;
create policy "Staff can see maintenance issue photos"
    on storage.objects for select to authenticated
    using (bucket_id = 'maintenance-issues' and (select public.can_log_maintenance()) and not (select public.is_limited()));
drop policy if exists "Staff can add maintenance issue photos" on storage.objects;
create policy "Staff can add maintenance issue photos"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'maintenance-issues' and (select public.can_log_maintenance()) and not (select public.is_limited()));
drop policy if exists "Admins can delete maintenance issue photos" on storage.objects;
create policy "Admins can delete maintenance issue photos"
    on storage.objects for delete to authenticated
    using (bucket_id = 'maintenance-issues' and (select public.is_admin()));

commit;

-- Check: should say 1, 4 and 1
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'maintenance_issues') as issues_table,
       (select count(*) from pg_policies where tablename = 'maintenance_issues') as rules,
       (select count(*) from storage.buckets where id = 'maintenance-issues') as photo_bucket;
