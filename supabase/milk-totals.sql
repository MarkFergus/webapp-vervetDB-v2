-- Milk totals: each baby's milk for a day (midnight to midnight, as the
-- Nightshift report's "finished on" figure), for Baby Care's Statistics.
-- Entered in the app later; to start with, Muse's first week (from the
-- baby reports chat) is added at the bottom.
--   monkey_id     the baby
--   milk_date     the day (midnight to midnight)
--   total_ml      the day's milk, in ml
--   notes         anything about that day (optional)
--   logged_by / logged_by_name / logged_at   who added it and when, filled
--                 in automatically
-- One total per baby per day.
-- Who can do what (the database enforces it):
--   read     anyone (the Statistics page is open to everyone, for now)
--   add      editors and admins, in their own name
--   change / delete   admins, or whoever added it
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)

begin;

create table public.milk_totals (
    id              bigint generated always as identity primary key,
    monkey_id       bigint not null references public.monkeys (id) on delete cascade,
    milk_date       date not null,
    total_ml        integer not null check (total_ml between 0 and 2000),
    notes           text check (notes = btrim(notes) and notes <> '' and char_length(notes) <= 500),
    logged_by       uuid references auth.users (id) on delete set null default auth.uid(),
    logged_by_name  text default public.my_name(),
    logged_at       timestamptz not null default now(),
    constraint milk_totals_one_a_day unique (monkey_id, milk_date)
);

alter table public.milk_totals enable row level security;

create policy "Anyone can read milk totals"
    on public.milk_totals for select to anon, authenticated using (true);

create policy "Editors can add milk totals"
    on public.milk_totals for insert to authenticated
    with check ((select public.is_editor()) and logged_by = (select auth.uid()));

create policy "Admins or the writer can change milk totals"
    on public.milk_totals for update to authenticated
    using ((select public.is_admin()) or logged_by = (select auth.uid()))
    with check ((select public.is_admin()) or logged_by = (select auth.uid()));

create policy "Admins or the writer can delete milk totals"
    on public.milk_totals for delete to authenticated
    using ((select public.is_admin()) or logged_by = (select auth.uid()));

grant select on public.milk_totals to anon, authenticated;
-- Only the baby, day, total and notes are typed in; who and when are filled
-- in by the database
grant insert (monkey_id, milk_date, total_ml, notes), update (milk_date, total_ml, notes), delete
    on public.milk_totals to authenticated;

-- Muse's first week, from the Nightshift reports' "finished on" totals
-- (each the day before's, midnight to midnight), from her first full day
-- (19 Oct; she arrived on the 18th)
insert into public.milk_totals (monkey_id, milk_date, total_ml, notes)
select m.id, v.milk_date::date, v.total_ml, v.notes
from public.monkeys m
cross join (values
    ('2026-10-19', 142, 'Switched from RC2 to PA at 8:55am'),
    ('2026-10-20', 160, null),
    ('2026-10-21', 169, null),
    ('2026-10-22', 180, 'Skipped the 2am feed due to the high total'),
    ('2026-10-23', 190, null)
) as v (milk_date, total_ml, notes)
where m.name = 'Muse'
  and m.introcage_id in (select e.id from public.enclosures e where e.name = 'Dreamland');

commit;

-- Check: Muse's five days (142, 160, 169, 180, 190)
select m.name, t.milk_date, t.total_ml, t.notes
from public.milk_totals t join public.monkeys m on m.id = t.monkey_id
order by t.milk_date;
