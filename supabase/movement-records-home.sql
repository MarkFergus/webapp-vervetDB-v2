-- Movement records, part 2: a new home given in Edit while the monkey is
-- away (in Sickbay, or staying in an introcage) is recorded too:
--   "Home changed from Gismo Troop to Gismo A: integrated"
-- (it hasn't moved yet: its "Moved from Sickbay to Gismo A" record comes
-- when it returns). Replaces the rule from movement-records.sql; nothing
-- else changes.
--
-- Run once in Supabase, AFTER movement-records.sql: SQL Editor → New query
-- → paste all of this → Run. (Safe to run again.)

create or replace function private.record_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    -- where it is (Sickbay, the introcage it's staying in, or home)...
    was     text := private.place_text(old.in_sickbay, old.stay_introcage_id, old.introcage_id, old.troop_id);
    is_at   text := private.place_text(new.in_sickbay, new.stay_introcage_id, new.introcage_id, new.troop_id);
    -- ...and its home
    home_was text := private.place_text(false, null, old.introcage_id, old.troop_id);
    home_is  text := private.place_text(false, null, new.introcage_id, new.troop_id);
    words   text;
begin
    if was is distinct from is_at then
        words := 'Moved from ' || coalesce(was, 'unknown') || ' to ' || coalesce(is_at, 'unknown');
    elsif home_was is distinct from home_is then
        -- a new home while it's away (in Sickbay or staying in an
        -- introcage): it goes there when it returns
        words := 'Home changed from ' || coalesce(home_was, 'unknown') || ' to ' || coalesce(home_is, 'unknown');
    end if;
    if words is not null then
        if nullif(btrim(new.move_reason), '') is not null then
            words := words || ': ' || btrim(new.move_reason);
        end if;
        insert into public.monkey_records
            (monkey_id, section, record_date, category, details, logged_by, logged_by_name)
        values
            (new.id, 'rehabilitation', coalesce(new.moved_on, current_date), 'movement',
             btrim(left(words, 1000)), auth.uid(), public.my_name());
    end if;
    -- (passed through only: never kept on the monkey)
    new.moved_on := null;
    new.move_reason := null;
    return new;
end;
$$;

-- Check: this should say "Home changed" (the new rule is in place)
select case when prosrc like '%Home changed%' then 'Home changed: in place' else 'Not updated' end as check
from pg_proc where proname = 'record_move';
