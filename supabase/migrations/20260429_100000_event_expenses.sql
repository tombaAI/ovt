-- Tabulka dokladů (nákladů) ke každé akci
CREATE TABLE app.event_expenses (
    id               SERIAL PRIMARY KEY,
    event_id         INTEGER NOT NULL REFERENCES app.events(id) ON DELETE CASCADE,
    amount           NUMERIC(10,2) NOT NULL,
    purpose_text     TEXT NOT NULL,
    purpose_category TEXT NOT NULL,
    file_url         TEXT,
    file_name        TEXT,
    file_mime        TEXT,
    uploaded_by      TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX event_expenses_event_idx ON app.event_expenses(event_id);
