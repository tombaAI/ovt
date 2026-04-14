-- Evidence brigád
-- brigades: hlavička brigády (datum, rok, vedoucí, název, poznámka)
-- brigade_members: seznam účastníků brigády

BEGIN;

CREATE TABLE app.brigades (
    id           serial PRIMARY KEY,
    date         date NOT NULL,
    year         smallint NOT NULL,               -- rok, do kterého brigáda patří (typicky rok konání)
    name         text,                            -- název / popis brigády
    leader_id    integer REFERENCES app.members(id) ON DELETE SET NULL,
    note         text,
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX brigades_year_idx ON app.brigades(year);
CREATE INDEX brigades_date_idx ON app.brigades(date);

CREATE TABLE app.brigade_members (
    id           serial PRIMARY KEY,
    brigade_id   integer NOT NULL REFERENCES app.brigades(id) ON DELETE CASCADE,
    member_id    integer NOT NULL REFERENCES app.members(id) ON DELETE CASCADE,
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brigade_id, member_id)
);

CREATE INDEX brigade_members_brigade_idx ON app.brigade_members(brigade_id);
CREATE INDEX brigade_members_member_idx  ON app.brigade_members(member_id);

COMMIT;
