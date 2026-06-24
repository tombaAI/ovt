ALTER TABLE app.event_payment_prescriptions
  ADD COLUMN deposit_wont_pay      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN deposit_wont_pay_note TEXT,
  ADD COLUMN deposit_wont_pay_by   TEXT,
  ADD COLUMN deposit_wont_pay_at   TIMESTAMPTZ;
