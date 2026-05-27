ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS invoice_payment_sent_at timestamptz;
