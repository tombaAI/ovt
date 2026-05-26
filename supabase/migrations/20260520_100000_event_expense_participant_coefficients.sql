ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS participant_coefficients jsonb;

ALTER TABLE app.event_expenses
    DROP CONSTRAINT IF EXISTS event_expenses_allocation_method_check;

ALTER TABLE app.event_expenses
    ADD CONSTRAINT event_expenses_allocation_method_check
    CHECK (allocation_method IN ('split_all', 'per_registration', 'with_coefficients'));
