-- Marking an injury healed on a chosen date (2026-11-05): a monitoring session
-- entered late can say the day it really healed. The usual Healed? stays as it
-- is, on today's date.
--   set_injury_healed(injury_id, healed, on_date)   the date's kept between
--   the day of the injury and today
-- Safe to run more than once.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (If asked about RLS, choose the option that runs WITHOUT adding RLS.)
-- Needs injuries.sql first (it has been).

begin;

create or replace function public.set_injury_healed(injury_id bigint, healed boolean, on_date date)
returns setof public.injuries
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_editor() then
        raise exception 'Only editors and admins can mark injuries healed.';
    end if;
    return query
        update public.injuries i
        set healed_on = case when healed then greatest(least(on_date, current_date), i.injury_date) end,
            healed_by = case when healed then auth.uid() end,
            healed_by_name = case when healed then public.my_name() end
        where i.id = injury_id
        returning i.*;
end;
$$;
revoke execute on function public.set_injury_healed(bigint, boolean, date) from public, anon;
grant execute on function public.set_injury_healed(bigint, boolean, date) to authenticated;

commit;

-- Check: should say ready
select 'ready' as injury_healed_date;
