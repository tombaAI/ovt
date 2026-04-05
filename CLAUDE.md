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

Pre-commit hook runs `npm run lint && npx tsc --noEmit` — always verify clean before committing.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Database ORM | Drizzle ORM |
| Database | Neon PostgreSQL (via `postgres` npm package) |
| Auth | Auth.js v5 (`next-auth@beta`) — Google OAuth only |
| Email | Resend |
| Deploy | Vercel (auto-deploy from main) |

## File structure

```
src/
  auth.ts               # Auth.js config — Google provider, signIn callback
  middleware.ts          # Route protection: /dashboard/* requires auth
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
        contributions/   # Contribution management
          page.tsx           # Server: queries member_contributions + payments aggregate
          contributions-client.tsx
          payment-sheet.tsx  # Detail sheet: payment list, add payment, todo
  lib/
    db.ts                # Drizzle client singleton (globalThis.__ovtDb)
    actions/
      members.ts         # All member server actions
      contributions.ts   # Contribution + payment server actions
    member-fields.ts     # Czech field labels for audit log display
    constants.ts         # CONTRIBUTION_YEAR
  db/
    schema.ts            # Drizzle schema — all tables
  components/
    ui/                  # shadcn/ui (do not edit — reinstall via CLI)
```

## Database schema (app.* PostgreSQL schema)

All tables live in the `app` schema. Schema defined in `src/db/schema.ts`.

| Table | Purpose |
|---|---|
| `members` | Core member data (name, login, email, phone, var. symbol, CSK number, note, todo_note) |
| `membership_years` | Per-year membership record (memberId, year, fromDate, toDate) — source of truth for "who was a member in year X" |
| `contribution_periods` | One row per year (amounts, discounts, status: draft/confirmed/collecting/closed) |
| `member_contributions` | Prescription per member per period (amounts, discounts, todo_note) |
| `payments` | Individual payment transactions linked to member_contributions (amount, paidAt, note) |
| `audit_log` | Change history for all member/payment operations |
| `admin_users` | Admin access list (email whitelist for Google OAuth) |
| `mail_events` | Outbound email audit trail |

### Key design decisions

- **`membership_years` is the source of truth** for member lists. The members page queries `membership_years INNER JOIN members LEFT JOIN member_contributions` for the selected year.
- **`payments` is the source of truth for payment state.** `paidTotal = SUM(payments.amount)` for a contribution; `isPaid` is derived, not stored. Old columns `paid_amount/paid_at/is_paid` still exist in DB but are unused by the app (to be dropped via `20260405_210000_drop_payment_columns.sql` after confirming production is stable).
- **`contribution_periods.status`** lifecycle: `draft → confirmed → collecting → closed`.
- **Audit log**: every field change, payment add/delete, todo set/resolved is logged to `audit_log` with `entityType="member"`, `entityId=memberId`.

### Migration files (supabase/migrations/)

Applied in order — do NOT apply the drop-payment-columns migration until verifying the app works correctly with the new payments table.

## Feature map

### Members page (`/dashboard/members`)
- URL param `?year=X` selects the year tab
- Filter pills: Všichni / Výbor / Vedoucí TOM / Individuální sleva / Část roku / Ke kontrole / **S úkolem**
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
- Filter pills: Problémy / Nezaplaceno / Nedoplatek / Přeplatek / Zaplaceno / **S úkolem** / Všichni
- Click row → opens `PaymentSheet`

### Payment detail sheet
- Prescription breakdown
- **Payment list**: individual payments from `payments` table, each deletable
- **Add payment form**: amount + date + note
- Paid total vs. prescription with balance (přeplatek/nedoplatek)
- **Todo section**: same pattern as member todo

## Auth flow

`src/auth.ts` uses JWT sessions. The `signIn` callback checks `app.admin_users` — if email not found with `is_active = true`, login is rejected.

## Design

OVT brand colors: primary green `#327600`, nav charcoal `#26272b`, sage `#82b965`.

Sheet width: `sm:max-w-3xl`. Sheet padding: `px-5 pb-8` on SheetContent, `px-0 pt-5 pb-4` override on SheetHeader.

shadcn/ui components use Zinc base. The Sheet component has its built-in `sm:max-w-sm` removed to allow width override via className.
