-- Billing status stavový automat pro vyúčtování akce
-- draft      = náklady editovatelné, předpisy neexistují
-- prescribed = náklady zamčené, předpisy vygenerovány, lze rozesílat e-maily

ALTER TABLE app.events
    ADD COLUMN billing_status text NOT NULL DEFAULT 'draft'
        CHECK (billing_status IN ('draft', 'prescribed'));

-- Existující akce s předpisy přesuneme do prescribed
UPDATE app.events e
SET billing_status = 'prescribed'
WHERE EXISTS (
    SELECT 1 FROM app.event_payment_prescriptions epp
    JOIN app.event_registrations er ON er.id = epp.registration_id
    WHERE er.event_id = e.id
);
