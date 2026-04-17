-- Finance TJ: cover záznamy importů a transakce z výsledovky TJ
-- Tabulka: import_fin_tj_imports  (cover záznam každého PDF importu)
-- Tabulka: import_fin_tj_transactions  (jednotlivé řádky výsledovky)

CREATE TABLE IF NOT EXISTS app.import_fin_tj_imports (
    id          SERIAL PRIMARY KEY,
    report_date DATE        NOT NULL,
    cost_center TEXT        NOT NULL DEFAULT '207',
    filter_from DATE,
    filter_to   DATE,
    filter_raw  TEXT,
    file_name   TEXT,
    imported_by TEXT        NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.import_fin_tj_transactions (
    id           SERIAL PRIMARY KEY,
    import_id    INTEGER     NOT NULL REFERENCES app.import_fin_tj_imports(id) ON DELETE CASCADE,
    doc_date     DATE        NOT NULL,
    doc_number   TEXT        NOT NULL,
    source_code  TEXT        NOT NULL,
    description  TEXT        NOT NULL,
    account_code TEXT        NOT NULL,
    account_name TEXT        NOT NULL,
    debit        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    credit       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    CONSTRAINT import_fin_tj_transactions_doc_number_key UNIQUE (doc_number)
);

CREATE INDEX IF NOT EXISTS import_fin_tj_tx_import_idx ON app.import_fin_tj_transactions(import_id);
CREATE INDEX IF NOT EXISTS import_fin_tj_tx_date_idx   ON app.import_fin_tj_transactions(doc_date);
