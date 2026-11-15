-- Year End Presentation (Admin Dashboard → Year End Presentation): each
-- year's own words and title photos. The numbers come from the records
-- themselves; this only keeps what admins choose:
--   lines          { "numbers.vasectomies": "Sorry, boys", … }: the
--                  light-hearted lines, changed from the app's own
--   title_photos   the monkeys on the title slide (up to 5), in order
-- Admins only.
--
-- Run this BEFORE the new version is pushed.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm.

begin;

create table if not exists public.year_end_presentations (
    year            integer primary key check (year between 2018 and 2100),
    lines           jsonb not null default '{}'::jsonb check (jsonb_typeof(lines) = 'object'),
    title_photos    bigint[] not null default '{}' check (cardinality(title_photos) <= 5),
    updated_by      uuid references auth.users (id) on delete set null default auth.uid(),
    updated_by_name text default public.my_name(),
    updated_at      timestamptz not null default now()
);

alter table public.year_end_presentations enable row level security;

drop policy if exists "Admins can read year end presentations" on public.year_end_presentations;
create policy "Admins can read year end presentations"
    on public.year_end_presentations for select to authenticated
    using ((select public.is_admin()));

drop policy if exists "Admins can add year end presentations" on public.year_end_presentations;
create policy "Admins can add year end presentations"
    on public.year_end_presentations for insert to authenticated
    with check ((select public.is_admin()));

drop policy if exists "Admins can change year end presentations" on public.year_end_presentations;
create policy "Admins can change year end presentations"
    on public.year_end_presentations for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

-- Who saved it last, and when
create or replace function private.year_end_saved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_by := auth.uid();
    new.updated_by_name := public.my_name();
    new.updated_at := now();
    return new;
end;
$$;
revoke all on function private.year_end_saved() from public;

drop trigger if exists year_end_presentations_saved on public.year_end_presentations;
create trigger year_end_presentations_saved
    before insert or update on public.year_end_presentations
    for each row execute function private.year_end_saved();

grant select, insert, update on public.year_end_presentations to authenticated;

commit;

-- Check: should say "ready"
select case when count(*) = 3 then 'ready' else 'not updated' end as year_end
from pg_policies
where schemaname = 'public' and tablename = 'year_end_presentations';
