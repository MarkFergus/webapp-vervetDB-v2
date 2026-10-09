-- Account photos: each staff account can add a photo of themselves, shown
-- in place of the person icon (the account pop-up, the top bar and the
-- bottom bar), and later on the staff page. Staff (any role) can see
-- everyone's; each person can only add, change or remove their own.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs roles.sql to have been run first.

begin;

-- The photos: a public "avatars" bucket (shown with a plain link, like the
-- monkey photos). Each person's go in a folder named after their account,
-- e.g. "<their id>/1760000000000.webp". The website makes them 256 × 256,
-- a few KB, so 1 MB is just a safety net.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    true,
    1048576,
    array['image/webp', 'image/jpeg']
);

-- Staff can add to, and remove from, their own folder only (they also need
-- to "see" their own files to remove them)
create policy "Staff can see their own photo"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.can_log_maintenance())
    );

create policy "Staff can upload their own photo"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.can_log_maintenance())
    );

create policy "Staff can delete their own photo"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.can_log_maintenance())
    );

-- Which photo is whose: one per account (its web address)
create table public.avatars (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    url         text not null check (url like 'https://%'),
    updated_at  timestamptz not null default now()
);

alter table public.avatars enable row level security;

-- Staff can see everyone's (the staff page, later)
create policy "Staff can read photos"
    on public.avatars for select to authenticated
    using ((select public.can_log_maintenance()));

-- Each person sets, changes or removes their own
create policy "Staff can add their own photo"
    on public.avatars for insert to authenticated
    with check (user_id = (select auth.uid()) and (select public.can_log_maintenance()));

create policy "Staff can change their own photo"
    on public.avatars for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()) and (select public.can_log_maintenance()));

create policy "Staff can remove their own photo"
    on public.avatars for delete to authenticated
    using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.avatars to authenticated;

commit;

-- Check: everyone with an account, and whether they've added a photo
select u.email, e.role, a.url is not null as has_photo
from public.editors e
join auth.users u on u.id = e.user_id
left join public.avatars a on a.user_id = e.user_id
order by e.role, u.email;
