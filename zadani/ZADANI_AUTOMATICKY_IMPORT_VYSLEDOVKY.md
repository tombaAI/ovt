# Zadání: Automatický import výsledovky z e-mailu

Návrh k realizaci — automatizace pravidelného importu PDF výsledovky (`importTjFinancePdf`), která dnes chodí mailem a nahrává se ručně přes dialog na stránce Finance.

---

## Byznys případ

Účetní systém TJ posílá pravidelně (nepravidelně během dne) e-mail s předmětem **„Sestavy TJ Bohemians"** na adresu `tomas.bauer@bohemianstj.cz`, obsahující přílohu `Výsledovka_po_střediscích_dokladově.pdf` — transakční detail výsledovky po střediscích, doklad po dokladu.

Dnes tento soubor musí administrátor:
1. Stáhnout z mailu
2. Otevřít stránku Finance → tlačítko „Importovat PDF"
3. Ručně nahrát soubor

Cíl: tento krok odstranit. **Etapa 1 (toto zadání):** jen automatický import (ekvivalent ručního nahrání). Automatické párování transakcí na příspěvky (`TjAllocation`) **zůstává mimo rozsah** — řeší se later, ne teď.

---

## Co se má změnit

### 1. Refaktoring `src/lib/actions/finance-tj.ts`

Z `importTjFinancePdf(formData)` vyčlenit čistou zpracovací funkci, beze změny existující logiky (parsování PDF, dedup podle `docNumber:accountCode`, detekce podezřelých transakcí):

```ts
export async function processTjFinancePdfBuffer(
    buffer: Buffer,
    fileName: string,
    importedBy: string,
): Promise<ImportResult>
```

Stávající server action `importTjFinancePdf(formData)` (volaný z `import-dialog.tsx`) se zjednoduší na tenký wrapper:
1. ověří `auth()` session (jako dnes)
2. přečte soubor z `formData`
3. zavolá `processTjFinancePdfBuffer(buffer, file.name, session.user.email)`

Ruční upload v UI se chováním nezmění.

### 2. Nový webhook endpoint

**Nový soubor:** `src/app/api/webhooks/finance-import/route.ts`

Stejný vzor jako existující `src/app/api/webhooks/import_members_tj_bohemians/route.ts`:

```ts
export async function POST(request: NextRequest) {
    if (!isWebhookAuthorized(request, "IMPORT_SECRET_FINANCE")) {
        return unauthorizedResponse();
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Chybí soubor" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processTjFinancePdfBuffer(buffer, file.name, "gmail-automation");
    return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
```

Ověření: `isWebhookAuthorized()` z `src/app/api/webhooks/_auth.ts` — Bearer token proti nové env proměnné `IMPORT_SECRET_FINANCE` (stejný princip jako `IMPORT_SECRET_TJ`).

Pole `file` ve `FormData` musí odpovídat stejnému názvu, jaký dnes posílá prohlížeč (`import-dialog.tsx` řádek `<input ... name="file">`) — díky tomu je tělo požadavku identické, ať přijde z UI nebo z Apps Scriptu.

### 3. Google Apps Script (mimo repozitář)

Skript bude vytvořen a spravován přímo v Google účtu (script.google.com), který je vlastníkem cílové Gmail schránky. Není součástí git repozitáře.

**Konfigurace** (Script Properties, ne natvrdo v kódu):
- `WEBHOOK_URL` — `https://is.ovtbohemians.cz/api/webhooks/finance-import` (produkce)
- `WEBHOOK_SECRET` — hodnota `IMPORT_SECRET_FINANCE`
- `ALERT_EMAIL` — e-mail pro chybová upozornění

**Časový trigger:** `ScriptApp.newTrigger('checkForVysledovka').timeBased().everyMinutes(10).create()`

**Logika funkce `checkForVysledovka()`:**

```
1. Zajistit existenci labelů OVT/Vysledovka, OVT/Vysledovka-hotovo, OVT/Vysledovka-chyba
   (GmailApp.createLabel, pokud ještě neexistují)

2. threads = GmailApp.search('label:OVT/Vysledovka -label:OVT/Vysledovka-hotovo')

3. Pro každé thread:
   a. message = poslední zpráva ve vlákně
   b. attachment = první příloha s content type application/pdf
   c. pokud attachment neexistuje → selhání (bod 4)
   d. response = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: 'post',
        headers: { Authorization: 'Bearer ' + WEBHOOK_SECRET },
        payload: { file: attachment },
        muteHttpExceptions: true
      })
   e. pokud response.getResponseCode() je 200 a tělo obsahuje success:true:
        - thread.addLabel(hotovoLabel)
        - thread.removeLabel(chybaLabel)  // pokud tam byl
      jinak → selhání (bod 4)

4. Při selhání:
   - pokud thread JEŠTĚ NEMÁ label OVT/Vysledovka-chyba:
       - MailApp.sendEmail(ALERT_EMAIL, 'Import výsledovky selhal', <detail chyby>)
       - thread.addLabel(chybaLabel)
   - thread zůstává ve frontě (bez -hotovo), zkusí se znovu příští běh
```

Díky tomu: e-mail o chybě přijde **jednou** za incident, ne opakovaně každých 10 minut; jakmile problém zmizí (aplikace zase běží, PDF se opraví), skript automaticky domckne import při dalším běhu bez zásahu.

**Jednorázová autorizace:** při prvním spuštění/nasazení triggeru Google vyžádá souhlas s přístupem ke Gmailu (`GmailApp`) a externím URL (`UrlFetchApp`) — standardní OAuth dialog Apps Scriptu, mimo tuto aplikaci.

### 4. Gmail filtr (nastavení Gmailu, ne kód)

V cílové Gmail schránce vytvořit filtr:
- **Kritérium:** `from:tomas.bauer@bohemianstj.cz subject:"Sestavy TJ Bohemians"`
- **Akce:** přidat label `OVT/Vysledovka`

### 5. Přesměrování z `bohemianstj.cz` schránky

Na zdrojové schránce (`tomas.bauer@bohemianstj.cz`) nastavit pravidlo/filtr, které příchozí mail odpovídající stejnému kritériu (odesílatel účetního systému, předmět „Sestavy TJ Bohemians") přeposílá na Gmail účet, kde běží Apps Script. Konkrétní postup závisí na tom, jestli je tato schránka Google Workspace nebo jiná platforma (Exchange/Outlook apod.) — řeší se v administraci mailové schránky, mimo tento repozitář.

---

## Datový tok (celý řetězec)

```
Účetní systém
  → e-mail "Sestavy TJ Bohemians" + příloha PDF
  → tomas.bauer@bohemianstj.cz
  → přesměrování (mailbox rule)
  → cílová Gmail schránka
  → Gmail filtr přidá label OVT/Vysledovka
  → Apps Script (trigger každých 10 min) najde nezpracované vlákno
  → stáhne PDF přílohu
  → POST /api/webhooks/finance-import (Bearer secret)
  → processTjFinancePdfBuffer() — stejná parsovací/dedup logika jako ruční import
  → { success, importId, added, matched, conflicts, suspicious }
  → Apps Script označí vlákno OVT/Vysledovka-hotovo
  → záznam viditelný v historii importů na stránce Finance, importedBy = "gmail-automation"
```

---

## Co se nemění

- Ruční upload PDF přes dialog na stránce Finance (`import-dialog.tsx`) — funguje stejně jako dnes, jen interně volá vyčleněnou funkci.
- Parsovací logika (`parseTjFinancePdf`), dedup podle `docNumber:accountCode`, detekce podezřelých transakcí (`isSuspect`) — beze změny.
- Automatické párování transakcí na příspěvky (`TjAllocation`, `createTjAllocation`) — zůstává ruční, mimo rozsah tohoto zadání.
- Import „Hospodaření oddílů" (`importTjHospodareniPdf`) — samostatný PDF report, tímto zadáním nedotčen.
- Žádná změna DB schématu, žádná migrace.

---

## Technické podklady

### Aktuální stav kódu

- `src/lib/actions/finance-tj.ts:73` — `importTjFinancePdf(formData)`, dnes vyžaduje `auth()` session, nelze volat mimo přihlášeného uživatele.
- `src/app/api/webhooks/_auth.ts` — `isWebhookAuthorized(request, envVar)`, `unauthorizedResponse()` — hotový vzor pro token-based auth webhooků, per-webhook env proměnná.
- `src/app/api/webhooks/import_members_tj_bohemians/route.ts` — existující webhook podle stejného vzoru (`IMPORT_SECRET_TJ`), referenční implementace pro nový endpoint.
- `src/app/(admin)/dashboard/finance/import-dialog.tsx` — UI dialog, `FormData` s polem `file`, volá `importTjFinancePdf`.
- `import_fin_tj_imports.imported_by` (`src/db/schema.ts`) — sloupec `text().notNull()`, žádná FK na `admin_users` — libovolný string (např. `"gmail-automation"`) projde bez problému a odliší se v historii importů od e-mailů administrátorů.

### Soubory ke změně / vytvoření

| Soubor | Změna |
|---|---|
| `src/lib/actions/finance-tj.ts` | Vyčlenit `processTjFinancePdfBuffer()` z `importTjFinancePdf()`; `importTjFinancePdf()` zůstává tenký wrapper nad ní |
| `src/app/api/webhooks/finance-import/route.ts` | **Nový soubor.** POST handler podle vzoru `import_members_tj_bohemians/route.ts` |
| Vercel env (produkce, případně staging) | Nová proměnná `IMPORT_SECRET_FINANCE` |
| Google Apps Script (mimo repo) | Nový skript v cílovém Gmail účtu — trigger, Script Properties, funkce `checkForVysledovka()` |
| Gmail nastavení (mimo repo) | Filtr → label `OVT/Vysledovka` |
| Mailbox `bohemianstj.cz` (mimo repo) | Přesměrovací pravidlo na cílový Gmail |

### Žádná DB migrace

Sloupec `imported_by` je `text`, bez FK — žádná změna schématu není potřeba.

---

## Bezpečnost

- Token-based auth webhooku identická s existujícím vzorem (`IMPORT_SECRET_TJ`) — samostatný secret per webhook, ne sdílený `CRON_SECRET`.
- Secret uložen jen ve Vercel env proměnných a ve Script Properties Apps Scriptu — nikde v gitu ani v kódu skriptu.
- Endpoint přijímá pouze PDF soubor, nevystavuje žádnou další DB operaci.

---

## Testovací plán

1. `curl -F "file=@vzorova_vysledovka.pdf" -H "Authorization: Bearer <staging-secret>" https://ovt-git-staging-tombaais-projects.vercel.app/api/webhooks/finance-import` — ověřit response a nový řádek v historii importů na staging.
2. Apps Script dočasně zamířený na staging URL — ruční spuštění `checkForVysledovka()` (bez čekání na trigger) na jednom testovacím labelovaném mailu, ověřit celý řetězec Gmail → webhook → DB → label `-hotovo`.
3. Test chybové větve: poslat neplatný/nesprávný PDF nebo dočasně rozbít secret → ověřit, že přijde přesně jeden alert e-mail a přidá se label `-chyba`.
4. Přepnout Script Property `WEBHOOK_URL` na produkci, zapnout časový trigger na produkčním schématu (10 min).
5. Ověřit na reálném příchozím mailu z účetního systému — zkontrolovat historii importů na `is.ovtbohemians.cz/dashboard/finance` a správnost `added/matched/conflicts/suspicious` počtů.

---

## Otevřené otázky

1. Je zdrojová schránka `bohemianstj.cz` Google Workspace, nebo jiná platforma (Exchange/Outlook)? Ovlivňuje to konkrétní postup nastavení přesměrování (krok mimo tento repozitář).
2. Cílová Gmail schránka pro automatizaci — potvrdit, že je to `bautom@gmail.com` (uživatel session).
3. Má se v historii importů (`import-history.tsx`) vizuálně odlišit automatický import od ručního (např. ikona/badge u `importedBy = "gmail-automation"`), nebo stačí zobrazit surový string jako dnes?
4. Etapa 2 (mimo rozsah tohoto zadání, jen pro budoucí referenci): automatické párování transakcí z výsledovky na `member_contributions` přes variabilní symbol, analogicky k `autoMatchLedgerEntry()` u bankovních plateb.
