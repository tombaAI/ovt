-- Mechanismus schvalování změny částky vyúčtování po vygenerování předpisu —
-- viz docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
-- Jen pro type = 'settlement'; zálohy (type = 'deposit') tímhle nejsou dotčené.

ALTER TABLE app.event_payment_prescriptions
    ADD COLUMN IF NOT EXISTS proposed_amount numeric(10, 2),
    ADD COLUMN IF NOT EXISTS proposed_at timestamptz;
