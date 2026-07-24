-- Auditní log souhlasu hospodáře — každý souhlas i odvolání je samostatný záznam
-- IF NOT EXISTS: tabulku už vytváří zpětně rozšířená 20260513_110000
CREATE TABLE IF NOT EXISTS app.event_treasurer_approval_log (
    id          serial PRIMARY KEY,
    event_id    integer NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    action      text NOT NULL CHECK (action IN ('approved', 'revoked')),
    changed_by  text NOT NULL,
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_treasurer_approval_log_event_idx ON app.event_treasurer_approval_log(event_id);
