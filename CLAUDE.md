# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**OVT sprava** — internal management web app for OVT Bohemians (Czech water sports club). Admin-only interface, PC-first with mobile support. Deployed on Vercel with Neon (PostgreSQL).

See `zadani/popis_zadani_1.txt` for the full product spec (in Czech).

## Workflow

**Every completed task ends with `git commit` + `git push` to `main`.** Vercel auto-deploys from main, the user checks the result in the browser immediately. Never leave finished work uncommitted.

SQL migrations (`supabase/migrations/`) are applied manually by the user via Neon SQL Editor — always tell the user which file to run and what it does.

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint         # ESLint
npm run db:push      # push Drizzle schema changes to Neon (dev/staging)
npm run db:studio    # Drizzle Studio — local DB browser
```

Pre-commit hook runs `npm run lint && npx tsc --noEmit` — always verify clean before committing. There are no automated tests; only linting and type-checking are enforced.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router + TypeScript |
| UI | shadcn/ui (Zinc base) + Tailwind CSS |
| Database ORM | Drizzle ORM |
| Database | Neon PostgreSQL (via `postgres` npm package) |
| Auth | Auth.js v5 (`next-auth@beta`) — Google OAuth only |
| Email | Resend |
| Deploy | Vercel (auto-deploy from main) |

## File structure

```
src/
  auth.ts               # Auth.js config — Google provider, signIn callback
  middleware.ts          # Route protection: /dashboard/* requires auth; subdomain redirect
  app/
    (admin)/             # Route group: protected admin pages
      layout.tsx         # Admin header (nav bar, user name, logout)
      dashboard/
        page.tsx         # /dashboard home — member + contribution counts
        members/         # Member management
          page.tsx           # Server: queries membership_years + member_contributions
          members-client.tsx # Client: filter pills, sort, table, sheet trigger
          member-sheet.tsx   # Detail/edit sheet (inline fields, flags, todo, history)
          inline-field.tsx   # Controlled inline-edit field component
        contributions/   # Contribution prescription management
          page.tsx           # Server: queries member_contributions + payment aggregate
          contributions-client.tsx
          payment-sheet.tsx  # Detail sheet: payment list, add payment, todo
        payments/        # Payment reconciliation (ledger V1)
        boats/           # Boat inventory
        brigades/        # Work party tracking
        events/          # Club event management
        imports/         # Data import management (members, bank transactions)
        finance/         # TJ accounting report import & reconciliation
        informace/       # Public information pages
    (public)/            # Public pages (homepage)
    login/               # Login page
    api/
      auth/[...nextauth]/  # Auth.js route handler
      cron/              # Vercel Cron jobs (sync-members, sync-bank)
      health/            # Health check endpoints (db, email)
      webhooks/          # External webhooks (CSK member import)
      bank/              # Manual bank resync endpoint
      email/             # Email test/batch endpoints
  lib/
    db.ts                # Drizzle client singleton (globalThis.__ovtDb)
    fio.ts               # Fio Bank API connector (rate-limited, server-side only)
    gcal.ts              # Google Calendar two-way sync
    email.ts             # Resend client + mode detection (disabled/test/custom)
    runtime-env.ts       # Environment variable validation at startup
    year.ts              # Current year selection logic
    constants.ts         # CONTRIBUTION_YEAR and other shared constants
    member-fields.ts     # Czech field labels for audit log display
    actions/             # Server actions ("use server" — all business logic)
      members.ts         # Member CRUD, audit logging, membership year tracking
      contributions.ts   # Contribution prescription management
      contribution-periods.ts  # Period setup, email sending, status lifecycle
      contrib-emails.ts  # Email template assembly for prescriptions
      reconciliation.ts  # Payment matching, allocation splits, auto-matcher (956 LOC)
      bank.ts            # Fio Bank API sync, idempotent upsert on fio_id
      bank-file-import.ts # CSV/file bank import with profile matching
      import.ts          # Generic import framework (members, bank transactions)
      events.ts          # Event CRUD + Google Calendar sync
      brigades.ts        # Brigade CRUD and member assignment
      boats.ts           # Boat inventory management
      notes.ts           # Shared notebook feature
      finance-tj.ts      # TJ accounting report import
    email-templates/     # Email builders (Resend)
    parsers/
      tj-finance-parser.ts  # PDF extraction for TJ accounting reports
  db/
    schema.ts            # Drizzle schema — all tables
  components/
    ui/                  # shadcn/ui (do not edit — reinstall via CLI)
```

## Database schema (app.* PostgreSQL schema)

All tables live in the `app` schema. Schema defined in `src/db/schema.ts`.

### Core tables

| Table | Purpose |
|---|---|
| `members` | Core member data (name, login, email, phone, var. symbol, CSK number, note, todo_note) |
| `membership_years` | Per-year membership record (memberId, year, fromDate, toDate) — source of truth for "who was a member in year X" |
| `contribution_periods` | One row per year (amounts, discounts, status: draft/confirmed/collecting/closed) |
| `member_contributions` | Prescription per member per period (amounts, discounts, todo_note) |
| `audit_log` | Change history for all member/payment operations |
| `admin_users` | Admin access list (email whitelist for Google OAuth) |
| `mail_events` | Outbound email audit trail |

### Payment ledger (V1 — replaces old `payments` table)

| Table | Purpose |
|---|---|
| `payment_ledger` | Unified ledger for all received payments (source_type: fio_bank \| file_import \| cash) |
| `fio_bank_transactions` | Fio Bank API sync staging (idempotent upsert on `fio_id`) |
| `bank_import_transactions` | File-based import staging |
| `payment_allocations` | Allocations from ledger entries → member_contributions (supports splits) |

### Other domain tables

| Table | Purpose |
|---|---|
| `boats` | Boat inventory, grid position, owner, storage dates |
| `events` | Club events (CPV, races, brigades, recreations) |
| `brigades` + `brigade_members` | Work parties with attendance tracking |
| `notebook_notes` + `notebook_note_versions` | Shared notes with version history |
| `import_profiles` | Configurable column mapping for CSV imports (member/bank) |
| `import_members_tj_bohemians` | CSK member import staging |
| `import_fin_tj_imports` | TJ accounting report cover sheet metadata |
| `import_fin_tj_transactions` | Individual transactions from TJ accounting reports |

### Key design decisions

- **`membership_years` is the source of truth** for member lists. The members page queries `membership_years INNER JOIN members LEFT JOIN member_contributions` for the selected year.
- **Payment Ledger V1** (2026-04): `payment_ledger` + `payment_allocations` replace the old `payments` table. Old columns (`paid_amount`, `paid_at`, `is_paid`) still exist in DB but are unused — drop migration pending (`supabase/migrations/20260405_210000_drop_payment_columns.sql`). Do NOT apply until production is verified.
- **Auto-matcher**: `autoMatchLedgerEntry()` in `reconciliation.ts` matches payments to member contributions via variable symbol. Exact amount → status `confirmed`; amount mismatch → `suggested`.
- **`contribution_periods.status`** lifecycle: `draft → confirmed → collecting → closed`.
- **Audit log**: every field change, payment add/delete, todo set/resolved is logged to `audit_log` with `entityType`, `entityId`, `action`, `changes: { fieldName: { old, new } }` as JSONB.
- **Subdomain routing**: `is.ovtbohemians.cz` redirects `/` to `/dashboard` via `src/middleware.ts`.
- **DB connection**: `postgres` package with `max: 1` (serverless-optimized). SSL auto-detected: localhost=false, else `"require"`.

### Migration files (supabase/migrations/)

Applied in order via Neon SQL Editor. Never apply the drop-payment-columns migration until verifying the ledger V1 system works correctly in production.

## Server action conventions

All server actions are in `src/lib/actions/` with `"use server"` directive.

- **Return type**: `{ error: string } | { success: true }` for client feedback
- **DB access**: `const db = getDb()` singleton — never import db directly
- **Session**: `const session = await auth()` → email used for audit `changedBy`
- **Audit**: every mutation inserts to `auditLog` with `{ fieldName: { old, new } }` JSONB
- **Revalidation**: `revalidatePath()` after every mutation (no ISR — immediate UI update)

## External integrations

**Fio Bank API** (`src/lib/fio.ts`):
- Rate limit: 1 request / 30 seconds per token
- Transactions stored with idempotent upsert on `fio_id`
- Manual trigger: `POST /api/bank/resync`; automated via daily cron

**Google Calendar** (`src/lib/gcal.ts`):
- Two-way sync: import GCal events into `events` table, optionally push back

**Resend email** (`src/lib/email.ts`):
- Three modes based on env vars: `disabled` (no `RESEND_API_KEY`), `test` (key set, no `MAIL_FROM` → sends to `onboarding@resend.dev`), `custom` (full config)
- Templates in `src/lib/email-templates/`

## Cron jobs & API routes

Vercel cron jobs (defined in `vercel.json`), run daily at 06:00 UTC, require `CRON_SECRET` Bearer token:
- `GET /api/cron/sync-members` — CSK member data sync
- `GET /api/cron/sync-bank` — Fio Bank transaction sync

Health check endpoints (no auth required):
- `GET /api/health` — runtime config status + admin email list
- `GET /api/health/db` — database connectivity
- `GET /api/health/email` — email service test

## Environment variables

Required for basic operation:
```
DATABASE_URL          # Neon connection string
AUTH_SECRET           # Auth.js session secret
AUTH_GOOGLE_ID        # Google OAuth client ID
AUTH_GOOGLE_SECRET    # Google OAuth client secret
```

Email (optional — app runs without email):
```
RESEND_API_KEY        # omit to disable email entirely
MAIL_FROM             # omit to use test mode (onboarding@resend.dev)
MAIL_REPLY_TO
MAIL_TEST_TO          # override recipient for test sends
```

Other integrations:
```
CRON_SECRET           # Bearer token for cron job endpoints
FIO_API_TOKEN         # Fio Bank API token
APP_BASE_URL          # override base URL (default: http://localhost:3000)
```

See `.env.example` for the full list with Czech comments.

## Feature map

### Members page (`/dashboard/members`)
- URL param `?year=X` selects the year tab
- Filter pills: Všichni / Výbor / Vedoucí TOM / Individuální sleva / Část roku / Ke kontrole / S úkolem
- Sort: Jméno / Příjmení
- Click row → opens `MemberSheet`

### Member detail sheet
- Inline field editing (one field at a time, Enter to save, Esc to cancel)
- Checkboxes: Člen výboru / Vedoucí TOM (update `member_contributions.discount_committee/tom`)
- Membership dates for selected year (`membership_years.from_date/to_date`)
- Individual discount dialog
- **Todo section**: textarea → save (sets `members.todo_note`) / "Vyřešeno" (clears it)
- Membership history review: table 2019–present, per-year checkboxes + dates
- Audit history (collapsible)

### Contributions page (`/dashboard/contributions`)
- URL param `?year=X` selects the year tab with lifecycle badge
- Filter pills: Problémy / Nezaplaceno / Nedoplatek / Přeplatek / Zaplaceno / S úkolem / Všichni
- Click row → opens `PaymentSheet`

### Payment detail sheet
- Prescription breakdown
- Payment list from `payment_allocations` (via ledger), each deletable
- Add payment form: amount + date + note
- Paid total vs. prescription with balance (přeplatek/nedoplatek)
- **Todo section**: same pattern as member todo

### Payments page (`/dashboard/payments`)
- Payment reconciliation UI (ledger V1)
- Unmatched transactions from Fio Bank and file imports
- Manual allocation, split payments, confirm/reject matched suggestions

## Auth flow

`src/auth.ts` uses JWT sessions. The `signIn` callback checks `app.admin_users` — if email not found with `is_active = true`, login is rejected.

## Design

OVT brand colors: primary green `#327600`, nav charcoal `#26272b`, sage `#82b965`.

Sheet width: `sm:max-w-3xl`. Sheet padding: `px-5 pb-8` on SheetContent, `px-0 pt-5 pb-4` override on SheetHeader.

shadcn/ui components use Zinc base. The Sheet component has its built-in `sm:max-w-sm` removed to allow width override via className.
