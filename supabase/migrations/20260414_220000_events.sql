-- Správa akcí (kalendář akcí)
-- events: akce jako entita s vedoucím, typem, termínem a stavem
-- brigades: přidáno event_id pro propojení brigády s akcí

BEGIN;

CREATE TABLE app.events (
    id             serial PRIMARY KEY,
    year           smallint NOT NULL,
    name           text NOT NULL,
    event_type     text NOT NULL DEFAULT 'other'
                   CHECK (event_type IN ('cpv','foreign','recreational','club','race','brigada','other')),
    date_from      date,                   -- NULL = termín zatím neznámý
    date_to        date,                   -- NULL = jednodenní nebo neznámý
    approx_month   smallint CHECK (approx_month BETWEEN 1 AND 12),  -- orientační měsíc, když datum neznámé
    location       text,
    leader_id      integer REFERENCES app.members(id) ON DELETE SET NULL,
    status         text NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','confirmed','cancelled','completed')),
    description    text,
    external_url   text,
    source         text NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','google_calendar','kanoe_rss')),
    gcal_event_id  text,                   -- ID eventu v Google Kalendáři
    gcal_sync      boolean NOT NULL DEFAULT false,  -- zda synchronizovat do GCal
    gcal_synced_at timestamptz,
    note           text,
    created_by     text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_year_idx      ON app.events(year);
CREATE INDEX events_date_from_idx ON app.events(date_from);
CREATE INDEX events_status_idx    ON app.events(status);
CREATE INDEX events_leader_idx    ON app.events(leader_id);

-- Propojení brigády s akcí (volitelné — brigáda bez akce se v kalendáři nezobrazí)
ALTER TABLE app.brigades
    ADD COLUMN event_id integer REFERENCES app.events(id) ON DELETE SET NULL;

CREATE INDEX brigades_event_idx ON app.brigades(event_id);

COMMIT;
