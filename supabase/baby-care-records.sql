-- Baby Care's records, entered on the Records page (#records): each baby's
-- daily milk total (milk-totals.sql) and its weights (new, here).
--   weights        one baby's weight on a day, in whole grams (any day: a
--                  weighing can be late, and there can be more than one a
--                  week; one per baby per day)
--   save_milk_totals(entries, replace) / save_weights(entries, replace)
--                  save a whole batch at once (the Records page's Save All).
--                  entries: [{ "monkey_id", "date", "value", "notes" }].
--                  A baby that already has one that day: replaced (replace
--                  true: in the name of whoever replaced it), or left as it
--                  was (replace false). → how many were saved
-- Milk totals now go up to 500 ml a day (was 2000).
-- Who can do what (the database enforces it):
--   read     anyone (the Statistics page is open to everyone, for now)
--   add      editors and admins (Save All: replacing anyone's too)
--   change / delete   admins, or whoever added it
--   limited accounts: nothing (admin-dashboard.sql)
-- Dates: not in the future (South African time).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs milk-totals.sql and admin-dashboard.sql to have been run first.

begin;

------------------------------------------------------------------------
-- Weights
------------------------------------------------------------------------
create table public.weights (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    weigh_date      date not null,
    grams           integer not null check (grams between 1 and 20000),
    notes           text check (notes = btrim(notes) and notes <> '' and char_length(notes) <= 500),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint weights_one_a_day unique (monkey_id, weigh_date)
);

alter table public.weights enable row level security;

create policy "Anyone can read weights"
    on public.weights for select to anon, authenticated using (true);

create policy "Editors can add weights"
    on public.weights for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change weights"
    on public.weights for update to authenticated
    using ((select public.is_admin()) or logged_by = (select auth.uid()))
    with check ((select public.is_admin()) or logged_by = (select auth.uid()));

create policy "Admins or the writer can delete weights"
    on public.weights for delete to authenticated
    using ((select public.is_admin()) or logged_by = (select auth.uid()));

-- (limited accounts: nothing, as on the other tables)
create policy "Limited accounts can't add" on public.weights as restrictive
    for insert to authenticated with check (not (select public.is_limited()));
create policy "Limited accounts can't change" on public.weights as restrictive
    for update to authenticated using (not (select public.is_limited())) with check (not (select public.is_limited()));
create policy "Limited accounts can't delete" on public.weights as restrictive
    for delete to authenticated using (not (select public.is_limited()));

grant select on public.weights to anon, authenticated;
grant insert (monkey_id, weigh_date, grams, notes), update (weigh_date, grams, notes), delete
    on public.weights to authenticated;

------------------------------------------------------------------------
-- Milk totals: up to 500 ml a day
------------------------------------------------------------------------
alter table public.milk_totals drop constraint if exists milk_totals_total_ml_check;
alter table public.milk_totals add constraint milk_totals_total_ml_check check (total_ml between 0 and 500);

------------------------------------------------------------------------
-- Save All: a batch of milk totals or weights
------------------------------------------------------------------------
-- (the checks both share: an editor or admin, not limited; a day that's
-- been and gone or today, South African time)
create or replace function private.check_baby_entry(entry_date date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_editor() or public.is_limited() then
        raise exception 'Only editors and admins can save these' using errcode = '42501';
    end if;
    if entry_date is null or entry_date > (now() at time zone 'Africa/Johannesburg')::date then
        raise exception 'The date can''t be in the future' using errcode = '23514';
    end if;
end;
$$;
revoke all on function private.check_baby_entry(date) from public, anon, authenticated;

create or replace function public.save_milk_totals(entries jsonb, replace boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    e jsonb;
    saved integer := 0;
    note text;
begin
    for e in select * from jsonb_array_elements(entries) loop
        perform private.check_baby_entry((e ->> 'date')::date);
        note := nullif(btrim(e ->> 'notes'), '');
        if exists (select 1 from public.milk_totals
                   where monkey_id = (e ->> 'monkey_id')::bigint and milk_date = (e ->> 'date')::date) then
            if replace then
                update public.milk_totals
                set total_ml = (e ->> 'value')::integer, notes = note,
                    logged_by = auth.uid(), logged_by_name = public.my_name(), logged_at = now()
                where monkey_id = (e ->> 'monkey_id')::bigint and milk_date = (e ->> 'date')::date;
                saved := saved + 1;
            end if;
        else
            insert into public.milk_totals (monkey_id, milk_date, total_ml, notes, logged_by, logged_by_name)
            values ((e ->> 'monkey_id')::bigint, (e ->> 'date')::date, (e ->> 'value')::integer, note,
                    auth.uid(), public.my_name());
            saved := saved + 1;
        end if;
    end loop;
    return saved;
end;
$$;

create or replace function public.save_weights(entries jsonb, replace boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    e jsonb;
    saved integer := 0;
    note text;
begin
    for e in select * from jsonb_array_elements(entries) loop
        perform private.check_baby_entry((e ->> 'date')::date);
        note := nullif(btrim(e ->> 'notes'), '');
        if exists (select 1 from public.weights
                   where monkey_id = (e ->> 'monkey_id')::bigint and weigh_date = (e ->> 'date')::date) then
            if replace then
                update public.weights
                set grams = (e ->> 'value')::integer, notes = note,
                    logged_by = auth.uid(), logged_by_name = public.my_name(), logged_at = now()
                where monkey_id = (e ->> 'monkey_id')::bigint and weigh_date = (e ->> 'date')::date;
                saved := saved + 1;
            end if;
        else
            insert into public.weights (monkey_id, weigh_date, grams, notes, logged_by, logged_by_name)
            values ((e ->> 'monkey_id')::bigint, (e ->> 'date')::date, (e ->> 'value')::integer, note,
                    auth.uid(), public.my_name());
            saved := saved + 1;
        end if;
    end loop;
    return saved;
end;
$$;

revoke all on function public.save_milk_totals(jsonb, boolean) from public, anon;
grant execute on function public.save_milk_totals(jsonb, boolean) to authenticated;
revoke all on function public.save_weights(jsonb, boolean) from public, anon;
grant execute on function public.save_weights(jsonb, boolean) to authenticated;

commit;

-- Check: should list four rows: milk_totals (Muse's six days still
-- there), save_milk_totals and save_weights, and the empty weights table
select 'milk_totals' as what, count(*)::text as n from public.milk_totals
union all
select proname, 'function' from pg_proc where proname in ('save_milk_totals', 'save_weights')
union all
select 'weights', count(*)::text from public.weights;
