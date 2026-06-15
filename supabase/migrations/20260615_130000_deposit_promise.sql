ALTER TABLE app.event_payment_prescriptions
  ADD COLUMN deposit_promise      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN deposit_promise_note TEXT,
  ADD COLUMN deposit_promise_by   TEXT,
  ADD COLUMN deposit_promise_at   TIMESTAMPTZ;
