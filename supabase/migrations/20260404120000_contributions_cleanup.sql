-- =============================================================
-- Cleanup: smazání neplatných 2026 contribution records,
-- přidání is_draft na contribution_periods,
-- opravy 2025 dat
-- =============================================================

-- 1. Přidej is_draft na contribution_periods
ALTER TABLE app.contribution_periods
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

-- 2. Označ 2026 jako návrh
UPDATE app.contribution_periods SET is_draft = true WHERE year = 2026;

-- 3. Smaž neplatné 2026 contribution records
--    (obsahují zduplikovaná 2025 data + návrh cen, nejsou reálné)
DELETE FROM app.member_contributions
WHERE period_id = (SELECT id FROM app.contribution_periods WHERE year = 2026);

-- =============================================================
-- Opravy 2025 dat (6 členů s problémem)
-- =============================================================

-- Jan Kukla (ID=83): zaplatil hotově na VH, záznam v Excelu nečitelný
-- Předpokládám plnou platbu 2300 Kč — potvrď nebo uprav ručně
UPDATE app.member_contributions SET
    is_paid    = true,
    paid_amount = 2300,
    note       = 'Zaplaceno hotově na VH 26 (opraveno při importu)'
WHERE member_id = 83
  AND period_id = (SELECT id FROM app.contribution_periods WHERE year = 2025)
  AND is_paid IS NOT true;

-- Marek Veselý (ID=121): kolik="za Doubrava 2k prý" → 2000 Kč zaplaceno?
-- Ponechán jako NEZAPLACENO — uprav ručně po ověření
-- UPDATE app.member_contributions SET paid_amount = 2000, ...
-- WHERE member_id = 121 AND period_id = (SELECT id ... WHERE year = 2025);

-- Milan Hrabák (ID=55): nezaplaceno — žádná změna, stav je správný

-- Jiří Vodička (ID=98): zaplatil 1500, expected 1400 → přeplatek 100 Kč
-- is_paid=true je správně, paid_amount=1500 správně — žádná změna

-- Roman Liška (ID=46): zaplatil 1000, expected 1800 → nedoplatek 800 Kč
-- is_paid=true je správně?, paid_amount=1000 správně — žádná změna

-- Štěpán Hořejší (ID=75): zaplatil 1800, expected 1300 → přeplatek 500 Kč
-- is_paid=true je správně, paid_amount=1800 správně — žádná změna
