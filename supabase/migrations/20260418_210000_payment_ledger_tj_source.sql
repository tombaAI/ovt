-- Rozšíření check constraintu payment_ledger.source_type o 'tj_finance'
-- Potřebné pro párování TJ transakcí s předpisy příspěvků

ALTER TABLE app.payment_ledger
    DROP CONSTRAINT IF EXISTS payment_ledger_source_type_check;

ALTER TABLE app.payment_ledger
    ADD CONSTRAINT payment_ledger_source_type_check
    CHECK (source_type IN ('fio_bank', 'file_import', 'cash', 'tj_finance'));
