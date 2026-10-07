-- Engeltjie 8 and 9 are known as Calypso's Corner A and B. Renaming keeps
-- their ids, so links, QR codes and the monkeys in them are unaffected.
begin;

update public.enclosures set name = 'Calypso''s Corner A' where name = 'Engeltjie 8' and type = 'introcage';
update public.enclosures set name = 'Calypso''s Corner B' where name = 'Engeltjie 9' and type = 'introcage';

-- Check: both renamed, still introcages of Engeltjie
select e.id, e.name, p.name as enclosure
from public.enclosures e join public.enclosures p on p.id = e.parent_id
where e.name like 'Calypso%';

commit;
