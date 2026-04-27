BEGIN;

ALTER TABLE app.event_registrations
    ADD COLUMN phone TEXT,
    ADD COLUMN public_token TEXT;

UPDATE app.event_registrations
SET public_token = md5(id::text || '-' || clock_timestamp()::text || '-' || random()::text)
WHERE public_token IS NULL;

ALTER TABLE app.event_registrations
    ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX event_registrations_public_token_idx
    ON app.event_registrations(public_token);

CREATE TABLE app.event_registration_participants (
    id                SERIAL PRIMARY KEY,
    registration_id   INTEGER NOT NULL REFERENCES app.event_registrations(id) ON DELETE CASCADE,
    participant_order SMALLINT NOT NULL CHECK (participant_order >= 1 AND participant_order <= 50),
    full_name         TEXT NOT NULL,
    is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(registration_id, participant_order)
);

CREATE INDEX event_reg_participants_registration_idx
    ON app.event_registration_participants(registration_id);

INSERT INTO app.event_registration_participants (registration_id, participant_order, full_name, is_primary)
SELECT
    r.id,
    parts.ord::smallint,
    btrim(parts.name) AS full_name,
    (parts.ord = 1) AS is_primary
FROM app.event_registrations r
CROSS JOIN LATERAL regexp_split_to_table(
        coalesce(r.persons_names, ''),
        '[' || chr(10) || ',;]+'
) WITH ORDINALITY AS parts(name, ord)
WHERE btrim(parts.name) <> ''
  AND parts.ord <= 50;

INSERT INTO app.event_registration_participants (registration_id, participant_order, full_name, is_primary)
SELECT
    r.id,
    1,
    btrim(concat_ws(' ', r.first_name, r.last_name)) AS full_name,
    TRUE
FROM app.event_registrations r
WHERE NOT EXISTS (
    SELECT 1
    FROM app.event_registration_participants p
    WHERE p.registration_id = r.id
)
AND btrim(concat_ws(' ', r.first_name, r.last_name)) <> '';

WITH participant_rollup AS (
    SELECT
        p.registration_id,
        COUNT(*)::smallint AS persons_count,
        string_agg(p.full_name, chr(10) ORDER BY p.participant_order) AS persons_names
    FROM app.event_registration_participants p
    GROUP BY p.registration_id
)
UPDATE app.event_registrations r
SET
    persons_count = rollup.persons_count,
    persons_names = rollup.persons_names
FROM participant_rollup rollup
WHERE r.id = rollup.registration_id;

COMMIT;
