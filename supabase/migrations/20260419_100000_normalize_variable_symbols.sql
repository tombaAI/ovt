-- Normalizace variabilních symbolů
-- 1. Odebere prefix "207101" ze všech VS (207101123 → 123)
-- 2. Doplní VS aktivním členům, kteří ho nemají (unikátní napříč všemi členy)
-- Idempotentní: bezpečné spustit opakovaně

BEGIN;

-- 1. Strip prefixu "207101" — zachová libovolně dlouhý suffix
UPDATE app.members
SET variable_symbol = right(variable_symbol::text, length(variable_symbol::text) - 6)::integer
WHERE variable_symbol::text LIKE '207101%'
  AND length(variable_symbol::text) > 6;

-- 2. Doplň VS aktivním členům bez VS; použij hodnoty nad stávajícím maximem
WITH max_vs AS (
    SELECT COALESCE(MAX(variable_symbol), 0) AS max_val
    FROM app.members
    WHERE variable_symbol IS NOT NULL
),
needs_vs AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM app.members
    WHERE variable_symbol IS NULL
      AND (member_to IS NULL OR member_to >= CURRENT_DATE)
)
UPDATE app.members m
SET variable_symbol = (SELECT max_val FROM max_vs) + n.rn
FROM needs_vs n
WHERE m.id = n.id;

COMMIT;
