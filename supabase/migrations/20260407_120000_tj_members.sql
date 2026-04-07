-- ══════════════════════════════════════════════════════════════════════════════
-- Tabulka tj_members: 1:1 zrcadlo dat z TJ Bohemians Excel (vodTuristika_database.xlsx)
-- Plněno automaticky přes Power Automate → GitHub Actions → sync endpoint
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.tj_members (
    id           serial PRIMARY KEY,
    csk_number   text UNIQUE,
    jmeno        text,
    prijmeni     text,
    nickname     text,
    email        text,
    phone        text,
    birth_date   date,
    birth_number text,
    gender       text,
    address      text,
    radek_odeslan date,
    synced_at    timestamp with time zone NOT NULL DEFAULT now(),
    created_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tj_members_csk_idx ON app.tj_members(csk_number);
