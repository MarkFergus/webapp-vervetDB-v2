-- Photos on records: up to 4 photos added with a new Injury, Injury Update,
-- Condition, or a record (Observation, a Full Profile record…).
--   record_photos
--     kind        what it's on: 'injury', 'injury_update', 'condition', 'record'
--     record_id   that one's id (injuries / injury_updates /
--                 monkey_conditions / monkey_records)
--     monkey_id   whose it is
--     path        the photo, in the private record-photos bucket
--     added_by / added_by_name / added_at
--   When the record is deleted, its photos' rows go too (the files stay in
--   storage, as removed monkey photos do).
-- Who can do what (the database enforces it):
--   see      staff only: any account with a role
--   add      editors and admins (not limited accounts), in their own name
--   delete   admins, or whoever added it
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Safe to run again.

begin;

create table if not exists public.record_photos (
    id             bigint generated always as identity primary key,
    kind           text not null check (kind in ('injury', 'injury_update', 'condition', 'record')),
    record_id      bigint not null,
    monkey_id      bigint references public.monkeys (id) on delete cascade,
    path           text not null unique,
    added_by       uuid references auth.users (id) on delete set null default auth.uid(),
    added_by_name  text default public.my_name(),
    added_at       timestamptz not null default now()
);

create index if not exists record_photos_record_idx on public.record_photos (kind, record_id);

alter table public.record_photos enable row level security;

drop policy if exists "Staff can see record photos" on public.record_photos;
create policy "Staff can see record photos"
    on public.record_photos for select to authenticated
    using ((select public.can_log_maintenance()));

drop policy if exists "Editors can add record photos" on public.record_photos;
create policy "Editors can add record photos"
    on public.record_photos for insert to authenticated
    with check ((select public.is_editor()) and not (select public.is_limited()) and added_by = (select auth.uid()));

drop policy if exists "Admins or the adder can delete record photos" on public.record_photos;
create policy "Admins or the adder can delete record photos"
    on public.record_photos for delete to authenticated
    using ((select public.is_admin()) or added_by = (select auth.uid()));

grant select, delete on public.record_photos to authenticated;
grant insert (kind, record_id, monkey_id, path) on public.record_photos to authenticated;

-- A record deleted: its photos' rows too
create or replace function private.forget_record_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.record_photos p where p.kind = tg_argv[0] and p.record_id = old.id;
    return null;
end;
$$;
revoke all on function private.forget_record_photos() from public, anon, authenticated;

drop trigger if exists injuries_forget_photos on public.injuries;
create trigger injuries_forget_photos after delete on public.injuries
    for each row execute function private.forget_record_photos('injury');
drop trigger if exists injury_updates_forget_photos on public.injury_updates;
create trigger injury_updates_forget_photos after delete on public.injury_updates
    for each row execute function private.forget_record_photos('injury_update');
drop trigger if exists monkey_conditions_forget_photos on public.monkey_conditions;
create trigger monkey_conditions_forget_photos after delete on public.monkey_conditions
    for each row execute function private.forget_record_photos('condition');
drop trigger if exists monkey_records_forget_photos on public.monkey_records;
create trigger monkey_records_forget_photos after delete on public.monkey_records
    for each row execute function private.forget_record_photos('record');

-- Staff Activity
drop trigger if exists record_photos_record_change on public.record_photos;
create trigger record_photos_record_change
    after insert or delete on public.record_photos
    for each row execute function private.record_change();

-- The photos: a private bucket (staff only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-photos', 'record-photos', false, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "Staff can see record photo files" on storage.objects;
create policy "Staff can see record photo files"
    on storage.objects for select to authenticated
    using (bucket_id = 'record-photos' and (select public.can_log_maintenance()));
drop policy if exists "Editors can add record photo files" on storage.objects;
create policy "Editors can add record photo files"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'record-photos' and (select public.is_editor()) and not (select public.is_limited()));
drop policy if exists "Admins can delete record photo files" on storage.objects;
create policy "Admins can delete record photo files"
    on storage.objects for delete to authenticated
    using (bucket_id = 'record-photos' and (select public.is_admin()));

commit;

-- Check: should say "ready" twice
select
    (select case when count(*) = 1 then 'ready' else 'not ready' end
     from information_schema.tables where table_schema = 'public' and table_name = 'record_photos') as table_ready,
    (select case when count(*) = 1 then 'ready' else 'not ready' end
     from storage.buckets where id = 'record-photos') as bucket_ready;
