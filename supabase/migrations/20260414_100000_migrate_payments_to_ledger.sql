-- Migrace legacy plateb z app.payments → payment_ledger + payment_allocations
-- Idempotentní: opakované spuštění nic navíc neudělá.
--
-- Postup:
--  1. Přidá dočasný sloupec legacy_payment_id do payment_ledger pro sledování migrace
--  2. Vloží každou dosud nemigrovanou platbu jako 'cash' ledger záznam (confirmed)
--  3. Vloží odpovídající alokaci do payment_allocations
--
-- SPUSTIT PŘED deployem kódu, který čte payments z payment_ledger!

BEGIN;

-- 1. Dočasný sloupec pro idempotentní sledování migrace
ALTER TABLE app.payment_ledger ADD COLUMN IF NOT EXISTS legacy_payment_id integer;

-- 2. Ledger záznamy pro platby, které ještě nebyly migrovány
INSERT INTO app.payment_ledger (
    source_type,
    paid_at,
    amount,
    currency,
    note,
    reconciliation_status,
    created_by,
    created_at,
    legacy_payment_id
)
SELECT
    'cash',
    COALESCE(p.paid_at, CURRENT_DATE),
    p.amount::numeric(10,2),
    'CZK',
    p.note,
    'confirmed',
    p.created_by,
    p.created_at,
    p.id
FROM app.payments p
WHERE NOT EXISTS (
    SELECT 1 FROM app.payment_ledger pl WHERE pl.legacy_payment_id = p.id
);

-- 3. Alokace pro nově vytvořené ledger záznamy
INSERT INTO app.payment_allocations (
    ledger_id,
    contrib_id,
    member_id,
    amount,
    is_suggested,
    confirmed_by,
    confirmed_at,
    created_by
)
SELECT
    pl.id,
    p.contrib_id,
    p.member_id,
    p.amount::numeric(10,2),
    false,
    'legacy-migration',
    pl.created_at,
    pl.created_by
FROM app.payment_ledger pl
JOIN app.payments p ON p.id = pl.legacy_payment_id
WHERE NOT EXISTS (
    SELECT 1 FROM app.payment_allocations pa WHERE pa.ledger_id = pl.id
);

COMMIT;
