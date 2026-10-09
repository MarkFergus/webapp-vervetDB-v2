-- James B is known as Groomingdales (like Calypso's Corner at Engeltjie:
-- rename-calypso.sql). Renaming keeps its id, so links, QR codes and the
-- monkeys in it are unaffected.
begin;

update public.enclosures set name = 'Groomingdales' where name = 'James B' and type = 'introcage';

-- Check: renamed, still an introcage of James
select e.id, e.name, p.name as enclosure
from public.enclosures e join public.enclosures p on p.id = e.parent_id
where e.name = 'Groomingdales';

commit;
