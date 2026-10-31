-- Monitoring sessions: the new check words, a short note on each check,
-- the Introcages and Perimeter checks, and Maintenance notes.
--   Fence   Good / Low / Not Working   (as before)
--   Waters  Good / Low / Bad           (was OK / Not OK: OK → Good, Not OK → Bad)
--   Food    Good / Low / Too Much      (was Good / High / Low: High → Too Much)
--   a note on each (50 characters at most), Introcages Check and
--   Perimeter Check (ticks), and Maintenance (fence breaks, branches cut…)
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs monitoring-sessions.sql to have been run (it has been).

begin;

------------------------------------------------------------------------
-- The new words (the sessions so far changed to match)
------------------------------------------------------------------------
alter table public.monitoring_sessions drop constraint monitoring_sessions_waters_check;
alter table public.monitoring_sessions drop constraint monitoring_sessions_food_check;

update public.monitoring_sessions set waters = case waters when 'ok' then 'good' when 'not_ok' then 'bad' else waters end
    where waters in ('ok', 'not_ok');
update public.monitoring_sessions set food = 'too_much' where food = 'high';

alter table public.monitoring_sessions
    add constraint monitoring_sessions_waters_check check (waters in ('good', 'low', 'bad')),
    add constraint monitoring_sessions_food_check check (food in ('good', 'low', 'too_much'));

------------------------------------------------------------------------
-- The new details
------------------------------------------------------------------------
alter table public.monitoring_sessions
    add column fence_note text
        check (fence_note is null or (fence_note = btrim(fence_note) and fence_note <> '' and char_length(fence_note) <= 50)),
    add column waters_note text
        check (waters_note is null or (waters_note = btrim(waters_note) and waters_note <> '' and char_length(waters_note) <= 50)),
    add column food_note text
        check (food_note is null or (food_note = btrim(food_note) and food_note <> '' and char_length(food_note) <= 50)),
    add column introcages_checked boolean not null default false,
    add column perimeter_checked boolean not null default false,
    add column maintenance text
        check (maintenance is null or (maintenance = btrim(maintenance) and maintenance <> '' and char_length(maintenance) <= 1000));

------------------------------------------------------------------------
-- Finish Session (and change a finished one): as before, with the new
-- details
------------------------------------------------------------------------
drop function public.finish_monitoring_session(bigint, date, text, text, text, text, text, bigint[], bigint[]);

create function public.finish_monitoring_session(
    session bigint,
    on_date date,
    food_used text,
    fence text,
    waters text,
    food text,
    notes text,
    seen bigint[],
    not_seen bigint[],
    fence_note text default null,
    waters_note text default null,
    food_note text default null,
    introcages_checked boolean default false,
    perimeter_checked boolean default false,
    maintenance text default null
)
returns setof public.monitoring_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
    starter uuid;
begin
    select s.started_by into starter from public.monitoring_sessions s where s.id = session;
    if not found then
        raise exception 'That monitoring session no longer exists.';
    end if;
    if not (public.is_admin() or (public.is_editor() and starter = (select auth.uid()))) then
        raise exception 'Only whoever started this session (or an admin) can finish or change it.'
            using errcode = '42501';
    end if;
    if on_date > (now() at time zone 'Africa/Johannesburg')::date then
        raise exception 'The date can''t be in the future.';
    end if;

    delete from public.monitoring_sightings ms where ms.session_id = session;
    insert into public.monitoring_sightings (session_id, monkey_id, seen)
        select session, m, true from unnest(coalesce(seen, '{}')) m
        union
        select session, m, false from unnest(coalesce(not_seen, '{}')) m
            where m <> all (coalesce(seen, '{}'));

    return query
        update public.monitoring_sessions s set
            session_date = on_date,
            food_used = nullif(finish_monitoring_session.food_used, ''),
            fence = finish_monitoring_session.fence,
            waters = finish_monitoring_session.waters,
            food = finish_monitoring_session.food,
            notes = nullif(btrim(finish_monitoring_session.notes), ''),
            fence_note = nullif(btrim(finish_monitoring_session.fence_note), ''),
            waters_note = nullif(btrim(finish_monitoring_session.waters_note), ''),
            food_note = nullif(btrim(finish_monitoring_session.food_note), ''),
            introcages_checked = coalesce(finish_monitoring_session.introcages_checked, false),
            perimeter_checked = coalesce(finish_monitoring_session.perimeter_checked, false),
            maintenance = nullif(btrim(finish_monitoring_session.maintenance), ''),
            status = 'finished',
            finished_at = coalesce(s.finished_at, now())
        where s.id = session
        returning s.*;
end;
$$;

revoke all on function public.finish_monitoring_session(bigint, date, text, text, text, text, text, bigint[], bigint[], text, text, text, boolean, boolean, text)
    from public, anon;
grant execute on function public.finish_monitoring_session(bigint, date, text, text, text, text, text, bigint[], bigint[], text, text, text, boolean, boolean, text)
    to authenticated;

commit;

-- Check: the sessions so far, by their new words
select waters, food, count(*) from public.monitoring_sessions group by waters, food;
