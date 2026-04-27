-- Přidání vazby import_fin_tj_allocations → payment_ledger
-- Umožňuje, aby párování TJ transakce bylo viditelné v přehledu příspěvků

ALTER TABLE app.import_fin_tj_allocations
    ADD COLUMN IF NOT EXISTS ledger_id INTEGER REFERENCES app.payment_ledger(id) ON DELETE SET NULL;
