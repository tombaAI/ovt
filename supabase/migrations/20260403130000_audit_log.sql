-- Audit log for member changes
CREATE TABLE IF NOT EXISTS app.audit_log (
    id          SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,                                 -- 'member'
    entity_id   INTEGER NOT NULL,                              -- members.id
    action      TEXT NOT NULL,                                 -- 'create' | 'update'
    changes     JSONB NOT NULL DEFAULT '{}',                   -- {field: {old, new}}
    changed_by  TEXT NOT NULL,                                 -- admin email
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON app.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx ON app.audit_log(changed_at DESC);
