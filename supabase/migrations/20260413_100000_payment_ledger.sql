-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa A: Platební ledger a rekonciliace
-- Verze: 2026-04-13 (v1.1 – NUMERIC amounts, fio_bank_transactions rename)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Přejmenování tabulky bank_transactions → fio_bank_transactions
--    Tabulka byla původně Fio-specifická; název to nyní odráží.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.bank_transactions RENAME TO fio_bank_transactions;

-- Přejmenuj i indexy pro konzistenci
ALTER INDEX app.bank_transactions_date_idx RENAME TO fio_bank_transactions_date_idx;
ALTER INDEX app.bank_transactions_vs_idx   RENAME TO fio_bank_transactions_vs_idx;

-- Změň typ amount na NUMERIC(10,2) — Fio vrací celé Kč, ale systém musí obecně
-- podporovat 2 desetinná místa (Air Bank: "217,23" Kč).
ALTER TABLE app.fio_bank_transactions
    ALTER COLUMN amount TYPE NUMERIC(10,2) USING amount::NUMERIC(10,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rozšíření import_profiles o typ profilu a konfiguraci parseru
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.import_profiles
    ADD COLUMN profile_type TEXT NOT NULL DEFAULT 'member',
    ADD COLUMN config       JSONB NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rozšíření import_history o typ importu
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.import_history
    ADD COLUMN import_type TEXT NOT NULL DEFAULT 'member';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Staging tabulka pro file-based bankovní importy (Air Bank, další banky…)
--    Idempotentní přes (profile_id, external_key).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE app.bank_import_transactions (
    id                   SERIAL PRIMARY KEY,
    import_run_id        INTEGER REFERENCES app.import_history(id) ON DELETE SET NULL,
    profile_id           INTEGER REFERENCES app.import_profiles(id) ON DELETE SET NULL,
    external_key         TEXT NOT NULL,
    paid_at              DATE,
    amount               NUMERIC(10,2),            -- Kč na 2 desetinná místa, kladné = příchozí
    currency             TEXT NOT NULL DEFAULT 'CZK',
    variable_symbol      TEXT,
    counterparty_account TEXT,
    counterparty_name    TEXT,
    message              TEXT,
    raw_data             JSONB NOT NULL DEFAULT '{}',
    ledger_id            INTEGER,                  -- FK na payment_ledger — viz níže
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX bank_import_tx_key_idx
    ON app.bank_import_transactions (profile_id, external_key);

CREATE INDEX bank_import_tx_run_idx
    ON app.bank_import_transactions (import_run_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Jednotný platební ledger
--    source_type:
--      'fio_bank'    → fio_bank_transactions.id via fio_bank_tx_id
--      'file_import' → bank_import_transactions.id via bank_import_tx_id
--      'cash'        → bez staging záznamu
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE app.payment_ledger (
    id                      SERIAL PRIMARY KEY,

    source_type             TEXT NOT NULL
                            CHECK (source_type IN ('fio_bank', 'file_import', 'cash')),

    fio_bank_tx_id          INTEGER UNIQUE REFERENCES app.fio_bank_transactions(id),
    bank_import_tx_id       INTEGER UNIQUE REFERENCES app.bank_import_transactions(id),
    import_run_id           INTEGER REFERENCES app.import_history(id) ON DELETE SET NULL,

    paid_at                 DATE NOT NULL,
    amount                  NUMERIC(10,2) NOT NULL, -- Kč na 2 desetinná místa, vždy kladné
    currency                TEXT NOT NULL DEFAULT 'CZK',
    variable_symbol         TEXT,
    counterparty_account    TEXT,
    counterparty_name       TEXT,
    message                 TEXT,
    note                    TEXT,

    reconciliation_status   TEXT NOT NULL DEFAULT 'unmatched'
                            CHECK (reconciliation_status IN ('unmatched', 'suggested', 'confirmed', 'ignored')),

    created_by              TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_ledger_paid_at_idx ON app.payment_ledger (paid_at DESC);
CREATE INDEX payment_ledger_vs_idx      ON app.payment_ledger (variable_symbol);
CREATE INDEX payment_ledger_status_idx  ON app.payment_ledger (reconciliation_status);
CREATE INDEX payment_ledger_source_idx  ON app.payment_ledger (source_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. FK z bank_import_transactions na payment_ledger (zpětná vazba)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.bank_import_transactions
    ADD CONSTRAINT bank_import_tx_ledger_fk
    FOREIGN KEY (ledger_id) REFERENCES app.payment_ledger(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Alokační tabulka — nahrazuje starou tabulku payments
--    Jeden ledger záznam → 0..N alokačních řádků (split = více řádků).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE app.payment_allocations (
    id              SERIAL PRIMARY KEY,
    ledger_id       INTEGER NOT NULL REFERENCES app.payment_ledger(id),
    contrib_id      INTEGER NOT NULL REFERENCES app.member_contributions(id),
    member_id       INTEGER NOT NULL REFERENCES app.members(id),
    amount          NUMERIC(10,2) NOT NULL,         -- alokovaná částka (část splitu)
    note            TEXT,
    is_suggested    BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by    TEXT,
    confirmed_at    TIMESTAMPTZ,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_allocations_ledger_idx  ON app.payment_allocations (ledger_id);
CREATE INDEX payment_allocations_contrib_idx ON app.payment_allocations (contrib_id);
CREATE INDEX payment_allocations_member_idx  ON app.payment_allocations (member_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Air Bank referenční profil (seed)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO app.import_profiles (
    name, note, profile_type, file_format, delimiter, encoding, header_row_index,
    match_keys, mappings, config, created_by
) VALUES (
    'Air Bank (příchozí platby)',
    'Import příchozích plateb z CSV exportu Air Bank. Filtruje pouze Příchozí úhrady. Referenční číslo slouží jako unikátní klíč.',
    'bank',
    'csv',
    ';',
    'utf-8',
    0,
    '[{"sourceCol": "Referenční číslo", "targetField": "external_key"}]',
    '[
      {"sourceCol": "Datum provedení",          "targetField": "paid_at"},
      {"sourceCol": "Částka v měně účtu",       "targetField": "amount"},
      {"sourceCol": "Variabilní symbol",         "targetField": "variable_symbol"},
      {"sourceCol": "Název protistrany",         "targetField": "counterparty_name"},
      {"sourceCol": "Číslo účtu protistrany",   "targetField": "counterparty_account"},
      {"sourceCol": "Zpráva pro příjemce",       "targetField": "message"}
    ]',
    '{"filterColumn": "Směr úhrady", "filterValue": "Příchozí", "dateFormat": "dd/MM/yyyy", "amountDecimalSeparator": ","}',
    'system'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Backfill: existující Fio transakce → payment_ledger jako 'unmatched'
--    Pouze příchozí platby (amount > 0). Idempotentní přes fio_bank_tx_id UNIQUE.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO app.payment_ledger (
    source_type, fio_bank_tx_id,
    paid_at, amount, currency,
    variable_symbol, counterparty_account, counterparty_name, message,
    reconciliation_status, created_by, created_at, updated_at
)
SELECT
    'fio_bank',
    id,
    date,
    amount,
    currency,
    variable_symbol,
    counterparty_account,
    counterparty_name,
    message,
    'unmatched',
    'migration',
    NOW(),
    NOW()
FROM app.fio_bank_transactions
WHERE amount > 0
ON CONFLICT (fio_bank_tx_id) DO NOTHING;
