-- Odlinkovat členy ze zrušených přihlášek
-- Zrušená přihláška nemá aktivní kontext, propojení blokuje unique constraint
-- pro případnou jinou aktivní přihlášku téhož člena (např. Matějka na produkci).

UPDATE app.event_registration_participants erp
SET member_id = NULL
FROM app.event_registrations er
WHERE er.id = erp.registration_id
  AND er.cancelled_at IS NOT NULL
  AND erp.member_id IS NOT NULL;
