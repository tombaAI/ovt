-- Souhlas hospodáře s vyúčtováním na akci
ALTER TABLE app.events ADD COLUMN treasurer_approved boolean NOT NULL DEFAULT false;

-- Log odeslaných e-mailů vyúčtování akce (vedoucímu + hospodáři)
CREATE TABLE app.event_vyuctovani_sends (
    id          serial PRIMARY KEY,
    event_id    integer NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    sent_at     timestamptz NOT NULL DEFAULT now(),
    sent_by     text NOT NULL,
    recipients  text[] NOT NULL DEFAULT '{}',
    test_to     text
);

CREATE INDEX event_vyuctovani_sends_event_idx ON app.event_vyuctovani_sends(event_id);
