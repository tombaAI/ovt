# Výměna přílohy nákladu + kontrola shody částky s dokladem

## Kontext

Trigger: akce "Berounka 33" má u nezaplacené faktury (TMA) nahraný špatný soubor přílohy.
Částka je správně, měnit se nemá. Ukázalo se, že aplikace neumožňuje soubor přílohy
vyměnit vůbec — ani na produkci (kde nic není zamčené), protože:

- API endpoint `attach-file` odmítne nahrání, pokud `fileUrl` už není `null`
  (`"Doklad již má přiložený soubor"`).
- UI tlačítko „Přiložit fakturu" se zobrazí jen když `!expense.fileUrl`.

Během rozhovoru se zadání rozšířilo na obecnější kontrolu: při každé analýze dokladu
Geminim (nový náklad i výměna) se má zjištěná částka porovnat se zapsanou, a v případě
neshody se má viditelně upozornit v přehledu nákladů — protože z tohoto řádku se
generuje pokyn k úhradě hospodáři.

## Rozsah

- Kontrola neshody: **všechny** náklady akce (účtenky k proplacení členům i faktury
  k úhradě).
- Možnost vyměnit přílohu: **všude**, kde `fileUrl` existuje nebo neexistuje (obecně),
  ne jen u nezaplacených faktur.
- Guard (jen hospodář smí uložit neshodu): platí pouze když jsou náklady akce zamčené
  pro účastníky (`lockForParticipants` = vygenerované předpisy), protože tam je částka
  needitovatelná a jde současně do výpočtu předpisů.
- Mimo zamčený stav: žádný speciální guard, uživatel má částku editovatelnou přímo
  v dialogu výměny.

## 1. Datový model

Nový sloupec na `event_expenses`:

```sql
ALTER TABLE app.event_expenses ADD COLUMN analyzed_amount NUMERIC(10,2);
```

V `src/db/schema.ts` doplnit do `eventExpenses`:

```ts
analyzedAmount: numeric("analyzed_amount", { precision: 10, scale: 2 }),
```

Sémantika: poslední Gemini-zjištěná `total_amount` pro **aktuálně přiloženou** přílohu.
Plní se při každé analýze (nový náklad i výměna přílohy), nezávisle na tom, jakou
hodnotu si uživatel nakonec zapíše/ponechá do `amount`. Když se `amount` později ručně
opraví (mimo re-analýzu), `analyzedAmount` se nemění — neshoda tak zůstává viditelná,
dokud ji někdo aktivně nevyřeší (opravou částky, nebo novou výměnou přílohy).

Mismatch = `amount` a `analyzedAmount` se po zaokrouhlení na haléře neshodují. Žádné
samostatné tlačítko „ignorovat/potvrdit neshodu" neexistuje — jediné cesty k vyřešení
jsou oprava částky (přes stávající editační flow a jeho gates) nebo nová výměna přílohy
(přes flow popsaný níže).

Migrace: `supabase/migrations/YYYYMMDD_HHMMSS_add_expense_analyzed_amount.sql`.

## 2. Sdílená logika (refaktoring)

- **Gemini analýza dokladu**: dnes žije jen v `src/app/api/expenses/analyze/route.ts`
  (prompt, zod schéma, `generateObject` volání). Přesunout jádro do
  `src/lib/expense-analysis.ts` jako `analyzeExpenseFile(file: File): Promise<ExpenseAnalysis>`
  (+ export typu `ExpenseAnalysis`). Endpoint `/api/expenses/analyze` z toho jen zavolá
  a zabalí do response. Nový endpoint pro výměnu přílohy (níže) tuto funkci zavolá přímo,
  bez druhého HTTP roundtripu.
- **`isTreasurer(email)`**: dnes soukromá funkce v `src/lib/actions/event-settlement.ts`.
  Exportovat (nebo přesunout do `src/lib/treasurer.ts` a importovat na obou místech),
  aby ji mohl použít i nový endpoint pro výměnu přílohy.

## 3. API — přiložení/výměna souboru

Rozšířit `src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts` z
"jen první nahrání" na univerzální přiložení/výměnu, pro libovolný náklad
(isPaid true i false, s fileUrl i bez něj).

**Request:** `file` (File), `amount` (string — aktuální/upravená částka),
`confirmMismatch?: "true"`.

**Logika (v tomto pořadí):**

1. `lockForReimbursement` aktivní → 409 `"Nelze přikládat soubory — výdajový zámek je aktivní"`
   (beze změny oproti dnešku).
2. Načíst aktuální `amount` nákladu z DB.
3. Zavolat `analyzeExpenseFile(file)` → získat `analyzedAmount = analysis.total_amount`.
4. Pokud `lockForParticipants` (zamčené předpisy):
   - Server **ignoruje** klientem poslané `amount` — použije se výhradně aktuální
     hodnota z DB (obrana proti obejití zámku skrz tento endpoint).
   - Pokud `analyzedAmount` odpovídá aktuální částce → uložit rovnou (viz krok 6).
   - Pokud neodpovídá:
     - `!isTreasurer(session.user.email)` → 409, kód `"needs_treasurer"`, žádný zápis.
     - `isTreasurer(...)` a `confirmMismatch !== "true"` → 409, kód `"needs_confirmation"`,
       žádný zápis (UI podle kódu zobrazí checkbox a nechá znovu odeslat).
     - `isTreasurer(...)` a `confirmMismatch === "true"` → uložit (krok 6), `amount`
       beze změny.
5. Pokud `lockForParticipants` není aktivní: validovat a použít klientem poslané
   `amount` (mohla být v dialogu upravena) — bez treasurer gate, bez confirm kroku.
6. Uložení: pokud `expense.fileUrl` existoval, smazat starý blob (`del`); nahrát nový
   (`put`, stejná validace MIME/velikosti jako dnes); `UPDATE event_expenses SET
   file_url, file_name, file_mime, analyzed_amount, amount (jen když unlocked) WHERE id = ...`.
7. Response: `{ success: true, analysis }` nebo `{ error, code? }`.

**POST `/api/events/[id]/expenses`** (vytvoření nákladu) a **PATCH** (potvrzení/úprava):
doplnit nepovinné pole `analyzedAmount` (z aktuální Gemini analýzy na klientu, pokud
proběhla) — uloží se 1:1 do nového sloupce při vytvoření/potvrzení nákladu, aby i nově
založené náklady měly od začátku baseline pro budoucí kontrolu shody.

## 4. UI — dialog přiložení/výměny

Zobecnit `AttachFileDialog` (`event-expenses-tab.tsx`) z "jen když `!fileUrl && !isPaid`"
na dostupný pro libovolný náklad, gate `!lockedForReimbursement`. Nové tlačítko
"Vyměnit fakturu" (existující-li příloha) / "Přiložit fakturu" (bez přílohy) se objeví
u každého řádku dokladu.

**Průběh v dialogu:**

1. Výběr souboru → klient zavolá `/api/expenses/analyze` (čistě náhled, nic se
   neukládá) → zobrazit `AnalysisCard` (existující komponenta) + zvýrazněné porovnání
   "Zapsáno: X Kč / Zjištěno: Y Kč".
2. **Nezamčeno:** pole částky editovatelné, předvyplněné aktuální hodnotou nákladu,
   tlačítko "Použít zjištěnou částku" ji do pole zkopíruje. Uživatel může ponechat i
   upravit.
3. **Zamčeno** (`lockForParticipants`): částka zobrazena needitovatelně.
   - Shoda → normální tlačítko "Uložit".
   - Neshoda, uživatel není hospodář → žádné "Uložit"; jen chybová hláška
     ("Dokud jsou předpisy uzamčené, výměnu s neshodující se částkou může provést jen
     hospodář.") a "Zrušit".
   - Neshoda, uživatel je hospodář → checkbox "Rozumím, že se zjištěná částka
     neshoduje se zapsanou, přesto uložit" musí být zaškrtnutý, aby šlo kliknout na
     "Uložit" (odpovídá `confirmMismatch: true` v requestu; server-side re-check).
4. "Zrušit" kdykoliv → nic se neukládá, vybraný soubor se zahodí.

## 5. Zobrazení neshody v přehledu

- **`ExpenseItem`** (řádek nákladu): pokud `analyzedAmount != null` a neshoduje se s
  `amount`, zobrazit výrazný červený banner "Zjištěná částka z dokladu (Y Kč)
  neodpovídá zapsané (X Kč)" — nezávisle na `status`/`isPaid`.
- **`computeBlockingIssues`** (`event-expense-actions.tsx`): přidat kontrolu napříč
  `expenses` — počet nákladů s neshodou → nový blokující důvod pro "Odeslat
  vyúčtování", ve stejném stylu jako dnešní "nepotvrzeno" / "chybí účet".
- Vyžaduje protažení `analyzedAmount` přes `EventExpenseRow`
  (`src/lib/actions/event-expenses.ts`) a lokální `ExpenseRow` typ v
  `event-expense-actions.tsx`.

## Mimo rozsah (vědomě neřešeno)

- Žádné tlačítko "ignorovat neshodu" — legitimní rozdíly (např. faktura v EUR,
  zaplaceno v CZK) zůstávají viditelné jako varování, dokud je někdo neuzavře opravou
  částky nebo výměnou přílohy. Je to záměr, ne mezera.
- Kategorie/popis/příjemce nejsou součástí tohoto flow — ty se dál upravují přes
  stávající editační dialog (`ExpenseEditDialog`), beze změny.
- Návrh se netýká `AddExpenseForm`/`DraftProcessDialog` flow kromě doplnění
  `analyzedAmount` při ukládání — vytváření nových nákladů (draft/unconfirmed) zůstává
  jinak beze změny, protože při zamčených předpisech nejde nové náklady zakládat vůbec
  (existující gate na POST endpointu).

## Testing / ověření

Bez automatických testů (repo pravidlo) — ověření přes lint + `tsc --noEmit` a ruční
průchod na stagingu:
1. Nezamčená akce: výměna přílohy s neshodou → uložit se zjištěnou i ponechanou
   částkou, banner se objeví/zmizí podle shody.
2. Zamčená akce (`lockForParticipants`), běžný uživatel, neshoda → žádné Uložit.
3. Zamčená akce, hospodář (`TREASURER_EMAIL`), neshoda → checkbox → Uložit projde,
   částka beze změny, `analyzedAmount` uložen, banner v přehledu i blokující důvod u
   "Odeslat vyúčtování" se objeví.
4. Případ Berounka 33 na produkci i stagingu: výměna špatné přílohy TMA faktury bez
   zásahu do částky.
