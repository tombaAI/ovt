# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**OVT sprava** — internal management web app for OVT Bohemians (Czech water sports club). Admin-only interface, PC-first with mobile support. Deployed on Vercel with Neon (PostgreSQL).

See `zadani/popis_zadani_1.txt` for the full product spec (in Czech).

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint         # ESLint
npm run db:push      # push Drizzle schema changes to Neon (dev/staging)
npm run db:studio    # Drizzle Studio — local DB browser
```

No test runner configured yet.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Database ORM | Drizzle ORM (`drizzle-orm` + `drizzle-kit`) |
| Database | Neon PostgreSQL (via `postgres` npm package) |
| Auth | Auth.js v5 (`next-auth@beta`) — Google OAuth only |
| Forms | React Hook Form + Zod |
| Email | Resend |
| Deploy | Vercel |

## Architecture

```
src/
  auth.ts               # Auth.js config — Google provider, signIn callback
  middleware.ts          # Route protection: /dashboard/* requires auth
  app/
    layout.tsx           # Root layout (html/body, SpeedInsights)
    page.tsx             # Redirects / → /dashboard
    (admin)/             # Route group: protected admin pages
      layout.tsx         # Admin header (OVT nav bar, user name, logout)
      dashboard/
        page.tsx         # /dashboard — admin home
    login/
      page.tsx           # /login — Google sign-in button
    health/
      page.tsx           # /health — public runtime status page (no auth)
    api/
      auth/[...nextauth]/route.ts  # Auth.js handler
      health/            # JSON health endpoints (all force-dynamic)
      email/test/        # Test email sender
  lib/
    db.ts                # Drizzle client singleton (globalThis.__ovtDb)
    email.ts             # Resend client + email mode detection
    health.ts            # Shared health check functions (used by page + API)
    runtime-env.ts       # RuntimeFlags — reads all env vars
  db/
    schema.ts            # Drizzle schema (appSchema = pgSchema("app"))
  components/
    ui/                  # shadcn/ui components (auto-generated, don't edit)
```

### Auth flow

`src/auth.ts` uses JWT sessions (no DB adapter). The `signIn` callback queries `app.admin_users` — if the Google email is not there with `is_active = true`, sign-in is rejected. Adding an admin = insert a row into `app.admin_users`.

### DB client (`src/lib/db.ts`)

Drizzle over `postgres` package with `globalThis` singleton. SSL auto-detected: off for localhost, `require` otherwise. `max: 1` pool for serverless.

### Health checks

`src/lib/health.ts` contains `checkDatabase()` and `checkEmail()` — used both by the `/health` page (server-side) and `/api/health/db` route.

### Email modes

`src/lib/email.ts` — three modes from env vars:
- `disabled` — no `RESEND_API_KEY`
- `test` — API key + no `MAIL_FROM` → sends via `onboarding@resend.dev`
- `custom` — API key + `MAIL_FROM` set → production sending

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Yes | JWT signing secret (`npx auth secret`) |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth Client Secret |
| `ADMIN_EMAILS` | Yes | Comma-separated admin emails (used in /api/health) |
| `APP_BASE_URL` | Optional | Full app URL for email links |
| `RESEND_API_KEY` | Optional | Enables email sending via Resend |
| `MAIL_FROM` | Optional | Custom from address (enables `custom` email mode) |
| `MAIL_REPLY_TO` | Optional | Reply-to address |
| `MAIL_TEST_TO` | Optional | Override recipient for test emails |

## Database

Schema lives in `src/db/schema.ts` (Drizzle). All tables are in the `app` PostgreSQL schema.

SQL migrations live in `supabase/migrations/` — apply manually via Neon SQL Editor. Drizzle is used for ORM queries, not for running migrations in production.

For schema changes during development: edit `src/db/schema.ts` → `npm run db:push`.

## Design

OVT brand colors used in Tailwind classes:
- Primary green: `#327600`
- Nav charcoal: `#26272b`
- Sage accent: `#82b965`

shadcn/ui components use Zinc base color with CSS variables. Do not edit files in `src/components/ui/` directly — reinstall via `npx shadcn@latest add <component>`.
