-- Deworming sheets (Records → Sections → Deworming): an admin prepares a
-- sheet for a deworming group and session, with each monkey's dewormer and
-- dose, ready for staff to print and complete.
--   deworming_sheets   one sheet: the group (group_key, e.g. "troop:3" or
--                      "ics:Top", and its name as shown, e.g. "D&D
--                      Troop"), the session ('6_month', '6_month_fu',
--                      '3_month', '3_month_fu'), the start date, the
--                      instruction line, and its status ('ready' for now;
--                      completing and approving come next)
--   deworming_lines    each monkey on a sheet: its dewormer (medication,
--                      e.g. "Albendazole", or another typed in), dose (e.g.
--                      "1/4 tab") and how many days (1, or 3: once a day)
--   save_deworming_sheet(sheet)   adds or changes a sheet and its monkeys in
--                      one go (Prepare Sheet's Save) → its id
--
-- Who can do what (the database enforces it, not just the website):
--   read                 staff (any account with a role)
--   prepare / change / delete   admins
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs names.sql and admin-dashboard.sql to have been run (they have been).

begin;

create table public.deworming_sheets (
    id                bigint generated always as identity primary key,
    group_key         text not null check (group_key ~ '^(troop|ics|enclosure):[A-Za-z0-9 ]+$'),
    group_name        text not null check (group_name = btrim(group_name) and group_name <> '' and char_length(group_name) <= 60),
    session           text not null check (session in ('6_month', '6_month_fu', '3_month', '3_month_fu')),
    start_date        date not null,
    instructions      text
                      check (instructions is null or (instructions = btrim(instructions) and instructions <> '' and char_length(instructions) <= 300)),
    status            text not null default 'ready' check (status in ('ready')),
    prepared_by       uuid references auth.users (id) on delete set null default auth.uid(),
    prepared_by_name  text default public.my_name(),
    prepared_at       timestamptz not null default now()
);

create index deworming_sheets_group_idx on public.deworming_sheets (group_key, start_date desc);

create table public.deworming_lines (
    id          bigint generated always as identity primary key,
    sheet_id    bigint not null references public.deworming_sheets (id) on delete cascade,
    monkey_id   bigint not null references public.monkeys (id) on delete cascade,
    medication  text not null check (medication = btrim(medication) and medication <> '' and char_length(medication) <= 40),
    dose        text not null check (dose = btrim(dose) and dose <> '' and char_length(dose) <= 20),
    days        smallint not null check (days in (1, 3)),
    unique (sheet_id, monkey_id)
);

create index deworming_lines_monkey_idx on public.deworming_lines (monkey_id);

alter table public.deworming_sheets enable row level security;
alter table public.deworming_lines enable row level security;

create policy "Staff can read deworming sheets"
    on public.deworming_sheets for select to authenticated
    using ((select public.can_log_maintenance()));
create policy "Admins can delete deworming sheets"
    on public.deworming_sheets for delete to authenticated
    using ((select public.is_admin()));

create policy "Staff can read deworming lines"
    on public.deworming_lines for select to authenticated
    using ((select public.can_log_maintenance()));

grant select, delete on public.deworming_sheets to authenticated;
grant select on public.deworming_lines to authenticated;
-- (adding and changing: save_deworming_sheet only)

------------------------------------------------------------------------
-- Prepare Sheet's Save: a new sheet (no "id"), or a change to one, and its
-- monkeys (all replaced). Admins only.
--   sheet: { id?, group_key, group_name, session, start_date, instructions,
--            lines: [{ monkey_id, medication, dose, days }] }
------------------------------------------------------------------------
create or replace function public.save_deworming_sheet(sheet jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    saved_id bigint := (sheet ->> 'id')::bigint;
begin
    if not public.is_admin() then
        raise exception 'Only admins can prepare deworming sheets' using errcode = '42501';
    end if;
    if jsonb_array_length(coalesce(sheet -> 'lines', '[]')) = 0 then
        raise exception 'Please choose at least one monkey.' using errcode = 'P0001';
    end if;

    if saved_id is null then
        insert into public.deworming_sheets (group_key, group_name, session, start_date, instructions)
        values (sheet ->> 'group_key', sheet ->> 'group_name', sheet ->> 'session',
                (sheet ->> 'start_date')::date, nullif(btrim(sheet ->> 'instructions'), ''))
        returning id into saved_id;
    else
        update public.deworming_sheets set
            group_key = sheet ->> 'group_key',
            group_name = sheet ->> 'group_name',
            session = sheet ->> 'session',
            start_date = (sheet ->> 'start_date')::date,
            instructions = nullif(btrim(sheet ->> 'instructions'), '')
        where id = saved_id;
        if not found then
            raise exception 'That deworming sheet no longer exists.' using errcode = 'P0001';
        end if;
        delete from public.deworming_lines l where l.sheet_id = saved_id;
    end if;

    insert into public.deworming_lines (sheet_id, monkey_id, medication, dose, days)
    select saved_id, (l ->> 'monkey_id')::bigint, btrim(l ->> 'medication'), btrim(l ->> 'dose'), (l ->> 'days')::smallint
    from jsonb_array_elements(sheet -> 'lines') l;

    return saved_id;
end;
$$;

revoke all on function public.save_deworming_sheet(jsonb) from public, anon;
grant execute on function public.save_deworming_sheet(jsonb) to authenticated;

commit;

-- Check: the two new tables (should list both)
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'deworming%' order by 1;
