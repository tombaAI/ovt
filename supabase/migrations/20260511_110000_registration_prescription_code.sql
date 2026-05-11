-- Přesun prescriptionCode z event_payment_prescriptions na event_registrations.
-- Kód C<nnn> patří přihlášce trvale — předpis ho jen přebírá.
-- Po odemčení (delete pending prescription) kód na přihlášce zůstane,
-- příští zamknutí použije stejný kód bez alokace nového ze sequence.

ALTER TABLE app.event_registrations
    ADD COLUMN prescription_code integer UNIQUE;

-- Přenést existující kódy z předpisů na přihlášky
UPDATE app.event_registrations er
SET prescription_code = epp.prescription_code
FROM app.event_payment_prescriptions epp
WHERE epp.registration_id = er.id;
