-- Přidat pole late_penalty do contribution_periods
-- Poplatek z prodlení za platbu po termínu splatnosti (v Kč)
ALTER TABLE app.contribution_periods
    ADD COLUMN IF NOT EXISTS late_penalty integer NOT NULL DEFAULT 0;

-- Nastavit poplatek z prodlení 100 Kč pro rok 2026
UPDATE app.contribution_periods SET late_penalty = 100 WHERE year = 2026 AND late_penalty = 0;
