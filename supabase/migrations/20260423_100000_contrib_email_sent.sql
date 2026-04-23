-- Příznak odeslání emailu s předpisem příspěvku
ALTER TABLE app.member_contributions
    ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT false;
