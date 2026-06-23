-- Migrace 20260513_160000 chtěla zrušit staré UNIQUE na samotný registration_id, ale mazala
-- konstraint pod špatným jménem (..._registration_id_unique), takže DROP CONSTRAINT IF EXISTS
-- tiše neudělal nic. Skutečné jméno (Postgres default pro inline UNIQUE) je ..._registration_id_key
-- — ten zůstal aktivní a blokoval vznik druhého předpisu (deposit + settlement) pro stejnou
-- přihlášku, viz chyba "duplicate key value violates unique constraint
-- event_payment_prescriptions_registration_id_key" při generování předpisů.

ALTER TABLE app.event_payment_prescriptions
    DROP CONSTRAINT IF EXISTS event_payment_prescriptions_registration_id_key;
