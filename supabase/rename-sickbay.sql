-- The Sickbay Care Unit is known simply as Sickbay (it was named apart from
-- the Sickbay section, but "Sickbay" is what everyone calls the care unit).
-- Both the care unit and its one area (named the same, so it shows as the
-- unit) are renamed. Renaming keeps their ids, so links, QR codes and the
-- monkeys in it are unaffected.
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
begin;

update public.enclosures
set name = 'Sickbay'
where name = 'Sickbay Care Unit' and type in ('care_unit', 'area');

-- Check: the care unit and its area, both now "Sickbay" (2 rows)
select e.id, e.name, e.type, p.name as inside
from public.enclosures e left join public.enclosures p on p.id = e.parent_id
where e.name = 'Sickbay'
order by e.type;

commit;
