-- Propadlá záloha per účastník
-- Umožňuje evidovat odhlášení konkrétního účastníka z aktivní přihlášky
-- a zachytit, co se stane s jeho podílem zálohy.

ALTER TABLE app.event_registration_participants
  ADD COLUMN cancelled_at               TIMESTAMPTZ,
  ADD COLUMN deposit_refund_amount      NUMERIC(10,2),
  ADD COLUMN deposit_forfeit_policy     TEXT
      CHECK (deposit_forfeit_policy IN ('forfeit_to_expense','forfeit_split','forfeit_to_club')),
  ADD COLUMN deposit_forfeit_expense_id INTEGER
      REFERENCES app.event_expenses(id) ON DELETE SET NULL;

CREATE INDEX event_reg_participants_cancelled_idx
  ON app.event_registration_participants(cancelled_at)
  WHERE cancelled_at IS NOT NULL;
