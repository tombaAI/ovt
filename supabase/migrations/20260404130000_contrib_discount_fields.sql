-- Přidej pole pro poznámku a platnost individuální slevy
ALTER TABLE app.member_contributions
    ADD COLUMN IF NOT EXISTS discount_individual_note TEXT,
    ADD COLUMN IF NOT EXISTS discount_individual_valid_until SMALLINT;
