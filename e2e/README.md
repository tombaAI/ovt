# E2E smoke testy (Playwright)

Kontext a strategie: `zadani/ZADANI_AUTOMATICKE_TESTY.md`.

**Nikdy nespouštět proti staging/produkční DB** — seed zapisuje testovací data
(členové 990001/990002, admin `e2e-admin@test.local`, období 2026). Seed má pojistku
`E2E_ALLOW_SEED=1`.

## CI

Běží automaticky v `.github/workflows/tests.yml` (push do `staging`, PR do `main`):
Postgres service container → přehrání všech migrací ze `supabase/migrations/` →
seed → `next build`/`start` → Playwright.

## Lokální spuštění

```bash
# 1. Disposable Postgres (Docker)
docker run --rm -d --name ovt-e2e -p 54329:5432 -e POSTGRES_PASSWORD=test postgres:16

# 2. Schéma + seed + testy (jeden shell, ať env platí pro všechno)
export DATABASE_URL=postgres://postgres:test@localhost:54329/postgres
export AUTH_SECRET=e2e-test-secret
export ADMIN_EMAILS=e2e-admin@test.local
export AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy
for f in supabase/migrations/*.sql; do
  docker exec -i ovt-e2e psql -U postgres -v ON_ERROR_STOP=1 -q < "$f"
done
E2E_ALLOW_SEED=1 node e2e/seed.mjs
npx playwright install chromium   # jen poprvé
npm run test:e2e

# 3. Úklid
docker rm -f ovt-e2e
```

Playwright si sám spustí `next dev` na portu 3100 (`E2E_PORT` pro změnu). Auth se řeší
podepsanou session cookie (`auth.setup.ts`) — Google OAuth se nevolá; `RESEND_API_KEY`
a `FIO_API_TOKEN` nechat nenastavené (mail disabled, žádná banka).
