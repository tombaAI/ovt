# Implementation changes by file

Date: 2026-04-10
Goal: production-grade reconciliation including exact matching, manual confirmation, and family payment allocation (1:N).

## A) Database layer

1. Add migration file under supabase/migrations (new file)
- create app.bank_transaction_matches
- create app.bank_transaction_match_lines
- extend app.payments with bank_tx_id + reconciliation fields

Reference draft:
- workdata/reconciliation/2026-04-10/proposed_migration_reconciliation.sql

2. Update schema definition
- src/db/schema.ts
Changes:
- add bankTransactionMatches table definition
- add bankTransactionMatchLines table definition
- extend payments definition with reconciliation columns

## B) Server actions and matching engine

1. New actions file
- src/lib/actions/reconciliation.ts
Add actions:
- loadReconciliationRows(year, filters)
- suggestMatches(year)
- confirmMatch(matchId)
- rejectMatch(matchId, reason)
- createManualSplit(bankTxId, lines[])
- markAsNonMembership(bankTxId, note)
- undoMatch(matchId)

2. Extend bank actions
- src/lib/actions/bank.ts
Changes:
- replace current simplistic one-payment-per-member-year mapping
- include reconciliation status and confidence for each bank tx
- expose candidate lines and residual amount

3. Extend contribution actions
- src/lib/actions/contributions.ts
Changes:
- when payment is created/deleted, update linked reconciliation status
- optional action: linkPaymentToBankTx(paymentId, bankTxId)

## C) UI changes

1. New reconciliation page
- src/app/(admin)/dashboard/reconciliation/page.tsx
- src/app/(admin)/dashboard/reconciliation/reconciliation-client.tsx
- src/app/(admin)/dashboard/reconciliation/reconciliation-sheet.tsx
Features:
- tabs: unmatched / suggested / confirmed / exceptions
- list with confidence, status, and quick actions
- drawer for split allocation lines

2. Improve bank import page
- src/app/(admin)/dashboard/imports/bank/page.tsx
- src/app/(admin)/dashboard/imports/bank/bank-import-client.tsx
Changes:
- show status badge per tx: unmatched/suggested/matched/ignored
- action buttons inline: confirm, split, ignore
- remove statement that payment means only same member+year record

3. Extend payment sheet
- src/app/(admin)/dashboard/contributions/payment-sheet.tsx
Changes:
- show linked bank tx references and reconciliation badge
- show warning when payment does not map to bank tx
- action to relink/unlink bank tx

4. Navigation
- src/app/(admin)/layout.tsx
Changes:
- add menu item Dashboard > Reconciliation

## D) Validation rules in code

Implement hard checks in server actions:
- confirmed split: sum(allocated_amount) == bank_transaction.amount
- no negative allocation
- in manual split, each line must target valid member/contribution
- for confirmed match, lock duplicate reuse of same bank tx unless match_type = manual_merge

## E) Backfill and rollout

1. Backfill script
- workdata/reconciliation/backfill_reconciliation.mjs (new)
Flow:
- run exact rules (confidence 100) and mark confirmed
- run loose rules (confidence 90) and mark proposed
- generate report counts by year

2. Rollout order
1. DB migration
2. schema.ts updates
3. server actions + backfill
4. reconciliation UI page
5. contributions/payment-sheet integration
6. bank imports page refinement

## F) Test scenarios

Must cover:
- exact single match
- same amount but wrong date (suggested)
- family split one tx -> 2+ contributions
- no-member bank tx marked non-membership
- undo confirmed match and restore status
- payment deleted after match updates residual correctly
