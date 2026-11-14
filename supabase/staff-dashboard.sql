-- My Dashboard (#dashboard): each staff member's own page.
--   staff_todos             their to-do list: text (up to 200 characters),
--                           a due date if they like, done or not
--   staff_checklist_items   their weekly and monthly checklists' items
--                           (every: 'week' or 'month', in their order)
--   staff_checklist_ticks   an item ticked for a week (its Monday,
--                           "2026-11-09") or a month ("2026-11"): a new week
--                           or month starts unticked
--   staff_dashboard_settings  their sections, for My Alerts (Top, Middle,
--                           Bottom, Sickbay)
-- Everyone sees and changes only their own (the database enforces it):
-- staff only (any role), not shared, not in Staff Activity.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Safe to run again.

begin;

create table if not exists public.staff_todos (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    text        text not null check (text = btrim(text) and text <> '' and char_length(text) <= 200),
    due_on      date,
    done_at     timestamptz,
    created_at  timestamptz not null default now()
);
create index if not exists staff_todos_user_idx on public.staff_todos (user_id);

create table if not exists public.staff_checklist_items (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    every       text not null check (every in ('week', 'month')),
    text        text not null check (text = btrim(text) and text <> '' and char_length(text) <= 200),
    position    integer not null default 0,
    created_at  timestamptz not null default now()
);
create index if not exists staff_checklist_items_user_idx on public.staff_checklist_items (user_id);

create table if not exists public.staff_checklist_ticks (
    item_id     bigint not null references public.staff_checklist_items (id) on delete cascade,
    period      text not null check (period ~ '^\d{4}-\d{2}(-\d{2})?$'),
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    ticked_at   timestamptz not null default now(),
    primary key (item_id, period)
);

create table if not exists public.staff_dashboard_settings (
    user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    sections    text[] not null default '{}'
);

-- Their own only, staff (any role)
do $$
declare
    t text;
begin
    foreach t in array array['staff_todos', 'staff_checklist_items', 'staff_checklist_ticks', 'staff_dashboard_settings'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists "Their own" on public.%I', t);
        execute format(
            'create policy "Their own" on public.%I for all to authenticated '
            'using (user_id = (select auth.uid()) and (select public.can_log_maintenance())) '
            'with check (user_id = (select auth.uid()) and (select public.can_log_maintenance()))', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end
$$;

-- (a tick only on their own items)
drop policy if exists "Ticks on their own items" on public.staff_checklist_ticks;
create policy "Ticks on their own items" on public.staff_checklist_ticks as restrictive for insert to authenticated
    with check (exists (select 1 from public.staff_checklist_items i where i.id = item_id and i.user_id = (select auth.uid())));

commit;

-- Check: should say "ready"
select case when count(*) = 4 then 'ready' else 'not ready' end as dashboard_ready
from information_schema.tables
where table_schema = 'public'
  and table_name in ('staff_todos', 'staff_checklist_items', 'staff_checklist_ticks', 'staff_dashboard_settings');
