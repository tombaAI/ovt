-- member_id je volitelný: u alokací na předpisy plateb za akce nemáme člena
ALTER TABLE app.import_fin_tj_allocations
    ALTER COLUMN member_id DROP NOT NULL;
