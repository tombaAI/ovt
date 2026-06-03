-- Přidat pole note do event_registrations (poznámka účastníka k přihlášce)
ALTER TABLE app.event_registrations
    ADD COLUMN IF NOT EXISTS note text;
