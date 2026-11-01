-- Records on the Full Profile (Rehabilitation and Medical): admins add
-- them by hand, e.g. historical records from before vervetDB.
--   Rehabilitation: Movement, Escape, Observation (a Movement typed in:
--     "Moved from Goliath A to Goliath Troop: integrated", like the ones
--     added by every move)
--   Medical: Food Monitoring (new), Observation
--
-- Who can do what (the database enforces it, not just the website):
--   add      admins only (was: editors and admins). Moves and status
--            changes still add their own records whoever makes them: those
--            are added by the database itself (movement-records.sql,
--            monkey-archive.sql), not by the person
--   change   admins only: any record, Movement and Status records too
--   delete   admins only
-- (The normal team enters records through the Records page; admins keep
-- each monkey's full records on its Full Profile.)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs monkey-records.sql, movement-records.sql and monkey-archive.sql to
-- have been run (they have been).

begin;

-- Medical gets Food Monitoring (the older categories stay: records already
-- saved with them still show)
alter table public.monkey_records
    drop constraint monkey_records_category_check,
    add constraint monkey_records_category_check check (
        (section = 'rehabilitation' and category in ('movement', 'observation', 'escape', 'integration', 'status'))
        or (section = 'medical' and category in ('injury', 'medicine', 'treatment', 'vet_visit', 'observation', 'food_monitoring'))
    );

-- Adding: admins only
drop policy "Editors can add monkey records" on public.monkey_records;
create policy "Admins can add monkey records"
    on public.monkey_records for insert to authenticated
    with check ((select public.is_admin()) and logged_by = (select auth.uid()));

-- Changing and deleting: admins only (any record)
drop policy "Admins or the writer change records (not movements or statuses)" on public.monkey_records;
create policy "Admins change records"
    on public.monkey_records for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

drop policy "Admins, or the writer (not movements or statuses), delete records" on public.monkey_records;
create policy "Admins delete records"
    on public.monkey_records for delete to authenticated
    using ((select public.is_admin()));

commit;

-- Check: Food Monitoring is allowed now (should say "ready")
select case when pg_get_constraintdef(oid) like '%food_monitoring%' then 'ready' else 'not updated' end as food_monitoring
from pg_constraint
where conname = 'monkey_records_category_check';
