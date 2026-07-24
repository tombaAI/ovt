# Průvodce automatickými testy

> Průvodní dokument k realizaci zadání [docs/superpowers/specs/2026-07-06-automaticke-testy.md](superpowers/specs/2026-07-06-automaticke-testy.md).
> Zadání říká *co a proč*; tento dokument říká *co přesně vzniklo, jak to používat,
> jak si ověřit, že testy fungují, a jak na ně navázat*. Udržovat aktuální při každém
> rozšíření testů.

---

## 1. Manažerské shrnutí

**Problém:** do 2026-07-06 neexistovala žádná automatická kontrola chování aplikace —
jen lint a typová kontrola. Regrese ve výpočtech (issue #28: dvojí započtení propadlé
zálohy) se odhalily až v reálných datech členů.

**Řešení:** tři vrstvy automatické kontroly, které běží po každé změně:

| Vrstva | Nástroj | Chrání | Kdy běží |
|---|---|---|---|
| Statická | ESLint + tsc | typy, syntax | pre-commit + CI |
| Unit (39 testů) | Vitest | algoritmus vyúčtování akcí, kontroly shody s dokladem | pre-commit (~0,2 s) + CI |
| UI/E2E smoke (9 testů) | Playwright | přihlášení, vykreslení všech hlavních stránek, tok dat DB → UI | CI (push do `staging`, PR do `main`) |

**Vedlejší přínosy** (testy je odhalily hned první den):

1. Kanonický výpočet vyúčtování žil ve dvou kopiích, které se už rozešly → sjednoceno
   do jednoho testovaného modulu; shoda ověřena na reálných datech akcí Kamenice a Isel
   (staré vs. nové = identická čísla; živý výpočet == všech 38 předpisů uložených v DB).
2. Migrace nešly přehrát od nuly a část schématu žádnou migraci neměla → opraveno,
   CI to od teď hlídá při každém pushi.
3. `drizzle-kit push` celou dobu tiše ignoroval aplikační schéma `app` → opraveno
   v `drizzle.config.ts`.
4. ⚠️ Kód **stále používá** legacy sloupce `member_contributions.is_paid` a tabulku
   `payments` — připravené drop migrace (`20260405_210000`, `20260414_110000`) se
   nesmí aplikovat, dokud se použití neodstraní z kódu.

**Pravidla do budoucna (definice hotovo):** nová výpočetní logika = čistý modul + unit
testy; bugfix výpočtu = nejdřív regresní test; nová stránka/tok = smoke test; PR do
`main` vyžaduje zelený workflow `Tests`.

---

## 2. Mapa souborů

```
vitest.config.ts               # konfigurace unit testů (node env, src/**/*.test.ts)
playwright.config.ts           # konfigurace E2E (setup projekt pro auth, webServer)
src/lib/
  settlement-calc.ts           # čisté funkce výpočtu vyúčtování (kroky 1–8 zadání)
  settlement-calc.test.ts      # 27 testů algoritmu vč. regresí a vzorového průchodu
  expense-mismatch.ts          # shoda částky s dokladem + brána zamčených předpisů
  expense-mismatch.test.ts     # 12 testů
e2e/
  README.md                    # lokální spuštění krok za krokem
  auth.setup.ts                # podepsání Auth.js session cookie (obchází Google OAuth)
  seed.mjs                     # idempotentní testovací data (pojistka E2E_ALLOW_SEED=1)
  local-db.mjs                 # in-memory Postgres (PGlite přes TCP) — bez Dockeru
  smoke.spec.ts                # 9 smoke testů
.github/workflows/tests.yml    # CI: job unit + job e2e
vitest.gemini.config.ts        # konfigurace Gemini integračního testu (samostatný include)
e2e/
  gemini/
    expense-analysis.integration.test.ts   # volá analyzeExpenseFile() nad reálnými vzorky
  fixtures/gemini-samples/     # vzorové doklady (JPG/PDF/XLS) + <soubor>.expected.json
.github/workflows/gemini-integration-test.yml   # CI: PR do staging/main + workflow_dispatch
.husky/pre-commit              # lint && tsc --noEmit && test:unit
```

---

## 3. Jak testy spouštět

| Příkaz | Co dělá | Potřebuje |
|---|---|---|
| `npm run test:unit` | Vitest jednorázově (39 testů, ~0,2 s) | nic |
| `npm run test:watch` | Vitest ve watch módu při vývoji | nic |
| `npm run test:e2e` | Playwright smoke | testovací DB + env, viz níže |
| `npx playwright test --ui` | E2E s interaktivním UI (debugování) | totéž |
| `npm run test:gemini` | Integrační test Gemini analýzy nad reálnými doklady | `GEMINI_API_KEY` (bez něj vždy FAIL, ne skip) |

**Lokální E2E bez Dockeru** (na stroji je blokovaný port 5432 a Docker chybí — proto
`local-db.mjs`):

```bash
# terminál 1 — in-memory DB, přehraje všech 81 migrací od nuly
node e2e/local-db.mjs

# terminál 2
export DATABASE_URL=postgres://postgres:test@127.0.0.1:54329/postgres
export AUTH_SECRET=e2e-test-secret ADMIN_EMAILS=e2e-admin@test.local
export AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy
E2E_ALLOW_SEED=1 node e2e/seed.mjs
npm run test:e2e
```

Playwright si sám spustí `next dev` na portu 3100. Detaily a Docker alternativa:
[e2e/README.md](../e2e/README.md).

**V CI:** workflow `Tests` běží automaticky; při pádu E2E se nahraje artifact
`playwright-report` (HTML report + trace + snapshoty stránek) — stáhnout z detailu
běhu v GitHub Actions.

---

## 4. Detail realizace

### 4.1 Unit vrstva — princip „výpočty do čistých modulů"

Server actions (`src/lib/actions/*`) nesmí počítat inline — načtou data z DB, adaptují
je a volají čisté funkce ze `src/lib/`. Jen čisté funkce jdou testovat bez mocků.

Vzorová realizace: `getEventSettlement` (event-settlement.ts) je nyní jen „DB adaptér"
nad `settlement-calc.ts`. Před zapojením byl `settlement-calc.ts` nezapojený duplikát,
který stihl driftovat (chyběl floor dotace z fixu `66ab632`) — přesně proto testy mrtvého
kódu nemají smysl a modul se musel zapojit.

Testy jsou pojmenované **podle chování česky** („propadlá záloha se odečte jen jednou"),
ne podle názvů funkcí — čtou se jako specifikace. Pokrývají mj. regrese:

- issue #28 — propadlá záloha snižuje náklad jen jednou (krok 2 + odpočet v kroku 8),
- fix `66ab632` — dotace na člena se zaokrouhluje dolů už v kroku 6,
- jediné zaokrouhlení nahoru per účastník (krok 7), doplatek = součet už zaokrouhlených
  částek (krok 8), tolerance floatů v `ceilMoney`.

Poslední `describe` blok je **vzorový průchod kroky 1–8 na mini akci** — ruční výpočet
dle zadání porovnaný s výstupem funkcí. Při změně algoritmu začni tam.

### 4.2 E2E vrstva — jak funguje auth, data a assertion

- **Auth:** aplikace má jen Google OAuth. `auth.setup.ts` podepíše Auth.js JWT session
  cookie stejným `AUTH_SECRET` jako server (salt = název cookie `authjs.session-token`).
  Kontrola `admin_users` běží jen v signIn callbacku při reálném loginu; middleware
  a server actions JWT pouze dekódují → podepsaná cookie stačí.
- **Data:** DB se staví **přehráním všech migrací od nuly** (stejný mechanismus jako
  produkční `db-migrate.yml`) + seed (`e2e/seed.mjs`: admin, 2 členové 990001/990002,
  období 2026 s předpisy). Seed je idempotentní a má pojistku `E2E_ALLOW_SEED=1`
  proti omylnému spuštění nad reálnou DB.
- **Assertions:** stránky renderují responzivní varianty (mobilní skryté) — vždy
  `getByText(...).filter({ visible: true })`. Detail člena není dialog, ale inline
  navigace přes `history.pushState` na `/dashboard/members/{id}`.
- **Externí služby v testech neběží:** `RESEND_API_KEY` nenastaven = mail disabled,
  `FIO_API_TOKEN` nenastaven = žádná banka, Google OAuth se nevolá,
  `AUTH_TRUST_HOST=true` je nutný pro `next start` mimo Vercel.

### 4.3 Co E2E odhalilo (případová studie hodnoty)

První běh proti DB od nuly shodil dashboard, členy i kalendář. Příčiny:

1. tři migrace kolidovaly se zpětně rozšířenými předchůdci (duplicitní rename/CREATE)
   → doplněny `IF (NOT) EXISTS` guardy (na staging/produkci se už nepouštějí),
2. `events.time_from/time_to/registration_from/registration_to` vznikly přes `db:push`
   bez migrace; drop migrace `payments`/`is_paid` na staging/prod nikdy neproběhly,
   ale kód sloupce čte → dorovnávací migrace `20260706_170000_align_schema_with_code.sql`
   (idempotentní, na staging/produkci no-op),
3. kořen driftu: `drizzle-kit push` s default `schemaFilter: ["public"]` schéma `app`
   zcela ignoroval a hlásil „No changes detected".

---

## 5. Jak si ověřit, že testy jsou dobré (validace testů)

Test, který nikdy nezčervená, je bezcenný. Rychlé způsoby, jak si důvěru ověřit:

1. **Ruční mutace (5 minut, doporučeno po každém větším rozšíření):** záměrně rozbij
   pravidlo v `src/lib/settlement-calc.ts` a ověř, že testy spadnou. Např.:
   - v `computeSubsidyPerMember` nahraď `Math.floor` za `Math.round` → musí spadnout
     „dotace se zaokrouhluje DOLŮ",
   - v `calcParticipantForfeit` smaž `Math.max(0, …)` → musí spadnout „nikdy nedá
     zápornou propadlou částku",
   - v `ceilMoney` změň `1e-9` na `0` → musí spadnout test tolerance floatů.
   Pak `git checkout src/lib/settlement-calc.ts`.
2. **Mutace E2E:** dočasně vrať `getByRole("dialog")` do testu detailu člena, nebo
   v seedu přejmenuj člena — smoke musí spadnout. E2E ověřuje i migrace: smaž lokálně
   guard z `20260413_110000` a `node e2e/local-db.mjs` musí selhat.
3. **Křížová kontrola s realitou:** vzorový průchod v testech odpovídá ručnímu výpočtu
   dle `docs/superpowers/specs/2026-06-24-vypocet-nakladu-akce.md`. Při pochybnosti spočítej scénář
   ručně na papíře a porovnej s testem — test je jen zápis ručního výpočtu.
4. **Volitelně coverage:** `npm i -D @vitest/coverage-v8` a `npx vitest run --coverage`
   — sleduj pokrytí `src/lib/settlement-calc.ts` a `expense-mismatch.ts` (mělo by být
   ~100 %; nízké pokrytí jiných čistých modulů = kandidáti na doplnění).

---

## 6. Jak navázat — recepty

### 6.1 Unit test nové/existující výpočetní logiky

1. Logika musí být v čistém modulu `src/lib/<nazev>.ts` — žádný import `getDb`,
   `next/*`, `auth`. Pokud je zapletená v server action, nejdřív ji vytáhni
   (vzor: `settlement-calc.ts` ↔ `event-settlement.ts`).
2. Test vedle modulu: `src/lib/<nazev>.test.ts`, česky pojmenované chování.
3. `npm run test:watch` při vývoji; commit ji spustí automaticky.

Kandidáti k vytažení a otestování (v pořadí hodnoty):
- **auto-matcher plateb** (`reconciliation.ts`, ~1000 řádků) — párování VS/částek,
  rozhodování confirmed/suggested; nejrizikovější netestovaná logika v repu,
- výpočty předpisů příspěvků (`contributions.ts` / `contribution-periods.ts`),
- parsování výsledovky (`parsers/tj-finance-parser.ts`) — testy nad vzorovým PDF.

### 6.2 Regresní test bugfixu (povinný postup)

1. Reprodukuj chybu testem, který **selže** (červený).
2. Oprav kód → test zezelená.
3. Commitni test i fix spolu; do popisu testu dej odkaz na issue/commit
   (vzor: „regrese fixu 66ab632" v settlement-calc.test.ts).

### 6.3 Nový smoke test stránky

Do `e2e/smoke.spec.ts` přidej záznam do pole `pages`:

```ts
{ path: "/dashboard/brigades", probe: /Brigády|nějaký seedovaný text/ },
```

Pokud stránka potřebuje data, doplň je do `e2e/seed.mjs` (idempotentně —
`on conflict do nothing` / `where not exists`).

### 6.4 Kompletní průchod akcí (další velký krok)

Cíl: E2E scénář „od akce k předpisům" pokrývající celý životní cyklus. Doporučený
rozsah v1 (vyhýbá se externím službám — Gemini analýza dokladů, Resend, Vercel Blob):

1. **Seed** (rozšířit `e2e/seed.mjs`): akce (`events`: name, year=2026, event_type,
   date_from, subsidy_per_member=1000), 2–3 přihlášky (`event_registrations` +
   `event_registration_participants`, z toho jeden člen 990001), záloha
   (`event_payment_prescriptions` type=deposit, status=matched) a 2 finální náklady
   (`event_expenses` status='final', jeden split_all, jeden per_registration
   s alokacemi) — **bez souborů** (file_url=null, to je podporovaný stav „faktura
   bez dokladu").
2. **Test — čtení:** otevřít `/dashboard/events/{id}`, záložku Náklady, ověřit
   vypočtené částky proti ručně spočítaným hodnotám (stejná čísla, jaká hlídá
   unit vzorový průchod — tady se ověřuje DB → adaptér → UI, ne algoritmus).
3. **Test — zápis:** kliknout „zamknout vyúčtování" (lockBilling), ověřit vznik
   settlement předpisů a částek na záložce Platby; případně odhlásit účastníka
   s politikou propadnutí a ověřit přepočet.
4. **Pásmo jistoty:** po zápisovém testu ověřit i audit log (tabulka audit_log —
   dle ADR-0002 má být každý zásah rekonstruovatelný).

Praktické poznámky:
- selektory si ověř přes `npx playwright test --ui` nebo `npx playwright codegen
  http://localhost:3100` (s běžícím local-db + dev serverem),
- zápisové testy izoluj do vlastního souboru (`e2e/event-flow.spec.ts`) a používej
  vlastní seedovaná ID (99xxxx), ať nekolidují se smoke testy,
- PGlite drží data jen po dobu běhu `local-db.mjs` — každý běh začíná načisto,
  v CI je DB taky vždy čerstvá; testy tedy nemusí po sobě uklízet.

### 6.5 Další vrstvy (roadmapa, zatím nezahájeno)

- **Integrační testy server actions** (Vitest + reálná DB přes `local-db.mjs`):
  volat přímo `lockBilling()` apod. a kontrolovat DB stav — rychlejší a stabilnější
  než UI pro hraniční případy; vyžaduje mock `auth()` a `revalidatePath`.
- **Komponentové testy** (Testing Library + jsdom) — až pokud se objeví třída regresí
  v klientských komponentách, které smoke nechytí.
- **Vizualní regrese** (Playwright screenshots) — až se ustálí design.

### 6.6 Gemini integrační test — přidání nového vzorku

Zadání: `docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md`.

Přidání nového vzorového dokladu (edge-case, nová kategorie apod.) = 2 nové soubory
do `e2e/fixtures/gemini-samples/`, **bez úpravy testovacího kódu** (dynamický glob):

1. Soubor dokladu (JPG/PNG/PDF/XLS/XLSX) — reálný, ne uměle jednoduchý.
2. `<soubor>.expected.json`:
   ```json
   { "total_amount": 1234.50, "account_code": "518/009", "approvedAmount": 1234.50 }
   ```
   `approvedAmount` != `total_amount` jen když je vzorek záměrně vybraný na testování
   rozporu (např. zahraniční doklad v cizí měně) — jinak stejná hodnota jako
   `total_amount`. Volitelné `amountTolerance`, pokud je u vzorku znám důvod k odchylce
   od přesné shody.

Kontrola citlivých dat (jméno/adresa člena na dokladu) před commitem je na tom, kdo
vzorek přidává — mimo rozsah automatizace.

Lokální běh bez `GEMINI_API_KEY` vždy selže (`ExpenseAnalysisConfigError`) — to je
očekávané, ne bug; reálné ověření běží v CI (`gemini-integration-test.yml`) s
nastaveným secretem.

---

## 7. Omezení a troubleshooting

| Symptom | Příčina / řešení |
|---|---|
| `npm run test:e2e` → „AUTH_SECRET musí být nastaven" | chybí export env proměnných (viz §3) |
| E2E lokálně: connection refused na 54329 | neběží `node e2e/local-db.mjs` |
| `drizzle-kit push` se zasekne proti local-db | PGlite socket obslouží jen 1 spojení — push přes něj nepouštět; migrace se píšou ručně (workflow v CLAUDE.md) |
| CI e2e padá na migraci | migrace nejsou replayable od nuly — oprav soubor (guardy), lokálně ověř `node e2e/local-db.mjs` |
| stránka v testu „hidden" element | responzivní duplicitní render — použij `.filter({ visible: true })` |
| test čeká na `getByRole("dialog")` | detaily jsou inline pushState navigace, ne dialogy (kromě skutečných modálů) |
| unit testy zelené, ale výpočet v UI špatně | chyba v DB adaptéru (`event-settlement.ts`), ne v algoritmu — kandidát na integrační test §6.5 |

Prostředí vývojového stroje: odchozí port 5432 blokován (Neon nedostupný lokálně,
data číst přes Neon MCP), Docker/psql nenainstalovány — proto PGlite. Staging Vercel
má jiný `AUTH_SECRET` než `.env.local`, podepsaná cookie tam nefunguje (správně).
