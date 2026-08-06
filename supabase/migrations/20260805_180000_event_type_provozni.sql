-- Nový typ akce 'provozni' — provozní výdaje mimo akce (spec 2026-08-05-provozni-vydaje.md)
BEGIN;

ALTER TABLE app.events DROP CONSTRAINT events_event_type_check;
ALTER TABLE app.events ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN ('cpv','foreign','recreational','club','race','brigada','other','provozni'));

COMMIT;
