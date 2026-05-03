-- Finanční vyúčtování akce
-- Migrace přidává:
--   1. subsidy_per_member na events
--   2. allocation_method na event_expenses
--   3. nová tabulka event_expense_allocations (rozdělení per přihláška)
--   4. payment_due na event_payment_prescriptions
--   5. member_id + person_id na event_registration_participants

ALTER TABLE app.events
    ADD COLUMN subsidy_per_member numeric(10, 2);

ALTER TABLE app.event_expenses
    ADD COLUMN allocation_method text NOT NULL DEFAULT 'split_all'
        CHECK (allocation_method IN ('split_all', 'per_registration'));

CREATE TABLE app.event_expense_allocations (
    id                serial PRIMARY KEY,
    expense_id        int NOT NULL REFERENCES app.event_expenses(id) ON DELETE CASCADE,
    registration_id   int NOT NULL REFERENCES app.event_registrations(id) ON DELETE CASCADE,
    amount            numeric(10, 2) NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (expense_id, registration_id)
);

CREATE INDEX event_expense_allocations_expense_idx     ON app.event_expense_allocations(expense_id);
CREATE INDEX event_expense_allocations_registration_idx ON app.event_expense_allocations(registration_id);

ALTER TABLE app.event_payment_prescriptions
    ADD COLUMN payment_due date;

ALTER TABLE app.event_registration_participants
    ADD COLUMN member_id int REFERENCES app.members(id) ON DELETE SET NULL,
    ADD COLUMN person_id int REFERENCES app.people(id)  ON DELETE SET NULL;
