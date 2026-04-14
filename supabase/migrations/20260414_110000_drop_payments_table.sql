-- Čistící migrace: odstraní dočasný sloupec a starý payments table.
--
-- SPUSTIT AŽ POTÉ, co:
--  1. Migrace 20260414_100000 proběhla úspěšně
--  2. Ověřili jste, že v /dashboard/contributions se zobrazují platby správně
--  3. Produkce běží na kódu, který čte z payment_ledger (ne z payments)

BEGIN;

-- Odstraní dočasný migrační sloupec
ALTER TABLE app.payment_ledger DROP COLUMN IF EXISTS legacy_payment_id;

-- Odstraní starý platební stůl (data jsou v payment_ledger + payment_allocations)
DROP TABLE IF EXISTS app.payments;

COMMIT;
