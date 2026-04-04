-- Add lifecycle status to contribution_periods
ALTER TABLE app.contribution_periods
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'collecting';

-- Migrate from is_draft boolean
UPDATE app.contribution_periods SET status = 'draft'     WHERE is_draft = true;
UPDATE app.contribution_periods SET status = 'closed'    WHERE is_draft = false AND year < 2025;
-- 2025 stays 'collecting' (default)
