-- ── Fáze 2: Odstranění platebních sloupců z member_contributions ────────────
-- APLIKOVAT AŽ PO přepnutí UI na tabulku payments!
-- Do té doby jsou obě struktury aktivní paralelně.

ALTER TABLE app.member_contributions DROP COLUMN IF EXISTS paid_amount;
ALTER TABLE app.member_contributions DROP COLUMN IF EXISTS paid_at;
ALTER TABLE app.member_contributions DROP COLUMN IF EXISTS is_paid;
ALTER TABLE app.member_contributions DROP COLUMN IF EXISTS note;
