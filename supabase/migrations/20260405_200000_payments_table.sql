-- ── Fáze 1: Vytvoření tabulky payments ──────────────────────────────────────
-- Každý řádek = jedna fyzická platba.
-- Stav "zaplaceno" je odvozený: SUM(amount) vs. member_contributions.amount_total

CREATE TABLE IF NOT EXISTS app.payments (
    id          serial PRIMARY KEY,
    contrib_id  integer NOT NULL REFERENCES app.member_contributions(id),
    member_id   integer NOT NULL REFERENCES app.members(id),
    amount      integer NOT NULL,
    paid_at     date,
    note        text,
    created_by  text NOT NULL DEFAULT 'migration',
    created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_contrib_idx ON app.payments(contrib_id);
CREATE INDEX IF NOT EXISTS payments_member_idx  ON app.payments(member_id);

-- ── Seed: přenesl stávající platby z member_contributions ───────────────────
-- Každý řádek s paid_amount > 0 → jeden platební záznam

INSERT INTO app.payments (contrib_id, member_id, amount, paid_at, note, created_by)
SELECT
    mc.id          AS contrib_id,
    mc.member_id,
    mc.paid_amount AS amount,
    mc.paid_at,
    mc.note,
    'migration_2026'
FROM app.member_contributions mc
WHERE mc.paid_amount IS NOT NULL
  AND mc.paid_amount > 0;
