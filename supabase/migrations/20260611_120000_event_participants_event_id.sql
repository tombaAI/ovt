-- Přidat event_id do event_registration_participants a unique constraint (člen jednou na akci)

-- 1. Přidat sloupec (nullable, kvůli backfill)
ALTER TABLE app.event_registration_participants
    ADD COLUMN event_id integer REFERENCES app.events(id) ON DELETE CASCADE;

-- 2. Backfill z event_registrations
UPDATE app.event_registration_participants erp
SET event_id = er.event_id
FROM app.event_registrations er
WHERE er.id = erp.registration_id;

-- 3. NOT NULL po backfill
ALTER TABLE app.event_registration_participants
    ALTER COLUMN event_id SET NOT NULL;

-- 4. Smazat duplicitní propojení (ponechat první podle id)
DELETE FROM app.event_registration_participants
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY event_id, member_id ORDER BY id) AS rn
        FROM app.event_registration_participants
        WHERE member_id IS NOT NULL
    ) sub
    WHERE rn > 1
);

-- 5. Unique index: člen může být účastníkem dané akce jen jednou
--    (NULL member_id jsou povoleny vícekrát — nečlenové)
CREATE UNIQUE INDEX event_reg_participants_event_member_uq
    ON app.event_registration_participants (event_id, member_id)
    WHERE member_id IS NOT NULL;

-- 6. Pomocný index pro dotazy per-event
CREATE INDEX event_reg_participants_event_idx
    ON app.event_registration_participants (event_id);
