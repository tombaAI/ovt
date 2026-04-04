-- Track when a member joined or left during a given year
ALTER TABLE app.member_contributions
ADD COLUMN IF NOT EXISTS joined_at DATE,
ADD COLUMN IF NOT EXISTS left_at DATE;
