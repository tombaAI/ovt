-- Source of truth for "was a member in year X, from/to when"
CREATE TABLE IF NOT EXISTS app.membership_years (
    member_id INTEGER NOT NULL REFERENCES app.members(id),
    year      SMALLINT NOT NULL,
    from_date DATE,   -- NULL = celý rok (od 1. 1.)
    to_date   DATE,   -- NULL = celý rok (do 31. 12.)
    PRIMARY KEY (member_id, year)
);

-- Seed 2025 from existing member_contributions
INSERT INTO app.membership_years (member_id, year)
SELECT mc.member_id, 2025
FROM app.member_contributions mc
JOIN app.contribution_periods cp ON mc.period_id = cp.id
WHERE cp.year = 2025
ON CONFLICT DO NOTHING;

-- Review flag on members
ALTER TABLE app.members
ADD COLUMN IF NOT EXISTS membership_reviewed BOOLEAN NOT NULL DEFAULT false;
