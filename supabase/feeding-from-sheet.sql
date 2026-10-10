-- One-off: the introcage monkeys' feeding, from the plates board's AM
-- Plates List (25 Sep 2026). Only what the sheet says; everyone else stays
-- Local Team, 1 plate, 1 bowl, nothing extra (the starting values).
-- Each change checks the monkey's id AND name, so nothing else is touched.
--
-- Not done here (see the notes from Claude): which of Prince/Princess,
-- Suzie/Squeezie, Amaya/Aarav and Leelo/Leila has 2 plates ("x3" on the
-- sheet), and monkeys not on the sheet (Niamh, Oisin, Jamba, Pantshula).
--
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- Needs feeding.sql to have been run first.

begin;

-- Fed by Sickbay
update public.monkeys set fed_by = 'sickbay'
where (id, name) in (
    (1155, 'Rocio'), (1154, 'Nita'),             -- Goliath B
    (1160, 'Armies'), (1161, 'Bainne'),          -- Royal A4
    (1149, 'BeeBee'), (1150, 'Bentley'),         -- Goliath F
    (1166, 'Hector'),                            -- Engeltjie 2
    (1143, 'Colin'), (1144, 'Murray'),           -- Lankora B
    (1184, 'Cuddy'), (1185, 'Floki'), (1186, 'Rexie')  -- Groomingdales
);

-- 2 plates
update public.monkeys set am_plates = 2
where (id, name) in (
    (1148, 'Elfie'),        -- "Elf x2" (D&D C)
    (1147, 'Nicholas'),     -- D&D A
    (1175, 'Jet'),          -- Camelot A
    (1192, 'Peanut'),       -- Robert D
    (522, 'Aroha'),         -- H&B C1
    (1183, 'Spiegel'),      -- Global F
    (1167, 'Shanti-Ray')    -- Calypso's Corner A
);

-- Cut small
update public.monkeys set am_cut_small = true
where (id, name) in (
    (1202, 'Kesie'),                                 -- Bachelor Block B
    (1162, 'Seuntjie'),                              -- Royal C
    (1175, 'Jet'),                                   -- Camelot A
    (1197, 'Amber'), (1198, 'Jasper'),               -- Skunkey A
    (1195, 'Jasmine'), (1196, 'Jezabel'),            -- Skunkey B1
    (1168, 'Shasta'), (1169, 'Bell'), (1170, 'Zach'), (1171, 'Toru'), (1172, 'Jay-Bee'),  -- Calypso's Corner B
    (1164, 'Leelo'), (1165, 'Leila')                 -- Engeltjie 1A
);

-- Cut small + fruit
update public.monkeys set am_cut_small = true, am_fruit = true
where (id, name) in ((1174, 'Mini'), (1173, 'Minkey'));  -- Camelot C and D

-- Metal plates ("QATO group", now Robert A group)
update public.monkeys set am_metal_plate = true
where (id, name) in (
    (1187, 'Glenn'), (1188, 'Lolo'), (1189, 'Brendakaye'), (1190, 'Jenny'), (1191, 'Katy')
);

commit;

-- Check: every introcage monkey's feeding
select e.name as introcage, m.name, m.fed_by, m.am_plates, m.am_cut_small, m.am_fruit, m.am_metal_plate
from public.monkeys m
join public.enclosures e on e.id = m.introcage_id and e.type = 'introcage'
order by e.name, m.name;
