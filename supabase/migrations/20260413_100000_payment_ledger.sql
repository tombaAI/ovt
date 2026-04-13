-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa A: Platební ledger a rekonciliace
-- Verze: 2026-04-13
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rozšíření import_profiles o typ profilu a konfiguraci parseru
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.import_profiles
    ADD COLUMN profile_type TEXT NOT NULL DEFAULT 'member',
    ADD COLUMN config       JSONB NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rozšíření import_history o typ importu
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.import_history
    ADD COLUMN import_type TEXT NOT NULL DEFAULT 'member';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Staging tabulka pro file-based bankovní importy (Air Bank, další banky…)
--    Idempotentní přes (profile_id, external_key).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE app.bank_import_transactions (
    id                   SERIAL PRIMARY KEY,
    import_run_id        INTEGER REFERENCES app.import_history(id) ON DELETE SET NULL,
    profile_id           INTEGER REFERENCES app.import_profiles(id) ON DELETE SET NULL,
    external_key         TEXT NOT NULL,
    paid_at              DATE,
    amount               INTEGER,                  -- celé Kč, vždy kladné pro příchozí platby
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
-- 4. Jednotný platební ledger
--    Kanonický zdroj pravdy pro všechny přijaté platby bez ohledu na kanál.
--    source_type:
--      'fio'         → bank_transactions.id via bank_tx_id
--      'file_import' → bank_import_transactions.id via bank_import_tx_id
--      'cash'        → bez staging záznamu
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE app.payment_ledger (
    id                      SERIAL PRIMARY KEY,

    -- Kanál původu platby
    source_type             TEXT NOT NULL
                            CHECK (source_type IN ('fio', 'file_import', 'cash')),

    -- FK zpět na staging tabulky (vždy max jeden nenull)
    bank_tx_id              INTEGER UNIQUE REFERENCES app.bank_transactions(id),
    bank_import_tx_id       INTEGER UNIQUE REFERENCES app.bank_import_transactions(id),
    import_run_id           INTEGER REFERENCES app.import_history(id) ON DELETE SET NULL,

    -- Platební data (denormalizace ze staging pro rychlý přístup)
    paid_at                 DATE NOT NULL,
    amount                  INTEGER NOT NULL,      -- celé Kč, vždy kladné
    currency                TEXT NOT NULL DEFAULT 'CZK',
    variable_symbol         TEXT,
    counterparty_account    TEXT,
    counterparty_name       TEXT,
    message                 TEXT,
    note                    TEXT,

    -- Rekonciliační stav
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
-- 5. FK z bank_import_transactions na payment_ledger (zpětná vazba)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.bank_import_transactions
    ADD CONSTRAINT bank_import_tx_ledger_fk
    FOREIGN KEY (ledger_id) REFERENCES app.payment_ledger(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Alokační tabulka — nahrazuje starou tabulku payments
--    Jeden ledger záznam → 0..N alokačních řádků (split = více řádků).
--    Součet amount při confirmed musí = payment_ledger.amount.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE app.payment_allocations (
    id              SERIAL PRIMARY KEY,
    ledger_id       INTEGER NOT NULL REFERENCES app.payment_ledger(id),
    contrib_id      INTEGER NOT NULL REFERENCES app.member_contributions(id),
    member_id       INTEGER NOT NULL REFERENCES app.members(id),
    amount          INTEGER NOT NULL,              -- alokovaná částka (může být část splitu)
    note            TEXT,
    is_suggested    BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = systémový návrh, čeká na potvrzení
    confirmed_by    TEXT,                           -- NULL = nepotvrzeno / suggested
    confirmed_at    TIMESTAMPTZ,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_allocations_ledger_idx  ON app.payment_allocations (ledger_id);
CREATE INDEX payment_allocations_contrib_idx ON app.payment_allocations (contrib_id);
CREATE INDEX payment_allocations_member_idx  ON app.payment_allocations (member_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Air Bank referenční profil (seed)
--    Mapování sloupců dle skutečného exportního formátu Air Bank (2026-04).
--    Config: filterColumn/filterValue pro výběr příchozích plateb,
--            dateFormat a amountDecimalSeparator pro konverzi hodnot.
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
-- 8. Backfill: existující Fio transakce → payment_ledger jako 'unmatched'
--    Pouze příchozí platby (amount > 0). Idempotentní přes bank_tx_id UNIQUE.
--    Auto-match proběhne při prvním spuštění sync nebo přes UI akci.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO app.payment_ledger (
    source_type, bank_tx_id,
    paid_at, amount, currency,
    variable_symbol, counterparty_account, counterparty_name, message,
    reconciliation_status, created_by, created_at, updated_at
)
SELECT
    'fio',
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
FROM app.bank_transactions
WHERE amount > 0
ON CONFLICT (bank_tx_id) DO NOTHING;
