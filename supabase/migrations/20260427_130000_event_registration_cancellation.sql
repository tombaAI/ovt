BEGIN;

ALTER TABLE app.event_registrations
    ADD COLUMN cancelled_at TIMESTAMPTZ;

CREATE INDEX event_registrations_cancelled_at_idx
    ON app.event_registrations(cancelled_at);

COMMIT;
