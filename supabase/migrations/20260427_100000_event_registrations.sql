BEGIN;

CREATE TABLE app.event_registrations (
    id            SERIAL PRIMARY KEY,
    event_id      INTEGER NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    form_slug     TEXT NOT NULL,
    email         TEXT NOT NULL,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    persons_count SMALLINT NOT NULL DEFAULT 1 CHECK (persons_count >= 1 AND persons_count <= 50),
    persons_names TEXT,
    transport_info TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX event_registrations_event_idx ON app.event_registrations(event_id);
CREATE INDEX event_registrations_slug_idx ON app.event_registrations(form_slug);
CREATE INDEX event_registrations_created_at_idx ON app.event_registrations(created_at DESC);

CREATE SEQUENCE app.event_payment_prescription_code_seq
    START WITH 210
    INCREMENT BY 1
    MINVALUE 210
    CACHE 1;

CREATE TABLE app.event_payment_prescriptions (
    id                    SERIAL PRIMARY KEY,
    event_id              INTEGER NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    registration_id       INTEGER NOT NULL UNIQUE REFERENCES app.event_registrations(id) ON DELETE CASCADE,
    prescription_code     INTEGER NOT NULL UNIQUE DEFAULT nextval('app.event_payment_prescription_code_seq'),
    bank_account          TEXT NOT NULL,
    variable_symbol       TEXT NOT NULL,
    amount                NUMERIC(10,2) NOT NULL,
    message_for_recipient TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'paid', 'cancelled')),
    matched_ledger_id     INTEGER REFERENCES app.payment_ledger(id) ON DELETE SET NULL,
    matched_amount        NUMERIC(10,2),
    matched_at            TIMESTAMPTZ,
    note                  TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER SEQUENCE app.event_payment_prescription_code_seq
    OWNED BY app.event_payment_prescriptions.prescription_code;

CREATE INDEX event_payment_prescriptions_event_idx ON app.event_payment_prescriptions(event_id);
CREATE INDEX event_payment_prescriptions_status_idx ON app.event_payment_prescriptions(status);
CREATE INDEX event_payment_prescriptions_ledger_idx ON app.event_payment_prescriptions(matched_ledger_id);

COMMIT;
