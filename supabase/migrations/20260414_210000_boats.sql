-- Evidence lodí v krakorcích
-- boats: loď jako entita s majitelem, popisem, umístěním a obdobím uložení

BEGIN;

CREATE TABLE app.boats (
    id          serial PRIMARY KEY,
    owner_id    integer REFERENCES app.members(id) ON DELETE SET NULL,
    description text,           -- popis lodě: "modrá Dagger M8.0", "Wigo singl"
    color       text,           -- barva
    grid        text,           -- mříž: '1', '2', '3', 'dlouhé' — NULL = neznámé
    position    smallint,       -- číslo pozice v mříži; NULL pro 'dlouhé' nebo neznámé
    is_present      boolean NOT NULL DEFAULT true,  -- je loď fyzicky přítomna na místě
    stored_from     date,           -- od kdy loď evidujeme (NULL = historická data, neznámé)
    stored_to       date,           -- do kdy; NULL = stále aktivní (loď je v krakorcích)
    last_checked_at date,           -- datum poslední fyzické kontroly v krakorcích
    note        text,
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX boats_owner_idx     ON app.boats(owner_id);
CREATE INDEX boats_grid_idx      ON app.boats(grid);
CREATE INDEX boats_stored_to_idx ON app.boats(stored_to);

COMMIT;
