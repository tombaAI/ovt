-- Alokace TJ transakcí na předpisy příspěvků členů
-- Umožňuje napárovat platbu z výsledovky TJ na konkrétní member_contributions

CREATE TABLE IF NOT EXISTS app.import_fin_tj_allocations (
    id                SERIAL PRIMARY KEY,
    tj_transaction_id INTEGER     NOT NULL REFERENCES app.import_fin_tj_transactions(id) ON DELETE CASCADE,
    contrib_id        INTEGER     NOT NULL REFERENCES app.member_contributions(id),
    member_id         INTEGER     NOT NULL REFERENCES app.members(id),
    amount            NUMERIC(12,2) NOT NULL,
    note              TEXT,
    created_by        TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_fin_tj_alloc_tx_idx     ON app.import_fin_tj_allocations(tj_transaction_id);
CREATE INDEX IF NOT EXISTS import_fin_tj_alloc_contrib_idx ON app.import_fin_tj_allocations(contrib_id);
