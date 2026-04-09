-- Import profiles: uložená mapování pro opakované importy
CREATE TABLE app.import_profiles (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    note            TEXT,
    file_format     TEXT NOT NULL DEFAULT 'csv',
    delimiter       TEXT,                           -- null = auto-detect
    encoding        TEXT,                           -- null = auto-detect
    header_row_index INTEGER NOT NULL DEFAULT 0,   -- 0-based index řádku s hlavičkou
    match_keys      JSONB NOT NULL DEFAULT '[]',   -- [{sourceCol, targetField}]
    mappings        JSONB NOT NULL DEFAULT '[]',   -- [{sourceCol, targetField}]
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Import history: log provedených importů
CREATE TABLE app.import_history (
    id                      SERIAL PRIMARY KEY,
    profile_id              INTEGER REFERENCES app.import_profiles(id) ON DELETE SET NULL,
    profile_name_snapshot   TEXT,
    filename                TEXT NOT NULL,
    encoding_detected       TEXT,
    records_total           INTEGER NOT NULL DEFAULT 0,
    records_matched         INTEGER NOT NULL DEFAULT 0,
    records_new_candidates  INTEGER NOT NULL DEFAULT 0,
    records_with_diffs      INTEGER NOT NULL DEFAULT 0,
    records_only_in_db      INTEGER NOT NULL DEFAULT 0,
    changes_applied         JSONB NOT NULL DEFAULT '[]',
    members_added           JSONB NOT NULL DEFAULT '[]',
    imported_by             TEXT NOT NULL,
    imported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
