-- ─────────────────────────────────────────────────────────────────────────────
-- Dorovnání DB stavěné od nuly (přehráním migrací) se skutečným schema.ts.
--
-- E2E testy odhalily drift: část schématu vznikla historicky přes `db:push`
-- bez migračního souboru (events.time_from/…, registration_from/…) a zároveň
-- složka obsahuje drop-migrace (20260405_210000, 20260414_110000), které se
-- na staging/produkci nikdy nespustily, ale při stavbě od nuly ano — a kód
-- (schema.ts) tyto sloupce/tabulky STÁLE používá (dashboard, members padaly
-- na "column is_paid does not exist").
--
-- Na staging/produkci je celý soubor no-op (vše už existuje). Až proběhne
-- skutečný úklid Ledger V1 (odstranění z schema.ts + nová drop migrace),
-- novější soubor tyto sloupce při přehrání zase odstraní.
-- ─────────────────────────────────────────────────────────────────────────────

-- events: sloupce vzniklé přes db:push bez migrace
ALTER TABLE app.events ADD COLUMN IF NOT EXISTS time_from text;
ALTER TABLE app.events ADD COLUMN IF NOT EXISTS time_to text;
ALTER TABLE app.events ADD COLUMN IF NOT EXISTS registration_from date;
ALTER TABLE app.events ADD COLUMN IF NOT EXISTS registration_to date;

-- member_contributions: legacy platební sloupce — kód je dosud čte,
-- drop (20260405_210000) je "pending" a na staging/produkci neaplikovaný
ALTER TABLE app.member_contributions ADD COLUMN IF NOT EXISTS paid_amount integer;
ALTER TABLE app.member_contributions ADD COLUMN IF NOT EXISTS paid_at date;
ALTER TABLE app.member_contributions ADD COLUMN IF NOT EXISTS is_paid boolean;
ALTER TABLE app.member_contributions ADD COLUMN IF NOT EXISTS note text;

-- payments + payment_ledger.legacy_payment_id: drop (20260414_110000) na
-- staging/produkci neproběhl a schema.ts tabulku stále definuje
CREATE TABLE IF NOT EXISTS app.payments (
    id          serial PRIMARY KEY,
    contrib_id  integer NOT NULL REFERENCES app.member_contributions(id),
    member_id   integer NOT NULL REFERENCES app.members(id),
    amount      integer NOT NULL,
    paid_at     date,
    note        text,
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_contrib_idx ON app.payments (contrib_id);
CREATE INDEX IF NOT EXISTS payments_member_idx  ON app.payments (member_id);

ALTER TABLE app.payment_ledger ADD COLUMN IF NOT EXISTS legacy_payment_id integer;
