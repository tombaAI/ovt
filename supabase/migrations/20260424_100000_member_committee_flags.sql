-- Přidat trvalé příznaky výboru/TOM přímo na člena
-- (dříve se odvozovaly z member_contributions — při smazání předpisů se ztrácely)
ALTER TABLE app.members
    ADD COLUMN IF NOT EXISTS is_committee_member BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_tom_leader       BOOLEAN NOT NULL DEFAULT false;

-- Migrace dat: nastavit příznaky podle existujících předpisů příspěvků
UPDATE app.members m
SET
    is_committee_member = EXISTS (
        SELECT 1 FROM app.member_contributions mc
        WHERE mc.member_id = m.id AND mc.discount_committee IS NOT NULL
    ),
    is_tom_leader = EXISTS (
        SELECT 1 FROM app.member_contributions mc
        WHERE mc.member_id = m.id AND mc.discount_tom IS NOT NULL
    );
