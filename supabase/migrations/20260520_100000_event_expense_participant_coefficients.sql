ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS participant_coefficients jsonb;
