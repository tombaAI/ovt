-- Import lodí z Excelu OVT Krakorce.xlsx (Seznam_lodi_2021)
-- Majitelé jsou dohledáváni přes full_name / last_name ILIKE v tabulce app.members.
-- Zkontroluj výsledek: SELECT b.id, m.full_name, b.description, b.grid, b.position
--                      FROM app.boats b LEFT JOIN app.members m ON b.owner_id = m.id
--                      ORDER BY b.grid, b.position;
-- Záznamy s 'excel: XY' v poznámce použily přezdívku / zkrácené jméno — ověř shodu.

BEGIN;

INSERT INTO app.boats
    (owner_id, description, color, grid, position, is_present, note, created_by)
VALUES
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jiří Keller%' LIMIT 1), 'šedá až do stropu (Vaňha)', 'šedá', '1', 11, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Vít Skála%' LIMIT 1), 'tmavě zelená (Vaňha)', 'tmavě zelená', '1', 12, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Měrková%' LIMIT 1), 'modrá Dagger M8.0', 'modrá', '1', 13, true, 'excel: Katka Měrková', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Kostková%' LIMIT 1), 'Exo kajak XT260', 'červená', '1', 14, false, 'excel: Bára Kostková', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Čermáková%' LIMIT 1), 'modrá Vaňha až do stropu', 'modrá', '1', 15, true, 'excel: Zuzka Čermáková', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Chvojková%' LIMIT 1), 'Necky modro-zelená Gliss 7.11', 'modro-zelená', '1', 16, true, 'excel: Kája Chvojková', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Chvojková%' LIMIT 1), 'Necky modro-zelená Bliss 8.0', 'modro-zelená', '1', 17, true, 'excel: Kája Chvojková', 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Štěpán Klepač%' LIMIT 1), 'Wigo singl', 'modrá', '1', 21, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Klepačová%' LIMIT 1), 'Big Dog 7.3 Flux červená', 'červená', '1', 22, true, 'excel: Katka Klepačová', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Ptáček%' LIMIT 1), 'Dagger GTX 8.1 žluto-červená fleky', 'žluto-červená', '1', 23, true, 'excel: Mirek Ptáček', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Kostková%' LIMIT 1), 'Prion, velmi dlouhá', 'fialová', NULL, NULL, false, 'JE Báry Kostkové, nechce ji, nabídnout TOM, excel: Bára kostková', 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jakub Chochola%' LIMIT 1), 'Blitz červeno-černo-žlutá', 'červeno-černo-žlutá', '2', 31, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Adam Chochola%' LIMIT 1), 'červeno-oranžovo-zelená Redline Dagger (android)', 'červeno-oranžovo-zelená', '2', 32, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Roman Liška%' LIMIT 1), 'Exo singl, nápis Demon, žluté singl pádlo', 'žlutá', NULL, NULL, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Pavel Machálek%' LIMIT 1), 'špunt žluto-oranžová', 'žluto-oranžová', '2', 35, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE nickname ILIKE '%Bundáš%' OR (last_name ILIKE '%Bauer%' AND first_name ILIKE '%Tomáš%') LIMIT 1), 'Waka Tuna 2, kajak', 'zelená', '2', 38, true, 'excel: Bundáš', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Elis%' LIMIT 1), 'Pyranha světle zelená ?', 'zelená', '2', 41, false, 'excel: Zděněk Elis', 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Roman Liška%' LIMIT 1), 'Wave sport kajak', 'bílo-zeleno-černá', NULL, NULL, false, 'Davidova loď', 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jan Vais%' LIMIT 1), 'Wave sport Diesel D75 červeno-žlutý', 'červeno-žlutý', '2', 43, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Aleš Němec%' LIMIT 1), 'Zet Five', 'Žlutá', '2', 46, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Aleš Němec%' LIMIT 1), 'Riot flair', 'Žlutá', '2', 47, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Michal Menčík%' LIMIT 1), 'žluto-oranžová Wave sport project X56', 'žluto-oranžová', '3', 52, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Eva Matějková%' LIMIT 1), 'Raptor světle zelený', 'světle zelený', '3', 54, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Marek Veselý%' LIMIT 1), 'červená diesel 60', 'červená', '3', 58, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Martin Kříž%' LIMIT 1), 'Neznčkový kajak', 'Modrá', '3', 61, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Martin Kříž%' LIMIT 1), 'Liquidlogic, nálepka sale/prodám kajak.cz, lebka a hnáty', 'černá', '3', 62, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jan Kukla%' LIMIT 1), 'hnědá Samba (Ropucha IV.)', 'hnědá', 'dlouhé', NULL, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jáchym Kopřiva%' LIMIT 1), 'laminátka zelená, žlutý límec', 'zelená', 'dlouhé', NULL, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Vodička%' AND first_name ILIKE '%Jiří%' LIMIT 1), 'amerika tmavě modrá kevlar', 'modrá', 'dlouhé', NULL, true, 'excel: Karas Jiří Vodička', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Elis%' LIMIT 1), 'rychlostní kajak Nelo světle modrý', 'modrá', 'dlouhé', NULL, false, 'Zdeněk Elis? podle rychlostního kajaku, excel: Zděněk Elis', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Kovářová%' LIMIT 1), 'kajak kevlar červený, Esprit', 'červená', 'dlouhé', NULL, false, 'excel: Evka Kovářová', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Vodička%' AND first_name ILIKE '%Jiří%' LIMIT 1), 'amerika laminátová, cihlově červená', 'červená', 'dlouhé', NULL, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Elis%' LIMIT 1), 'rychlostní kajak Cleaver béžovo-oranžový', 'béžovo-oranžová', 'dlouhé', NULL, true, 'excel: Zděněk Elis', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Šálek%' AND first_name ILIKE '%Pavel%' LIMIT 1), 'Bert kajak invalida', 'modrá', 'dlouhé', NULL, true, 'excel: Ešus Pavel Šálek', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Machálek%' AND first_name NOT ILIKE '%Pavel%' LIMIT 1), 'modrá Cascada Dagger', 'modrá', 'dlouhé', NULL, true, 'excel: Vašek Machálek', 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jakub Chochola%' LIMIT 1), 'amerika modrá laminát, číslovka 53', 'modrá', 'dlouhé', NULL, true, NULL, 'import'),
    (NULL, 'amerika modrá víc poškrábaná', 'modrá', 'dlouhé', NULL, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Jan Kukla%' LIMIT 1), 'amerika modrá míň poškrábaná (Troja 2014, 2016)', 'modrá', 'dlouhé', NULL, true, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Šálek%' AND first_name ILIKE '%Pavel%' LIMIT 1), NULL, NULL, NULL, NULL, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Vodička%' AND first_name ILIKE '%Jiří%' LIMIT 1), NULL, NULL, NULL, NULL, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Vodička%' AND first_name ILIKE '%Jiří%' LIMIT 1), NULL, NULL, NULL, NULL, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Bernardová%' LIMIT 1), NULL, NULL, NULL, NULL, false, 'excel: Bára Bernardová', 'import'),
    ((SELECT id FROM app.members WHERE full_name ILIKE '%Štěpán Klepač%' LIMIT 1), NULL, NULL, NULL, NULL, false, NULL, 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Švecová%' LIMIT 1), NULL, NULL, NULL, NULL, false, 'excel: Lenka Švecová', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Pelc%' LIMIT 1), NULL, NULL, NULL, NULL, false, 'excel: Michal Pelc', 'import'),
    ((SELECT id FROM app.members WHERE last_name ILIKE '%Havlíček%' LIMIT 1), 'dlouhá tyrkysová pyranha s takovejma odstínama zelený a fialový,', 'zeleno-fialová', NULL, NULL, false, 'mail 14.2.2020, že tam loď má, excel: Filip Havlíček', 'import');

-- Celkem importováno: 46 lodí

COMMIT;
