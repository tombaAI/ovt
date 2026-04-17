# Reconciliation app changes proposal

Date: 2026-04-10
Scope: practical changes for robust reconciliation between bank imports, registered payments, and contribution prescriptions.

## 1) Data model changes

### New table: app.bank_transaction_matches
Purpose: store explicit reconciliation links between imported bank transactions and internal payments/prescriptions.

Suggested columns:
- id serial primary key
- bank_tx_id int not null references app.bank_transactions(id)
- match_type text not null check (match_type in ('auto_exact','auto_loose','manual_single','manual_split','manual_merge','ignored_non_membership'))
- status text not null check (status in ('proposed','confirmed','rejected'))
- confidence smallint not null default 0
- note text null
- created_by text not null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

### New table: app.bank_transaction_match_lines
Purpose: 1:N and N:1 allocations for family payments and merged settlements.

Suggested columns:
- id serial primary key
- match_id int not null references app.bank_transaction_matches(id) on delete cascade
- member_id int null references app.members(id)
- contrib_id int null references app.member_contributions(id)
- payment_id int null references app.payments(id)
- allocated_amount int not null
- allocation_order smallint not null default 1
- created_at timestamptz not null default now()

Rules:
- Sum of allocated_amount per match must equal bank transaction amount for confirmed match.
- At least one of member_id / contrib_id / payment_id must be set.

### Optional extension to app.payments
- bank_tx_id int null references app.bank_transactions(id)
- reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched','suggested','matched','partial','ignored'))
- reconciliation_confidence smallint null

## 2) Matching engine rules

Implement deterministic staged matcher with confidence scoring.

### Stage A: exact auto match (confidence 100)
- Same member (VS -> member), same amount, same date.
- If exactly one candidate payment exists: auto-confirm.

### Stage B: strong yearly match (confidence 90)
- Same member, same amount, same year, date delta <= 14 days.
- If unique candidate: propose as suggested (not auto-confirm).

### Stage C: family split candidate (confidence 60-85)
Trigger when one of:
- bank amount > expected single-member typical amount,
- bank message includes separators (+ , / and),
- payer has multiple member contributions in same year,
- one member has multiple internal payments near bank tx date.

Action:
- Build proposal lines to multiple contrib_id in household/group context.
- Require manual confirmation before writing payment allocations.

### Stage D: non-membership candidate (confidence <= 40)
- Missing VS and no plausible member by name/date/amount.
- Amount pattern fits event deposits or transfers.

Action:
- Mark as ignored_non_membership with mandatory note.

## 3) UI changes

### New page: Dashboard > Reconciliation
Main tabs:
- Unmatched bank transactions
- Suggested matches
- Confirmed matches
- Exceptions

Columns:
- bank tx id, date, amount, VS, counterparty name, message
- detected member, detected year
- suggested status, confidence
- allocation summary

Actions:
- Confirm suggested match
- Split transaction (add multiple lines, members or contribs)
- Merge multiple bank tx into one payment target
- Mark as non-membership
- Undo/rollback match

### Payment and contribution detail integration
In contribution detail and payment sheet:
- show reconciliation badge: unmatched/suggested/matched/partial
- show linked bank transaction ids
- show residual amount to allocate

### Bulk workflow
- Multi-select unmatched rows and run batch suggest
- Filter by year, amount range, has VS, confidence band

## 4) Business controls and guardrails

- Hard check: confirmed match lines must sum exactly to bank tx amount.
- Hard check: payment total linked to contribution may exceed prescription only with explicit override reason.
- Audit every action to app.audit_log with before/after payload.
- Keep manual and auto provenance for each match line.

## 5) Monthly closing dashboard

Use the SQL set in reconciliation_dashboard_queries.sql.
For monthly operation:
1. Run year overview and check deltas.
2. Resolve unmapped VS rows.
3. Resolve suggested matches.
4. Review payments without bank match.
5. Re-check prescription coverage after updates.

## 6) Recommended implementation order

1. DB migration for match + match_lines tables.
2. Server actions for suggest/confirm/split/ignore/unmatch.
3. Reconciliation page with list + detail drawer.
4. Integrate badges into existing payments and contributions screens.
5. Add monthly close export buttons (CSV from current filters).

## 7) Acceptance criteria

- Every bank incoming transaction has one of states: confirmed match, proposed, ignored_non_membership.
- Family payments can be allocated to multiple members/contributions with exact amount balancing.
- User can trace from bank tx -> allocation lines -> payments -> contribution coverage.
- Year-end report can be produced without manual spreadsheet reconciliation.
