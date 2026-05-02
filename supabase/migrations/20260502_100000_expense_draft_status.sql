-- Stav dokladu: draft = foto uloženo, čeká na zpracování; final = kompletní
ALTER TABLE app.event_expenses
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final';

-- Draft doklady nemají vyplněnou částku/kategorii/účel
ALTER TABLE app.event_expenses
    ALTER COLUMN amount       DROP NOT NULL,
    ALTER COLUMN purpose_text DROP NOT NULL,
    ALTER COLUMN purpose_category DROP NOT NULL;
