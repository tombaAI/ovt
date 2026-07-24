-- Hospodářské potvrzení neshody zjištěné vs. zapsané částky (typicky jiná měna dokladu —
-- např. faktura v EUR, zaplaceno v CZK — nikdy nepůjde "opravit" na shodu).
-- Snapshot dvojice (amount, analyzedAmount) v okamžiku potvrzení; jakákoli změna dvojice
-- potvrzení automaticky zneplatní (viz src/lib/expense-mismatch.ts).

ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS mismatch_acknowledged_amount numeric(10,2),
    ADD COLUMN IF NOT EXISTS mismatch_acknowledged_analyzed_amount numeric(10,2),
    ADD COLUMN IF NOT EXISTS mismatch_acknowledged_by text,
    ADD COLUMN IF NOT EXISTS mismatch_acknowledged_at timestamptz;
