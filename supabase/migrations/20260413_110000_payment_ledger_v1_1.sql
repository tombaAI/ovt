-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa A v1.1 — diff od migrace 20260413_100000
-- Změny: fio_bank rename, NUMERIC(10,2) amounts
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Přejmenování bank_transactions → fio_bank_transactions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.bank_transactions RENAME TO fio_bank_transactions;

ALTER INDEX app.bank_transactions_date_idx RENAME TO fio_bank_transactions_date_idx;
ALTER INDEX app.bank_transactions_vs_idx   RENAME TO fio_bank_transactions_vs_idx;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Typy amount: INTEGER → NUMERIC(10,2)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.fio_bank_transactions
    ALTER COLUMN amount TYPE NUMERIC(10,2) USING amount::NUMERIC(10,2);

ALTER TABLE app.bank_import_transactions
    ALTER COLUMN amount TYPE NUMERIC(10,2) USING amount::NUMERIC(10,2);

ALTER TABLE app.payment_ledger
    ALTER COLUMN amount TYPE NUMERIC(10,2) USING amount::NUMERIC(10,2);

ALTER TABLE app.payment_allocations
    ALTER COLUMN amount TYPE NUMERIC(10,2) USING amount::NUMERIC(10,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Přejmenování payment_ledger.bank_tx_id → fio_bank_tx_id
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.payment_ledger RENAME COLUMN bank_tx_id TO fio_bank_tx_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Aktualizace CHECK constraint source_type: 'fio' → 'fio_bank'
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.payment_ledger
    DROP CONSTRAINT IF EXISTS payment_ledger_source_type_check;

ALTER TABLE app.payment_ledger
    ADD CONSTRAINT payment_ledger_source_type_check
    CHECK (source_type IN ('fio_bank', 'file_import', 'cash'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Aktualizace existujících dat v payment_ledger: 'fio' → 'fio_bank'
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE app.payment_ledger
SET source_type = 'fio_bank'
WHERE source_type = 'fio';
