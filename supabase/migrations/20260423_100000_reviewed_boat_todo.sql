-- Přidat sloupec "provedena revize" na member_contributions a boats
-- Přidat todo_note na boats

ALTER TABLE app.member_contributions
    ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;

ALTER TABLE app.boats
    ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;

ALTER TABLE app.boats
    ADD COLUMN IF NOT EXISTS todo_note text;
