-- Předvyplněný importní profil pro soubor vodTuristika_database.xlsx (TJ Bohemians Praha)
-- Sloupce odpovídají struktuře Excelu evidence vodní turistiky.

INSERT INTO app.import_profiles (
    name,
    note,
    file_format,
    delimiter,
    encoding,
    header_row_index,
    match_keys,
    mappings,
    created_by
) VALUES (
    'TJ Bohemians — vodTuristika',
    'Soubor vodTuristika_database.xlsx ze sdíleného úložiště TJ Bohemians Praha. Párovací klíč: číslo ČSK.',
    'xlsx',
    NULL,
    NULL,
    0,
    '[{"sourceCol":"další informace (číslo ČSK)","targetField":"cskNumber"}]',
    '[
        {"sourceCol":"jméno",                        "targetField":"firstName"},
        {"sourceCol":"příjmení",                     "targetField":"lastName"},
        {"sourceCol":"pohlaví",                      "targetField":"gender"},
        {"sourceCol":"e-mail sportovec",             "targetField":"email"},
        {"sourceCol":"telefon sportovec",            "targetField":"phone"},
        {"sourceCol":"adresa bydliště",              "targetField":"address"},
        {"sourceCol":"datum narození",               "targetField":"birthDate"},
        {"sourceCol":"rodné číslo",                  "targetField":"birthNumber"},
        {"sourceCol":"další informace (číslo ČSK)",  "targetField":"cskNumber"}
    ]',
    'system'
);
