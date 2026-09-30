-- Photo storage for vervetDB: a public "monkey-photos" bucket that anyone
-- can view (the photos appear on the website), but only editors can add to,
-- replace or delete from.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS:
-- storage already has it switched on.)

-- The bucket. public = photos can be viewed by anyone with the link.
-- Limits: 5 MB per file, and only image files. (The website shrinks photos
-- to a few hundred KB before uploading, so 5 MB is just a safety net.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'monkey-photos',
    'monkey-photos',
    true,
    5242880,
    array['image/webp', 'image/jpeg', 'image/png']
);

-- Only editors (see public.is_editor() in schema.sql) can change what's in it.
-- Editors also need to "see" the stored files to replace or delete them.
-- (Visitors don't need this: public photos are viewed through their links.)
create policy "Editors can see monkey photos"
    on storage.objects for select to authenticated
    using (bucket_id = 'monkey-photos' and (select public.is_editor()));

create policy "Editors can upload monkey photos"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'monkey-photos' and (select public.is_editor()));

create policy "Editors can replace monkey photos"
    on storage.objects for update to authenticated
    using (bucket_id = 'monkey-photos' and (select public.is_editor()))
    with check (bucket_id = 'monkey-photos' and (select public.is_editor()));

create policy "Editors can delete monkey photos"
    on storage.objects for delete to authenticated
    using (bucket_id = 'monkey-photos' and (select public.is_editor()));
