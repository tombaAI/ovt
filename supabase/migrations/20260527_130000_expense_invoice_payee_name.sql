ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS invoice_payee_name text;
