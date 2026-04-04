-- =============================================================
-- OVT: Members domain schema
-- Apply via Neon SQL Editor
-- =============================================================

-- Members (stable identity, latest known data)
CREATE TABLE IF NOT EXISTS app.members (
    id                INTEGER PRIMARY KEY,          -- from Excel ID
    user_login        TEXT,
    email             TEXT,
    phone             TEXT,
    full_name         TEXT NOT NULL,
    variable_symbol   INTEGER,
    csk_number        INTEGER,
    is_active         BOOLEAN NOT NULL DEFAULT true, -- clen_ovt=Ano
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contribution periods (one row per year with all settings)
CREATE TABLE IF NOT EXISTS app.contribution_periods (
    id                SERIAL PRIMARY KEY,
    year              SMALLINT NOT NULL UNIQUE,
    amount_base       INTEGER NOT NULL,
    amount_boat1      INTEGER NOT NULL DEFAULT 0,
    amount_boat2      INTEGER NOT NULL DEFAULT 0,
    amount_boat3      INTEGER NOT NULL DEFAULT 0,
    discount_committee INTEGER NOT NULL DEFAULT 0,   -- výbor (absolute value, subtracted)
    discount_tom      INTEGER NOT NULL DEFAULT 0,    -- TOM (absolute value, subtracted)
    brigade_surcharge INTEGER NOT NULL DEFAULT 0,    -- n_brigada (added when positive)
    due_date          DATE,
    bank_account      TEXT NOT NULL DEFAULT '2701772934/2010',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-member per-year contribution record
CREATE TABLE IF NOT EXISTS app.member_contributions (
    id                  SERIAL PRIMARY KEY,
    member_id           INTEGER NOT NULL REFERENCES app.members(id),
    period_id           INTEGER NOT NULL REFERENCES app.contribution_periods(id),
    amount_total        INTEGER,                     -- expected total (2025_Prispevky col)
    amount_base         INTEGER,
    amount_boat1        INTEGER,
    amount_boat2        INTEGER,
    amount_boat3        INTEGER,
    discount_committee  INTEGER,                     -- s_vybor (negative = discount)
    discount_tom        INTEGER,                     -- s_tom (negative = discount)
    discount_individual INTEGER,                     -- s_individualni (negative = discount)
    brigade_surcharge   INTEGER,                     -- n_brigada (positive = surcharge)
    paid_amount         INTEGER,                     -- kolik
    paid_at             DATE,                        -- kdy
    is_paid             BOOLEAN,                     -- Zaplaceno
    note                TEXT,
    UNIQUE (member_id, period_id)
);

CREATE INDEX IF NOT EXISTS member_contributions_member_idx ON app.member_contributions(member_id);
CREATE INDEX IF NOT EXISTS member_contributions_period_idx ON app.member_contributions(period_id);
