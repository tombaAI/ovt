-- Souhlas hospodáře s vyúčtováním na akci (rychlý příznak)
ALTER TABLE app.events ADD COLUMN treasurer_approved boolean NOT NULL DEFAULT false;

-- Auditní log souhlasu hospodáře — každý souhlas i odvolání je samostatný záznam
CREATE TABLE app.event_treasurer_approval_log (
    id          serial PRIMARY KEY,
    event_id    integer NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    action      text NOT NULL CHECK (action IN ('approved', 'revoked')),
    changed_by  text NOT NULL,
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_treasurer_approval_log_event_idx ON app.event_treasurer_approval_log(event_id);

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
