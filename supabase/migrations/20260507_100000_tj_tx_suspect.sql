-- Přidá příznak "podezřelá transakce" na import_fin_tj_transactions.
-- Transakce je označena jako podezřelá, pokud při novém importu PDF za stejné
-- období (filterFrom–filterTo) chybí ve zdrojovém souboru (účetní ji odebral).
ALTER TABLE app.import_fin_tj_transactions
    ADD COLUMN IF NOT EXISTS is_suspect boolean NOT NULL DEFAULT false;
