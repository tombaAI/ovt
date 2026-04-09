-- Platby z banky (Fio) — staging tabulka pro synchronizaci
CREATE TABLE app.bank_transactions (
    id                   SERIAL PRIMARY KEY,
    fio_id               BIGINT NOT NULL UNIQUE,         -- interní ID pohybu ve Fio (deduplikační klíč)
    date                 DATE NOT NULL,
    amount               INTEGER NOT NULL,               -- celé Kč, záporné = odchozí platba
    currency             TEXT NOT NULL DEFAULT 'CZK',
    variable_symbol      TEXT,
    constant_symbol      TEXT,
    specific_symbol      TEXT,
    counterparty_account TEXT,                           -- číslo protiúčtu
    counterparty_name    TEXT,                           -- název protiúčtu
    message              TEXT,                           -- zpráva pro příjemce (column18)
    user_identification  TEXT,                           -- uživatelská identifikace (column7)
    type                 TEXT,                           -- typ pohybu (Přijatá platba, Odchozí platba, ...)
    comment              TEXT,                           -- komentář (column25)
    raw_data             JSONB NOT NULL DEFAULT '{}',    -- surová data z Fio API
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX bank_transactions_date_idx ON app.bank_transactions (date DESC);
CREATE INDEX bank_transactions_vs_idx   ON app.bank_transactions (variable_symbol);
