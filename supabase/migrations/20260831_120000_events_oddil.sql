-- Druhý oddíl (TOM) u provozních výdajů — spec 2026-08-31-provozni-vydaje-vice-oddilu.md
BEGIN;

ALTER TABLE app.events ADD COLUMN oddil text NOT NULL DEFAULT 'ovt';
ALTER TABLE app.events ADD CONSTRAINT events_oddil_check CHECK (oddil IN ('ovt', 'tom'));

COMMIT;
