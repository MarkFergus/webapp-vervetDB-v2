-- vervetDB database: tables, data rules and who can do what.
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
--
-- Access:  anyone can READ monkeys and troops (the public website).
--          Only people listed in `editors` can ADD, CHANGE or DELETE them.

------------------------------------------------------------------------
-- Troops (the troop filter list, in display order)
------------------------------------------------------------------------
create table public.troops (
    id          bigint generated always as identity primary key,
    name        text not null unique
                check (name = btrim(name) and name <> ''),
    sort_order  integer not null default 0
);

------------------------------------------------------------------------
-- Helper for the photo rule below: every link must start with https://
------------------------------------------------------------------------
create function public.all_https(urls text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(bool_and(u ~ '^https://\S+$'), false) from unnest(urls) as u
$$;

------------------------------------------------------------------------
-- Monkeys. The checks are the same rules the data tests used to enforce,
-- so a bad entry can't be saved at all.
------------------------------------------------------------------------
create table public.monkeys (
    id           bigint generated always as identity primary key,
    name         text not null
                 check (name = btrim(name) and name <> ''),
    -- '' = not recorded
    sex          text not null default ''
                 check (sex in ('male', 'female', '')),
    -- '' = no chip; one number, or two written "1011 & 1604"
    chip         text not null default ''
                 check (chip ~ '^(\d+( & \d+)?)?$'),
    troop_id     bigint not null references public.troops (id),
    -- null = unknown
    birth_year   integer
                 check (birth_year between 1980 and 2100),
    -- first photo is the card photo; at least one, all https links
    photos       text[] not null
                 check (cardinality(photos) >= 1 and public.all_https(photos)),
    bio          text not null default ''
                 check (bio = btrim(bio) and bio !~ '  '),
    description  text not null default ''
                 check (description = btrim(description) and description !~ '  '),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    -- the editor who last saved it (filled in automatically)
    updated_by   uuid references auth.users (id)
);

create index monkeys_troop_id_idx on public.monkeys (troop_id);

-- Keep updated_at / updated_by current on every save
create function public.stamp_monkey_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
end;
$$;

create trigger monkeys_stamp_update
    before insert or update on public.monkeys
    for each row execute function public.stamp_monkey_update();

------------------------------------------------------------------------
-- Editors: the signed-in accounts allowed to make changes.
-- Added by hand (see the bottom of this file), never from the website.
------------------------------------------------------------------------
create table public.editors (
    user_id   uuid primary key references auth.users (id) on delete cascade,
    added_at  timestamptz not null default now()
);

-- Is the person making this request an editor?
create function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.editors where user_id = (select auth.uid())
    )
$$;

------------------------------------------------------------------------
-- Row level security: the rules Supabase enforces on every request
------------------------------------------------------------------------
alter table public.troops  enable row level security;
alter table public.monkeys enable row level security;
alter table public.editors enable row level security;

-- Everyone (signed in or not) can read
create policy "Anyone can read troops"
    on public.troops for select
    to anon, authenticated
    using (true);

create policy "Anyone can read monkeys"
    on public.monkeys for select
    to anon, authenticated
    using (true);

-- Only editors can add, change or delete
create policy "Editors can add troops"
    on public.troops for insert to authenticated
    with check ((select public.is_editor()));
create policy "Editors can change troops"
    on public.troops for update to authenticated
    using ((select public.is_editor())) with check ((select public.is_editor()));
create policy "Editors can delete troops"
    on public.troops for delete to authenticated
    using ((select public.is_editor()));

create policy "Editors can add monkeys"
    on public.monkeys for insert to authenticated
    with check ((select public.is_editor()));
create policy "Editors can change monkeys"
    on public.monkeys for update to authenticated
    using ((select public.is_editor())) with check ((select public.is_editor()));
create policy "Editors can delete monkeys"
    on public.monkeys for delete to authenticated
    using ((select public.is_editor()));

-- Signed-in people can see whether they themselves are an editor
-- (so the website knows whether to show Edit buttons)
create policy "People can see their own editor entry"
    on public.editors for select to authenticated
    using (user_id = (select auth.uid()));

-- Table access for the website (the policies above narrow it down)
grant usage on schema public to anon, authenticated;
grant select on public.troops, public.monkeys to anon, authenticated;
grant insert, update, delete on public.troops, public.monkeys to authenticated;
grant select on public.editors to authenticated;

------------------------------------------------------------------------
-- Making someone an editor (run separately, after creating their account
-- in Authentication → Users). Replace the email address:
--
--   insert into public.editors (user_id)
--   select id from auth.users where email = 'you@example.com';
------------------------------------------------------------------------
