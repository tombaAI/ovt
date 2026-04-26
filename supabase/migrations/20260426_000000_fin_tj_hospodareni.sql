-- Výsledky hospodaření oddílů TJ: cover záznamy importů
CREATE TABLE IF NOT EXISTS app.import_fin_tj_hospodareni_imports (
    id           SERIAL      PRIMARY KEY,
    period_from  DATE        NOT NULL,
    period_to    DATE        NOT NULL,
    prevod_year  INTEGER,                   -- rok ze záhlaví sloupce "PŘEVOD Z ROKU X"
    file_name    TEXT,
    imported_by  TEXT        NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Řádky tabulky: jeden záznam per oddíl per import
CREATE TABLE IF NOT EXISTS app.import_fin_tj_hospodareni_rows (
    id          SERIAL         PRIMARY KEY,
    import_id   INTEGER        NOT NULL REFERENCES app.import_fin_tj_hospodareni_imports(id) ON DELETE CASCADE,
    oddil_id    TEXT           NOT NULL,   -- "207"
    oddil_name  TEXT           NOT NULL,   -- "VODNÍ TURISTIKA"
    naklady     NUMERIC(14,2)  NOT NULL DEFAULT 0,
    vynosy      NUMERIC(14,2)  NOT NULL DEFAULT 0,
    vysledek    NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- záporné = ztráta
    prevod      NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- záporné = přenesený schodek
    celkem      NUMERIC(14,2)  NOT NULL DEFAULT 0   -- záporné = celkový schodek
);

CREATE INDEX IF NOT EXISTS import_fin_tj_hosp_import_idx ON app.import_fin_tj_hospodareni_rows(import_id);
CREATE INDEX IF NOT EXISTS import_fin_tj_hosp_oddil_idx  ON app.import_fin_tj_hospodareni_rows(oddil_id);
