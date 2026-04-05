-- Remove legacy columns superseded by membership_years and contribution_periods.status
ALTER TABLE app.members DROP COLUMN IF EXISTS is_active;
ALTER TABLE app.member_contributions DROP COLUMN IF EXISTS joined_at;
ALTER TABLE app.member_contributions DROP COLUMN IF EXISTS left_at;
ALTER TABLE app.contribution_periods DROP COLUMN IF EXISTS is_draft;
