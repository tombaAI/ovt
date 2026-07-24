# Podpora XLS/XLSX faktur jako přílohy nákladu akce

## Kontext

Trigger: uživatel má fakturu ve formátu XLS a chce ji přiložit k nákladu akce stejným
způsobem jako dnes PDF nebo fotku účtenky. Upload dnes odmítne — `ALLOWED_MIME`
v `expenses/route.ts` i `attach-file/route.ts` povoluje jen `image/jpeg`, `image/png`,
`image/webp`, `image/heic`, `application/pdf`; frontendový `<input accept="...">` XLS
nenabídne vůbec.

## Rozsah

- Podpora **obou** formátů: legacy `.xls` (`application/vnd.ms-excel`) i moderní `.xlsx`
  (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
- **Plná AI analýza** stejně jako u PDF/fotky — Gemini má z XLS/XLSX vyčíst částku,
  kategorii, IČO/DIČ atd. Důvod: pokud analýza chybí (`analyzedAmount = null`), mismatch
  gate (`expense-mismatch.ts`) to bere jako trvalou neshodu — u zamčených akcí
  (`lockForParticipants`) by to natrvalo vyžadovalo hospodáře + ruční potvrzení při každém
  přiložení XLS. Ruční zadání bez analýzy proto není přijatelná alternativa.
- Validace typu souboru: MIME **nebo** přípona `.xls`/`.xlsx` jako záloha — prohlížeče
  občas hlásí pro Office soubory nespolehlivé/obecné MIME (např. `application/octet-stream`).
- Mimo rozsah: xlsx→PDF/obrázek konverze (nepotřebná — jde se přímo na text), CSV podpora
  (nebylo požadováno), úprava e2e testů (Gemini flow se dnes netestuje vůbec, viz níže).

## 1. Architektura a datový tok

`analyzeExpenseFile()` (`src/lib/expense-analysis.ts`) dnes posílá Gemini buď obrázek,
nebo binární PDF jako multimodální vstup. Gemini neumí přímo číst binární XLSX. Přidává
se druhá větev: soubor se rozparsuje knihovnou `xlsx` (SheetJS) na CSV text (po listech),
a ten se pošle Gemini jako **textový** obsah spolu s promptem — místo image/file části.
Zbytek pipeline (schema odpovědi, kategorizace, extrakce částky, mismatch gate) se
nemění.

Větev je centralizovaná v `analyzeExpenseFile()`, takže funguje automaticky i pro
`reanalyze` endpoint (ten volá stejnou funkci, jen s file rekonstruovaným z blobu) —
žádná duplicitní logika.

## 2. Nové soubory

### `src/lib/xlsx-extract.ts`

Čistý modul (bez DB/Next.js), dle konvence `src/lib/` + unit test vedle souboru:

```ts
export function extractTextFromSpreadsheet(buffer: Buffer): string
```

- `XLSX.read(buffer, { type: "buffer" })`
- pro každý list: `XLSX.utils.sheet_to_csv(sheet)`, prefixováno názvem listu (víc listů
  odděleno prázdným řádkem)
- ořez výsledného textu na rozumnou délku (např. 50 000 znaků) — pojistka proti
  extrémně velkým sešitům nafukujícím Gemini token cost; pro běžnou fakturu nikdy
  nenastane

### `src/lib/expense-file-validation.ts`

Sdílený allowlist a validace (dnes duplikováno v `expenses/route.ts` a
`attach-file/route.ts` — sjednocuje se při této úpravě):

```ts
export const EXPENSE_ALLOWED_MIME: Set<string>       // image/*, pdf + 2 nové xls mime
export const EXPENSE_SPREADSHEET_MIME: Set<string>   // jen ty 2 nové

export function isSpreadsheetFile(mime: string, fileName: string | null | undefined): boolean
export function isAllowedExpenseFile(mime: string, fileName: string | null | undefined): boolean
```

`isSpreadsheetFile`/`isAllowedExpenseFile` vrací `true` i podle přípony `.xls`/`.xlsx`,
pokud MIME neodpovídá (fallback pro nespolehlivé browser MIME).

## 3. Upravené soubory

- **`src/lib/expense-analysis.ts`** — v `analyzeExpenseFile()` větev:
  `isSpreadsheetFile(file.type, file.name)` → extrahovat CSV, poslat Gemini jako
  `{ type: "text", text: prompt + "\n\nObsah tabulky (CSV export listů sešitu):\n" + csvText }`
  místo dnešní image/file části. Beze změny: schema, kategorizační pravidla, logování.
- **`src/app/api/events/[id]/expenses/route.ts`** — nahradit lokální `ALLOWED_MIME` +
  `.has(file.type)` voláním `isAllowedExpenseFile(file.type, file.name)`. Upravit
  chybovou hlášku na `"Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC, XLS, XLSX)"`.
- **`src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts`** — totéž.
- **`src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx`**:
  - oba upload inputy (řádky ~1061 a ~1337, "Přiložit doklad" / "Vyměnit doklad"):
    `accept="image/*,application/pdf,.xls,.xlsx"`
  - text nápovědy u druhého inputu (řádek ~1333): „PDF, Excel nebo fotka, max 10 MB"
  - camera/crop/rotation inputy (řádky 1067, 2535, 2666) — **beze změny**, jsou čistě
    foto-only funkce (detekce ořezu/natočení), netýkají se XLS
- **`package.json`** — nová závislost `xlsx` (SheetJS, npm verze `0.18.5`, poslední
  publikovaná na registru).

## 4. Beze změny (ověřeno při analýze)

- **Náhled/lightbox** (`DocPreviewDialog` v `event-expenses-tab.tsx:165-204`) — už dnes má
  generický fallback `!isImg && !isPdf` (ikona + „Otevřít soubor") pro neznámý MIME.
  XLS/XLSX do něj spadne bez úprav.
- **`send-vyuctovani`** (příloha do e-mailu vyúčtování) — mime-agnostické, jen streamuje
  blob podle `fileUrl`/`fileName`.
- **`detect-crop`/`detect-rotation`** — čistě foto-only funkce (Gemini detekce ořezu na
  fotce před uploadem), netýká se uploadu hotového XLS souboru.
- **`expense-mismatch.ts`** — pracuje jen s čísly (`amount`, `analyzedAmount`), žádná
  závislost na typu souboru.
- **`reanalyze/route.ts`** — volá centralizovanou `analyzeExpenseFile()`, žádná úprava
  potřeba.

## 5. Error handling

- Nečitelný/poškozený XLSX (SheetJS parse selže) → chyba se propaguje stejně jako dnes
  u nečitelného PDF/obrázku; existující `try/catch` v route handlerech ji zachytí a
  vrátí 500 s obecnou hláškou (žádná nová větev navíc).
- Prázdný/needitovatelný sešit → CSV export je prázdný string → Gemini dostane prázdný
  kontext a vrátí `total_amount: null` → mismatch gate se chová stejně jako u nečitelné
  faktury dnes (žádná speciální logika navíc).
- Validace velikosti (10 MB) a MIME/přípony probíhá **před** parsováním, stejně jako
  dnes pro obrázky/PDF.

## 6. Testing

- `src/lib/xlsx-extract.test.ts` — sešit s jedním listem, s více listy, prázdný list.
- `src/lib/expense-file-validation.test.ts` — MIME shoda, přípona jako záloha při
  neshodujícím se/obecném MIME, zamítnutí nesouvisejících typů (`.docx`, `.txt`).
- Gemini volání samotné (`analyzeExpenseFile`) se dnes netestuje ani pro PDF/obrázky
  (vyžaduje `GEMINI_API_KEY` a síťové volání) — e2e smoke testy tuhle cestu nepokrývají.
  Tenhle vzorec se touto úpravou nemění, žádné nové e2e testy se nepřidávají.
