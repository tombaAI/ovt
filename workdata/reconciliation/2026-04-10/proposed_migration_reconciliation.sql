-- Proposed migration for payment reconciliation (draft)
-- Do not apply blindly. Review constraints and backfill strategy first.

begin;

create table if not exists app.bank_transaction_matches (
  id serial primary key,
  bank_tx_id int not null references app.bank_transactions(id) on delete cascade,
  match_type text not null check (match_type in (
    'auto_exact',
    'auto_loose',
    'manual_single',
    'manual_split',
    'manual_merge',
    'ignored_non_membership'
  )),
  status text not null check (status in ('proposed', 'confirmed', 'rejected')),
  confidence smallint not null default 0 check (confidence between 0 and 100),
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_tx_matches_bank_tx_idx
  on app.bank_transaction_matches(bank_tx_id);
create index if not exists bank_tx_matches_status_idx
  on app.bank_transaction_matches(status);

create table if not exists app.bank_transaction_match_lines (
  id serial primary key,
  match_id int not null references app.bank_transaction_matches(id) on delete cascade,
  member_id int references app.members(id),
  contrib_id int references app.member_contributions(id),
  payment_id int references app.payments(id),
  allocated_amount int not null check (allocated_amount > 0),
  allocation_order smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint bank_tx_match_lines_target_check check (
    member_id is not null or contrib_id is not null or payment_id is not null
  )
);

create index if not exists bank_tx_match_lines_match_idx
  on app.bank_transaction_match_lines(match_id);
create index if not exists bank_tx_match_lines_member_idx
  on app.bank_transaction_match_lines(member_id);
create index if not exists bank_tx_match_lines_contrib_idx
  on app.bank_transaction_match_lines(contrib_id);
create index if not exists bank_tx_match_lines_payment_idx
  on app.bank_transaction_match_lines(payment_id);

alter table app.payments
  add column if not exists bank_tx_id int references app.bank_transactions(id),
  add column if not exists reconciliation_status text not null default 'unmatched' check (
    reconciliation_status in ('unmatched','suggested','matched','partial','ignored')
  ),
  add column if not exists reconciliation_confidence smallint check (
    reconciliation_confidence between 0 and 100
  );

create index if not exists payments_bank_tx_idx
  on app.payments(bank_tx_id);
create index if not exists payments_reco_status_idx
  on app.payments(reconciliation_status);

commit;
