-- Přidání příznaku is_member do účastníků přihlášky
-- Přihlašující označí každou osobu jako člena / nečlena přímo ve formuláři.
ALTER TABLE app.event_registration_participants
    ADD COLUMN IF NOT EXISTS is_member boolean NOT NULL DEFAULT false;
