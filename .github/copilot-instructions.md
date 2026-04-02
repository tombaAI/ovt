# Project Guidelines

## Source Of Truth

- Treat `zadani/zadavaci_dokumentace_ovt_web.md` as the source of truth for business scope and functional requirements.
- Treat `zadani/technicka_oponentura_vercel_supabase_resend.md` as the source of truth for technical stack decisions.
- If earlier notes mention cheap Czech shared hosting, that was an older cost-constrained variant and does not override the current stack choice.

## Scope

- V1 is an internal admin-only application.
- Do not implement member self-service, public signup, or Fio bank synchronization unless explicitly requested.
- Multiple admins are supported.
- Google login is an optional future extension, not a phase-1 requirement.
- For phase 1, do not assume separate hosted dev, staging, and production environments are required.
- Prefer local development plus one hosted environment unless explicitly requested otherwise.
- Excel import is part of V1.

## Core Business Rules

- Fees, discounts, brigade penalties, boat tariffs, support-activity budgets, and email templates must be configurable per year in the database.
- Never hardcode yearly fee amounts, discount values, boat prices, or support-activity rules in application code.
- Boats are a separate entity. One member can own multiple boats and boat order matters for pricing.
- Board discount and TOM leader discount are category-based. Other discounts are individual.
- Brigade participation affects the next fee period, not only the current record.
- Support activity is a separate module with yearly budget, reservations, settlement, and a 200 CZK per member per day cap.
- V1 payment handling is manual. Future bank integration is an extension, not a starting point.

## Tech Stack

- Use Next.js App Router with TypeScript.
- Use npm.
- Use Fluent UI v9 for UI components.
- Use Supabase primarily for Postgres and optionally Storage.
- Do not assume Supabase Auth is required in phase 1.
- Use Resend for transactional email.
- Prefer server components, server actions, and route handlers over adding a separate backend service for V1.

## Security And Data Access

- Enforce explicit admin-only access even if the first phase uses simple authentication.
- Default to server-side data access for admin operations.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or any secret token to client code.
- Use service-role access only in narrow server-only code paths after explicit admin authorization.
- In phase 1, do not rely on direct browser-to-database access for domain data.
- RLS is a later security layer, not a mandatory phase-1 foundation.
- If RLS is introduced later, keep it default-deny and open only what is intentionally needed.

## Portability

- Minimize vendor lock-in by keeping core data in standard PostgreSQL tables and SQL migrations.
- Prefer server-side SQL or ORM access for core domain logic over Supabase-specific client APIs.
- Do not make Edge Functions, Storage, or dashboard-only configuration mandatory for core business flows unless explicitly needed.

## Database And Migrations

- Keep schema changes in versioned Supabase SQL migrations stored in the repository.
- Do not treat manual Supabase dashboard edits as the source of truth.
- Preserve historical data and auditability.
- Imports must be repeatable, validated, and logged.

## UX And Language

- The application is a Czech-language administrative UI.
- Optimize for member lists, filters, bulk actions, yearly overview screens, and member detail pages.
- Prefer explicit and inspectable calculations over hidden automation.

## Delivery Order

- Build in this order unless asked otherwise: simple admin access gate, member registry, imports, yearly fee configuration and calculations, manual payments and emailing, support activity module, optional Google login later.
- Keep the implementation simple. Do not turn V1 into a generic SaaS platform.