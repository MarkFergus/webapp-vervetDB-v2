-- Staff Activity's numbers (Admin Dashboard, admins only): how much one person
-- (or everyone) has done in a period. Just counts of what's on record: no
-- rankings. Anything since deleted isn't counted, and entries are counted by
-- whoever is on the record as adding them.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Running it twice does no harm. It changes no records.

create or replace function public.staff_stats(person uuid default null, since timestamptz default '2020-01-01', until timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    -- (admins only: anyone else gets nothing)
    if not public.is_admin() then
        return null;
    end if;

    return jsonb_build_object(
        'injuries', (select count(*) from public.injuries x
            where x.logged_at >= since and x.logged_at < until and (person is null or x.logged_by = person)),
        'conditions', (select count(*) from public.monkey_conditions x
            where x.logged_at >= since and x.logged_at < until and (person is null or x.logged_by = person)),
        'photos', (select count(*) from storage.objects o
            where o.bucket_id = 'monkey-photos' and o.name not like 'thumbs/%' and o.owner_id is not null
              and o.created_at >= since and o.created_at < until and (person is null or o.owner_id = person::text)),
        'edits', (select count(*) from private.monkey_changes c
            where c.action = 'changed' and c.changed_at >= since and c.changed_at < until and (person is null or c.changed_by = person))
    );
end;
$$;

revoke all on function public.staff_stats(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_stats(uuid, timestamptz, timestamptz) to authenticated;

-- Check: should say ready
select case when exists (select 1 from pg_proc where proname = 'staff_stats') then 'ready' else 'not updated' end as staff_stats;
