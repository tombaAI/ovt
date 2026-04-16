-- Doplnění dat pro existující lodě
-- Předpoklad: tabulka app.boats existuje, 46 řádků importováno,
--             stored_from = NULL, last_checked_at sloupec chybí

BEGIN;

ALTER TABLE app.boats
    ADD COLUMN last_checked_at date;

UPDATE app.boats
SET stored_from     = '2020-01-01',
    last_checked_at = '2021-02-06';

COMMIT;
