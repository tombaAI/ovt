-- Dva předpisy na přihlášku: záloha (deposit) + doplatek (settlement)
-- Dosud existoval jen jeden předpis na přihlášku (UNIQUE registration_id).
-- Nový model: každá přihláška může mít deposit i settlement předpis (max 1 každého).

-- 1. Přidat sloupec type
ALTER TABLE app.event_payment_prescriptions
    ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'settlement'
    CONSTRAINT event_payment_prescriptions_type_check CHECK (type IN ('deposit', 'settlement'));

-- 2. Stávající předpisy z veřejného formuláře přihlášek jsou zálohy (deposit)
UPDATE app.event_payment_prescriptions p
SET type = 'deposit'
FROM app.event_registrations r
WHERE p.registration_id = r.id
  AND r.form_slug = 'zahranicnivoda';

-- 3. Zrušit staré UNIQUE omezení na samotný registration_id
ALTER TABLE app.event_payment_prescriptions
    DROP CONSTRAINT IF EXISTS event_payment_prescriptions_registration_id_unique;

-- 4. Nové kompozitní UNIQUE: jeden deposit + jeden settlement na přihlášku
CREATE UNIQUE INDEX IF NOT EXISTS event_payment_prescriptions_reg_type_uq
    ON app.event_payment_prescriptions (registration_id, type);
