# E2E smoke testy (Playwright)

Kontext a strategie: `docs/superpowers/specs/2026-07-06-automaticke-testy.md`.

**Nikdy nespouštět proti staging/produkční DB** — seed zapisuje testovací data
(členové 990001/990002, admin `e2e-admin@test.local`, období 2026). Seed má pojistku
`E2E_ALLOW_SEED=1`.

## CI

Běží automaticky v `.github/workflows/tests.yml` (push do `staging`, PR do `main`):
Postgres service container → přehrání všech migrací ze `supabase/migrations/` →
seed → `next build`/`start` → Playwright.

## Lokální spuštění (bez Dockeru — PGlite)

`e2e/local-db.mjs` zvedne in-memory Postgres (PGlite přes TCP) a přehraje do něj
všechny migrace — žádný Docker ani síť ven:

```bash
# 1. Testovací DB (nechat běžet v samostatném terminálu)
node e2e/local-db.mjs

# 2. Seed + testy (druhý terminál; jeden shell, ať env platí pro všechno)
export DATABASE_URL=postgres://postgres:test@127.0.0.1:54329/postgres
export AUTH_SECRET=e2e-test-secret
export ADMIN_EMAILS=e2e-admin@test.local
export TREASURER_EMAIL=e2e-admin@test.local  # e2e admin je zároveň hospodář (testy sekce Provoz)
export TREASURER_EMAIL_TOM=e2e-tom@test.local  # samostatný e2e admin jako hospodářka oddílu TOM (testy druhého oddílu v sekci Provoz)
export AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy
E2E_ALLOW_SEED=1 node e2e/seed.mjs
npx playwright install chromium   # jen poprvé
npm run test:e2e
```

Alternativa s Dockerem: `docker run --rm -d --name ovt-e2e -p 54329:5432 -e
POSTGRES_PASSWORD=test postgres:16`, migrace přehrát přes
`docker exec -i ovt-e2e psql -U postgres -v ON_ERROR_STOP=1 < soubor.sql`.

Pozn.: PGlite socket obslouží jedno spojení naráz — `drizzle-kit push` se přes
něj zasekne (aplikace i seed fungují). Migrace musí zůstat přehratelné od nuly;
hlídá to CI job `e2e` i `local-db.mjs`.

Playwright si sám spustí `next dev` na portu 3100 (`E2E_PORT` pro změnu). Auth se řeší
podepsanou session cookie (`auth.setup.ts`) — Google OAuth se nevolá; `RESEND_API_KEY`
a `FIO_API_TOKEN` nechat nenastavené (mail disabled, žádná banka).
