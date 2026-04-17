-- Notebook: interní poznámky výboru s verzováním
-- Aplikuj v Neon SQL Editoru

CREATE TABLE IF NOT EXISTS app.notebook_notes (
    id              serial PRIMARY KEY,
    title           text NOT NULL,
    created_by_email text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS notebook_notes_archived_idx    ON app.notebook_notes (archived_at);
CREATE INDEX IF NOT EXISTS notebook_notes_updated_at_idx  ON app.notebook_notes (updated_at DESC);

CREATE TABLE IF NOT EXISTS app.notebook_note_versions (
    id              serial PRIMARY KEY,
    note_id         integer NOT NULL REFERENCES app.notebook_notes(id) ON DELETE CASCADE,
    content         text NOT NULL,
    created_by_email text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notebook_note_versions_note_idx        ON app.notebook_note_versions (note_id);
CREATE INDEX IF NOT EXISTS notebook_note_versions_created_at_idx  ON app.notebook_note_versions (created_at DESC);
