-- Log odeslaných e-mailů k vyúčtování akcí
-- registrationId = NULL → hromadné odeslání, NOT NULL → individuální odeslání

CREATE TABLE app.event_settlement_email_sends (
    id              serial PRIMARY KEY,
    event_id        integer NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    sent_by         text NOT NULL,
    sent_count      integer NOT NULL DEFAULT 0,
    skipped_count   integer NOT NULL DEFAULT 0,
    failed_count    integer NOT NULL DEFAULT 0,
    message         text,
    registration_id integer REFERENCES app.event_registrations(id) ON DELETE SET NULL,
    test_to         text
);

CREATE INDEX event_settlement_email_sends_event_idx ON app.event_settlement_email_sends(event_id);
