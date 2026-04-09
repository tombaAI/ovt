-- Rozdělení full_name na first_name + last_name
-- Algoritmus: poslední slovo = příjmení, zbytek = jméno

ALTER TABLE app.members ADD COLUMN first_name TEXT;
ALTER TABLE app.members ADD COLUMN last_name TEXT;

-- last_name = poslední slovo (regex: \S+ na konci)
-- first_name = vše před posledním slovem; pokud jednoslovné jméno, použije se celé
UPDATE app.members SET
    last_name  = (regexp_match(trim(full_name), '(\S+)$'))[1],
    first_name = COALESCE(
        NULLIF(trim(regexp_replace(trim(full_name), '\s*\S+$', '')), ''),
        (regexp_match(trim(full_name), '(\S+)$'))[1]
    );

ALTER TABLE app.members ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE app.members ALTER COLUMN last_name  SET NOT NULL;
