-- ═══════════════════════════════════════════════════════════════════════════════
-- Rozšíření tabulky members o osobní údaje ze zdroje vodní turistiky
--
-- Změny:
--   1. csk_number: integer → text  (čísla jako "001126" mají vedoucí nuly)
--   2. nickname: přezdívka člena (např. "Bob", "Pilín", "Claar")
--   3. birth_date: datum narození
--   4. birth_number: rodné číslo (text, formát "RRMMDD/XXXX")
--   5. gender: pohlaví ("Muž" / "Žena")
--   6. address: adresa bydliště (volný text)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Změna csk_number na text ───────────────────────────────────────────────
ALTER TABLE app.members
    ALTER COLUMN csk_number TYPE TEXT USING csk_number::TEXT;

-- ── 2. Nové sloupce ───────────────────────────────────────────────────────────
ALTER TABLE app.members
    ADD COLUMN nickname    TEXT,
    ADD COLUMN birth_date  DATE,
    ADD COLUMN birth_number TEXT,
    ADD COLUMN gender      TEXT,
    ADD COLUMN address     TEXT;
