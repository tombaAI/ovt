-- Rozšíření import_fin_tj_allocations o párování s předpisy plateb za akce
-- contrib_id se stává nullable (buď příspěvek NEBO akce)
-- event_prescription_id — FK na event_payment_prescriptions

ALTER TABLE app.import_fin_tj_allocations
    ALTER COLUMN contrib_id DROP NOT NULL;

ALTER TABLE app.import_fin_tj_allocations
    ADD COLUMN IF NOT EXISTS event_prescription_id INTEGER
        REFERENCES app.event_payment_prescriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS import_fin_tj_alloc_event_idx
    ON app.import_fin_tj_allocations(event_prescription_id);

-- Constraint: přesně jedno z contrib_id nebo event_prescription_id musí být vyplněno
ALTER TABLE app.import_fin_tj_allocations
    ADD CONSTRAINT import_fin_tj_alloc_target_check
    CHECK (
        (contrib_id IS NOT NULL AND event_prescription_id IS NULL) OR
        (contrib_id IS NULL AND event_prescription_id IS NOT NULL)
    );
