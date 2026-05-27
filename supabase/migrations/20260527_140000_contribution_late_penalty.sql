-- Přidat pole late_penalty do contribution_periods
-- Poplatek z prodlení za platbu po termínu splatnosti (v Kč)
ALTER TABLE app.contribution_periods
    ADD COLUMN IF NOT EXISTS late_penalty integer NOT NULL DEFAULT 0;
