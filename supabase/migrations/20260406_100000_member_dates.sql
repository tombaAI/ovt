-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 3: Nahrazení membership_years za member_from / member_to na tabulce members
--
-- POZOR: Tuto migraci spusť PŘED nasazením kódu.
-- Po provedení migrace commitni a pushni kód → Vercel auto-deploy.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Přidat nové sloupce ────────────────────────────────────────────────────
ALTER TABLE app.members
    ADD COLUMN member_from    DATE,
    ADD COLUMN member_to      DATE,
    ADD COLUMN member_to_note TEXT;

-- ── 2. Skupina A: 46 aktivních členů (mají záznam v membership_years pro rok 2025) ──
-- Výchozí: člen od 1.1.2020, dosud aktivní (member_to = NULL)
UPDATE app.members
SET member_from = '2020-01-01'
WHERE id IN (
    SELECT DISTINCT member_id FROM app.membership_years WHERE year = 2025
);

-- Výjimka: Karolína Kotovská (id=160) — vstoupila 20.5.2023
UPDATE app.members SET member_from = '2023-05-20' WHERE id = 160;

-- ── 3. Skupina B: ukončení členové — data odvozená z Excelu ──────────────────

-- Nejdelší aktivní členové (2019–2024)
UPDATE app.members SET member_from = '2019-01-01', member_to = '2024-12-31' WHERE id = 125; -- Eva Davídková
UPDATE app.members SET member_from = '2019-01-01', member_to = '2023-12-31' WHERE id = 87;  -- Leonard Beitler

-- Ukončení 2022
UPDATE app.members SET member_from = '2019-01-01', member_to = '2022-12-31'
    WHERE id IN (103, 124, 50, 126); -- Jan Vašut, Anna Dostálová, Pavel Bastl, Matěj Fiala

-- Ukončení 2021
UPDATE app.members SET member_from = '2019-01-01', member_to = '2021-12-31'
    WHERE id IN (97, 64, 79); -- Pavel Machálek, Vilém Šrail, Kateřina Šedivá

-- Ukončení 2020
UPDATE app.members SET member_from = '2019-01-01', member_to = '2020-12-31'
    WHERE id IN (120, 114, 80); -- Adam Staněk, Jiří Keller, Oskar Šefců

-- Šimon Odstrčil: člen 2020–2022
UPDATE app.members SET member_from = '2020-01-01', member_to = '2022-12-31' WHERE id = 132;

-- Jakub Fiala: člen 2021–2022
UPDATE app.members SET member_from = '2021-01-01', member_to = '2022-12-31' WHERE id = 157;

-- Krátké členství (jen rok 2019)
UPDATE app.members SET member_from = '2019-01-01', member_to = '2019-12-31'
    WHERE id IN (65, 101, 139, 140, 68); -- Gabriela Vavřičková, Hana Bernardová, Michaela Kalátová Pelcová, Michal Pelc, Ondra Štangler

-- Lada Závišková: ukončila 12.3.2019
UPDATE app.members SET member_from = '2019-01-01', member_to = '2019-03-12' WHERE id = 51;

-- Soňa Pilátová: odhláška mailem Jakub 5.4.2019
UPDATE app.members
SET member_from = '2019-01-01', member_to = '2019-04-05',
    member_to_note = 'Odhláška mailem Jakub 5.4.2019'
WHERE id = 49;

-- Formální záznamy — datum od i do stejné (nikdy aktivně nečlenili po 2019)
UPDATE app.members SET member_from = '2019-01-01', member_to = '2019-01-01'
    WHERE id IN (142, 135, 95, 78, 81, 128, 70, 123);
    -- Lenka Švecová, Vadym Yaremachenko, Anna Voříšková, Hugo Marek,
    -- Jakub Janoušek, Marek Šefců, Matyáš Novotný, Ondřej Hátle

-- ── 4. Kontrola: nikdo nesmí mít NULL member_from ────────────────────────────
-- Spusť tento SELECT pro ověření — měl by vrátit 0 řádků:
-- SELECT id, full_name FROM app.members WHERE member_from IS NULL;

-- ── 5. Vynutit NOT NULL ───────────────────────────────────────────────────────
ALTER TABLE app.members ALTER COLUMN member_from SET NOT NULL;

-- ── 6. Smazat OVT Administrator (id=43) ──────────────────────────────────────
-- Má 5 příspěvkových záznamů, žádné platby, žádný audit log
DELETE FROM app.member_contributions WHERE member_id = 43;
DELETE FROM app.members WHERE id = 43;

-- ── 7. Zrušit tabulku membership_years ───────────────────────────────────────
DROP TABLE app.membership_years;
