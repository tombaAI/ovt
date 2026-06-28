-- Audit log: strukturovaná ID dotčených objektů pro úplný replay i budoucí pohledy
-- (např. audit z pohledu konkrétního člena). Zpětně kompatibilní — staré záznamy mají {}.
-- metadata: { eventId?, registrationId?, participantId?, memberId? }

ALTER TABLE app.audit_log
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Dotaz „co se dělo se členem X" / „na akci Y" napříč audit logem.
CREATE INDEX IF NOT EXISTS audit_log_metadata_idx ON app.audit_log USING gin (metadata);
