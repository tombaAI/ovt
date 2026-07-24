# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**OVT sprava** — internal management web app for OVT Bohemians (Czech water sports club). Admin-only interface, PC-first with mobile support. Deployed on Vercel with Neon (PostgreSQL).

See `zadani/popis_zadani_1.txt` for the full product spec (in Czech). See `docs/superpowers/specs/INDEX.md` for the status/roadmap of individual feature specs (návrh/zgrilováno/staging-UAT/schváleno/produkce).

## Workflow

### Větve a prostředí

| Větev | Prostředí | URL | Databáze |
|---|---|---|---|
| `staging` | Preview (Vercel) | `ovt-git-staging-tombaais-projects.vercel.app` | Neon branch `staging` |
| `main` | Production (Vercel) | `is.ovtbohemians.cz` | Neon branch `main` |

**Výchozí pracovní větev je `staging`.** Každý úkol (oprava, nová funkce, změna) se vyvíjí na `staging` a do produkce se dostává výhradně přes PR.

### Pravidla pro AI asistenty

1. **"Udělej X" = práce na větvi `staging`**, vždy zakončená `git commit` + `git push origin staging`.
2. **Nikdy přímo necommitovat na `main`** — produkce se aktualizuje pouze mergem PR `staging → main`.
3. **Každý dokončený úkol musí být commitnutý a pushnutý** — nenechávat rozdělanou práci bez commitu.
4. Staging URL s modrou hlavičkou (`NEXT_PUBLIC_APP_ENV=staging`) slouží k ověření změn před mergem.

### Vývojový cyklus

```
1. git checkout staging           # vždy začínat na staging
2. (vyvíjíš, editujeme soubory)
3. git commit + git push origin staging
4. ověření na ovt-git-staging-tombaais-projects.vercel.app
5. PR: staging → main             # po schválení uživatelem
6. merge → Vercel nasadí produkci + GHA spustí DB migrace
```

### Superpowers vývoj (feature branch)

Pro práci vedenou přes Superpowers flow (`brainstorming` → `writing-plans` →
`subagent-driven-development`, víceúkolové plány) platí jiný standard než pravidlo 1 výše:

- **Standard je samostatná větev ze `staging`** (ne přímý commit na `staging`) — pojmenovaná
  podle spec/plan souboru, např. `feat/2026-07-22-xlsx-invoice-support`.
- **Vždy potvrdit s uživatelem před založením** — jak se větev bude jmenovat a že se na ní
  začíná pracovat, nezakládat automaticky bez potvrzení.
- **Worktree (samostatný pracovní adresář) je na dotaz, ne automaticky** — hodí se, když má
  uživatel v hlavním adresáři rozdělanou práci nebo chce hlavní checkout nechat nedotčený;
  jindy stačí přepnout větev v současném adresáři.
- Task-by-task commit + push (pravidlo 3) platí i tady — jen cílí na feature větev, ne na
  `staging`.
- Po finální whole-branch review: **PR `feature větev → staging`** (ne přímo push na
  `staging`) — teprve tady proběhne review celého diffu najednou.
- Po schválení a mergi do `staging` následuje běžný cyklus výše (ověření na staging preview,
  pak PR `staging → main`).
- Reálné ověření v prohlížeči (Gemini analýza, upload do blob storage apod.) dělat na staging
  preview, ne lokálně — lokálně chybí `GEMINI_API_KEY` i `BLOB_READ_WRITE_TOKEN` a nemá smysl
  je tam dávat.

### DB migrace

Soubory v `supabase/migrations/` jsou **viditelné v PR diff** — uživatel v PR schválí přesný SQL před mergem.

Po mergi do `main` GitHub Action `db-migrate.yml` automaticky spustí nové `.sql` soubory přes `psql` na produkční databázi. **Už není třeba říkat uživateli, aby migraci spustil ručně** — děje se to samo.

**Stejný mechanismus funguje i pro staging**: GitHub Action `db-migrate-staging.yml` se triggeruje na push do větve `staging` a aplikuje nové `.sql` soubory na staging DB (`STAGING_DATABASE_URL`). `npm run db:push` tedy **není** potřeba — stačí commitnout a pushnout.

Při změně schématu:
- Uprav `src/db/schema.ts`
- Vytvoř migrační soubor `supabase/migrations/YYYYMMDD_HHMMSS_popis.sql` s odpovídajícím SQL
- Commitni oba soubory spolu — GHA aplikuje migraci automaticky (staging i produkce)

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint         # ESLint
npm run test:unit    # Vitest — unit testy čistých výpočtů (src/**/*.test.ts)
npm run test:watch   # Vitest ve watch módu
npm run test:e2e     # Playwright smoke testy (vyžaduje testovací DB — viz e2e/README.md)
npm run test:gemini  # integrační test Gemini analýzy dokladů (vyžaduje GEMINI_API_KEY, jinak vždy FAIL)
npm run db:push      # push Drizzle schema changes to Neon (dev/staging)
npm run db:studio    # Drizzle Studio — local DB browser
```

Pre-commit hook runs `npm run lint && npx tsc --noEmit && npm run test:unit` — always verify clean before committing.

## Testy

Strategie a závazná pravidla: `docs/superpowers/specs/2026-07-06-automaticke-testy.md`. Praktický průvodce (spouštění, validace testů, recepty na rozšíření vč. E2E průchodu akcí): `docs/TESTING.md`. Shrnutí:

- **Výpočty patří do čistých modulů** v `src/lib/` (bez DB/Next.js) s unit testy vedle souboru (`foo.ts` → `foo.test.ts`); server actions je jen volají po načtení dat z DB. Vzor: `src/lib/settlement-calc.ts` (algoritmus vyúčtování akce) volaný z `getEventSettlement`.
- **Bugfix výpočtu = nejdřív regresní test**, který chybu reprodukuje, pak fix.
- **E2E smoke** (`e2e/`) — stránky se vykreslí, auth funguje, data tečou. Nikdy nespouštět proti staging/produkční DB. Nová stránka/klíčový tok = přidat smoke test.
- CI: `.github/workflows/tests.yml` (push do `staging`, PR do `main`) — job `unit` (lint + tsc + Vitest) a job `e2e` (Postgres service + Playwright).

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

New migrations are committed to the branch, reviewed in PR diff, and **automatically applied to production by `db-migrate.yml` GHA on merge to `main`**. Never apply migrations manually to production — GHA handles it.

Never apply the drop-payment-columns migration (`20260405_210000_drop_payment_columns.sql`) until verifying the ledger V1 system works correctly in production.

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

Staging-only (Vercel Preview environment):
```
NEXT_PUBLIC_APP_ENV=staging   # zobrazí modrou hlavičku + staging banner
AUTH_URL                      # staging Vercel URL (pro správný OAuth callback)
DATABASE_URL                  # Neon staging branch connection string
FIO_API_TOKEN                 # vynechat — nezatahovat real bankovní data do staging DB
```

See `.env.example` for the full list with Czech comments.

## GitHub Actions workflows

| Workflow | Trigger | Co dělá |
|---|---|---|
| `tests.yml` | Push do `staging`, PR do `staging`/`main` | Unit (lint + tsc + Vitest) a E2E (Playwright + Postgres service) |
| `gemini-integration-test.yml` | PR do `staging`/`main` + manuálně | Integrační test Gemini analýzy nad vzorovými doklady (`test:gemini`), vyžaduje `GEMINI_API_KEY` secret |
| `db-backup.yml` | Každý den 02:00 UTC + manuálně | `pg_dump` → GitHub Artifact, retence 90 dní |
| `db-migrate.yml` | Push do `main` (jen pokud přibyly `.sql` soubory) | Spustí nové migrace z `supabase/migrations/` přes `psql` |
| `import-members-tj.yml` | `repository_dispatch` | Webhook pro import členů TJ |

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
