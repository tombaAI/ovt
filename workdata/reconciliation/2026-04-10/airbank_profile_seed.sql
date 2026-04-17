-- Seed: Air Bank import profile (pro navrženou tabulku app.bank_import_profiles)
-- Pozn.: Spouštět až po aplikaci migrace, která tabulku vytvoří.

insert into app.bank_import_profiles (
  name,
  note,
  source_type,
  file_format,
  delimiter,
  encoding,
  header_row_index,
  column_mappings,
  unique_key_col,
  negative_is_expense,
  created_by
)
values (
  'AirBank CSV v1',
  'Air Bank CSV export; importujeme příchozí transakce, upsert přes Referenční číslo',
  'file',
  'csv',
  ';',
  'utf-8',
  0,
  '[
    {"sourceCol":"Referenční číslo","targetField":"external_tx_id"},
    {"sourceCol":"Datum provedení","targetField":"date"},
    {"sourceCol":"Směr úhrady","targetField":"direction"},
    {"sourceCol":"Částka v měně účtu","targetField":"amount"},
    {"sourceCol":"Měna účtu","targetField":"currency"},
    {"sourceCol":"Variabilní symbol","targetField":"variable_symbol"},
    {"sourceCol":"Konstantní symbol","targetField":"constant_symbol"},
    {"sourceCol":"Specifický symbol","targetField":"specific_symbol"},
    {"sourceCol":"Název protistrany","targetField":"counterparty_name"},
    {"sourceCol":"Číslo účtu protistrany","targetField":"counterparty_account"},
    {"sourceCol":"Zpráva pro příjemce","targetField":"message_recipient"},
    {"sourceCol":"Poznámka k úhradě","targetField":"message_note"},
    {"sourceCol":"Poznámka pro mne","targetField":"message_internal"},
    {"sourceCol":"Typ úhrady","targetField":"payment_type"},
    {"sourceCol":"Kategorie plateb","targetField":"payment_category"},
    {"sourceCol":"Zaúčtováno","targetField":"booked_flag"}
  ]'::jsonb,
  'Referenční číslo',
  true,
  'system-seed'
)
on conflict do nothing;
