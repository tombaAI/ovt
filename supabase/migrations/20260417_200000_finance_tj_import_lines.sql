-- Import log s rekonciliací: jeden řádek per transakce per import
-- status: added = přidáno do master listu, matched = nalezeno a shoduje se, conflict = liší se

CREATE TABLE IF NOT EXISTS app.import_fin_tj_import_lines (
    id              SERIAL PRIMARY KEY,
    import_id       INTEGER     NOT NULL REFERENCES app.import_fin_tj_imports(id) ON DELETE CASCADE,
    transaction_id  INTEGER     REFERENCES app.import_fin_tj_transactions(id) ON DELETE SET NULL,
    doc_number      TEXT        NOT NULL,
    status          TEXT        NOT NULL CHECK (status IN ('added','matched','conflict')),
    conflict_fields JSONB       NOT NULL DEFAULT '[]',
    doc_date        DATE        NOT NULL,
    source_code     TEXT        NOT NULL,
    description     TEXT        NOT NULL,
    account_code    TEXT        NOT NULL,
    account_name    TEXT        NOT NULL,
    debit           NUMERIC(12,2) NOT NULL DEFAULT 0,
    credit          NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS import_fin_tj_lines_import_idx ON app.import_fin_tj_import_lines(import_id);
CREATE INDEX IF NOT EXISTS import_fin_tj_lines_tx_idx     ON app.import_fin_tj_import_lines(transaction_id);

-- Retroaktivně vytvoř záznamy 'added' pro stávající transakce (importy před zavedením logu)
INSERT INTO app.import_fin_tj_import_lines
    (import_id, transaction_id, doc_number, status, conflict_fields,
     doc_date, source_code, description, account_code, account_name, debit, credit)
SELECT
    import_id, id, doc_number, 'added', '[]',
    doc_date, source_code, description, account_code, account_name, debit, credit
FROM app.import_fin_tj_transactions
ON CONFLICT DO NOTHING;
