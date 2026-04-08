-- ═══════════════════════════════════════════════════════════════════════════
-- Přejmenování importní tabulky: tj_members → import_members_tj
--
-- Konvence: importní tabulky mají prefix "import_" a suffix zdroje.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE app.tj_members RENAME TO import_members_tj_bohemians;
