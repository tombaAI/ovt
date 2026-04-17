-- Navrhované DDL pro rekonciliační vrstvu (v2)
-- Otevřené body jsou označeny komentářem TODO:

begin;

-- ── Bankovní importní profily ─────────────────────────────────────────────────
-- Profil popisuje, jak zpracovat CSV/XLSX výpis z konkrétní banky.
-- Fio API má vlastní systémový "profil" (bez souboru), ale data sedí ve
-- stejné tabulce bank_transactions přes normalizovaná pole.

create table if not exists app.bank_import_profiles (
  id                 serial primary key,
  name               text not null,
  note               text,
  source_type        text not null default 'file' check (source_type in ('file', 'api')),
  file_format        text not null default 'csv'  check (file_format  in ('csv', 'xlsx')),
  delimiter          text,
  encoding           text,
  header_row_index   int  not null default 0,
  -- mapování sloupců: [{sourceCol, targetField}] kde targetField je normalizované pole
  -- normalizovaná pole: date, amount, currency, variable_symbol, constant_symbol,
  --   specific_symbol, counterparty_account, counterparty_name, message, tx_unique_key
  column_mappings    jsonb not null default '[]',
  -- sloupec/výraz pro unikátní klíč transakce v souboru
  -- může být název jednoho sloupce nebo null → syntetický klíč SHA256
  unique_key_col     text,
  -- záporná čísla v CSV jsou odchozí (default false = kladná = příchozí)
  negative_is_expense boolean not null default false,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists app.bank_import_runs (
  id                 serial primary key,
  profile_id         int references app.bank_import_profiles(id) on delete set null,
  profile_name_snap  text,
  filename           text,
  source_api         text,  -- 'fio' pro API import, null pro file
  date_from          date,
  date_to            date,
  records_parsed     int not null default 0,
  records_inserted   int not null default 0,
  records_skipped    int not null default 0,
  records_error      int not null default 0,
  run_status         text not null default 'ok' check (run_status in ('ok', 'partial', 'error')),
  error_detail       text,
  imported_by        text not null,
  imported_at        timestamptz not null default now()
);

-- Přidat cizí klíč na bank_transactions → run (volitelné, NULL = starý import bez záznamu)
alter table app.bank_transactions
  add column if not exists import_run_id int references app.bank_import_runs(id);

-- ── Alokace plateb ─────────────────────────────────────────────────────────────
-- Každá alokace reprezentuje jednu "platbu" ze strany plátce.
-- Může pocházet z bankovní transakce (bank_tx) nebo z ručního zadání (cash).
-- Jedna alokace může krýt více závazkových řádků (split).

create table if not exists app.payment_allocations (
  id                 serial primary key,
  source_type        text not null check (source_type in ('bank_tx', 'cash')),
  bank_tx_id         int  references app.bank_transactions(id),
  -- Celková částka alokace; musí = SUM(lines.allocated_amount) pro confirmed stav
  amount             int  not null check (amount > 0),
  currency           text not null default 'CZK',
  paid_at            date not null,
  status             text not null default 'unmatched' check (status in (
                       'unmatched',   -- vstupní stav po importu nebo hotovém zadání
                       'suggested',   -- matcher navrhl párování, čeká na potvrzení
                       'split',       -- admin zahájil rozdělení, ještě nedokončil
                       'confirmed',   -- párování nebo split potvrzeno
                       'ignored'      -- platba bez relevantního předpisu (zálohy, chyby)
                     )),
  -- confidence 0-100: 100 = auto-exact, 0 = neznámo
  confidence         smallint not null default 0 check (confidence between 0 and 100),
  note               text,
  -- Kdo potvrdil stav (null = systém / auto)
  confirmed_by       text,
  confirmed_at       timestamptz,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Každá bank_tx smí mít max jednu aktivní alokaci (ne ignored/rejected)
  -- TODO: zvážit unique index na bank_tx_id kde status <> 'ignored' pro silnější garanci
  constraint pa_source_check check (
    (source_type = 'bank_tx' and bank_tx_id is not null)
    or
    (source_type = 'cash' and bank_tx_id is null)
  )
);

create index if not exists pa_bank_tx_idx   on app.payment_allocations(bank_tx_id);
create index if not exists pa_status_idx    on app.payment_allocations(status);
create index if not exists pa_paid_at_idx   on app.payment_allocations(paid_at);

-- ── Alokační řádky (split lines) ──────────────────────────────────────────────
-- Jeden záznam = jedna část platby → jeden závazkový řádek.
-- V1: charge_type = 'contribution', charge_id = member_contributions.id
-- Budoucí: 'service', 'material' → jiné tabulky

create table if not exists app.payment_allocation_lines (
  id                 serial primary key,
  allocation_id      int  not null references app.payment_allocations(id) on delete cascade,
  -- Polymorfní reference na závazkový řádek
  charge_type        text not null default 'contribution' check (charge_type in (
                       'contribution'
                       -- v2: 'service', 'material'
                     )),
  charge_id          int  not null,
  -- Denormalizace pro rychlost — member_id závazkového řádku
  member_id          int  references app.members(id),
  allocated_amount   int  not null check (allocated_amount > 0),
  allocation_order   smallint not null default 1,
  created_by         text not null,
  created_at         timestamptz not null default now()
);

create index if not exists pal_allocation_idx on app.payment_allocation_lines(allocation_id);
create index if not exists pal_charge_idx     on app.payment_allocation_lines(charge_type, charge_id);
create index if not exists pal_member_idx     on app.payment_allocation_lines(member_id);

-- TODO: trigger nebo application-level check:
-- SUM(pal.allocated_amount WHERE allocation_id = X) = pa.amount WHERE pa.id = X AND pa.status = 'confirmed'

-- ── Legacy přechod ────────────────────────────────────────────────────────────
-- Stávající payments zůstanou read-only jako archiv.

alter table app.payments
  add column if not exists is_legacy boolean not null default true;

-- app.payments za nových záznamy vznikat nebudou; is_legacy = false jen pokud admin
-- explicitně vytvoří payment starou cestou (přechodové období).

-- ── Indexy pro rychlé uzávěrky ────────────────────────────────────────────────

create index if not exists pal_contrib_charge_idx
  on app.payment_allocation_lines(charge_id)
  where charge_type = 'contribution';

commit;
