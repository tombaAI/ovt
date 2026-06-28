# Zadání: Faktura bez dokladu

Samostatný úkol vyčleněný ze sekce 4 (Náklady) a sekce 6 (Vyúčtování) dokumentu `ZADANI_ZIVOTNI_CYKLUS_AKCE.md`.

---

## Byznys případ

Typická situace: vedoucí akce ví, že bus bude stát 8 000 Kč a faktura od dopravce přijde za týden po akci. Přesto chce:
1. Zadat náklad **teď**, aby bylo možné spočítat a rozeslat předpisy doplatků účastníkům.
2. Fakturu **přiložit dodatečně**, jakmile dorazí fyzicky.
3. Teprve po přiložení faktury odeslat pokyn k úhradě na TJ Bohemians.

Dnešní systém toto neumožňuje — formulář pro přidání nákladu vždy začíná nahráváním souboru.


---

## Co se má změnit

### 1. Nová UI cesta: „Přidat fakturu bez dokladu"

V záložce Náklady, vedle existujícího upload widgetu, přibude odkaz nebo tlačítko:

> **Přidat fakturu (bez dokladu)**

Kliknutím se otevře dialog (nikoliv celý upload flow) s formulářem:

| Pole | Typ | Povinné | Poznámka |
|---|---|---|---|
| Částka (Kč) | číslo | ano | |
| Účetní kód | výběr | ano | stejný select jako jinde |
| Účel / popis | text | ano | |
| Příjemce faktury | text | ne | název firmy nebo osoby |

Po uložení se vytvoří záznam v `event_expenses` s:
- `isPaid = false`
- `status = 'final'`
- `fileUrl = null`, `fileName = null`, `fileMime = null`

Žádná Gemini analýza, žádný upload.

### 2. Vizuální odlišení v seznamu nákladů

Faktura bez přiloženého souboru musí být v seznamu jasně označena. Navrhovaný vzhled:

```
[!] 8 000 Kč  · 518/001 · Doprava
    Faktura k úhradě – čeká na doklad   [Přiložit fakturu]
    AutoBus Praha s.r.o.
    15. 6. 2026
```

Badge: **„Čeká na doklad"** (žlutý/oranžový okraj, odlišný od existujícího „Faktura k úhradě" - který je čistě oranžový).

Tlačítko „Přiložit fakturu" vedle badge — viz bod 3.

### 3. Dodatečné přiložení faktury k existujícímu záznamu

Tlačítko „Přiložit fakturu" u záznamu bez souboru otevře jednoduchý upload dialog:
- stejný file input jako u existujícího flow (PDF nebo fotka)
- volitelná Gemini analýza (pro ověření částky — jen jako info, nenahrazuje zadané hodnoty)
- po nahrání se soubor uloží do Blob storage a záznam se aktualizuje (`fileUrl`, `fileName`, `fileMime`)

**Nový API endpoint:** `POST /api/events/[id]/expenses/[expenseId]/attach-file`
- přijme `multipart/form-data` se souborem
- nahraje do Blob storage
- aktualizuje `fileUrl`, `fileName`, `fileMime` v záznamu
- odmítne, pokud záznam již soubor má (= prevent accidental overwrite)

### 4. Odeslání pokynu k úhradě

Chování se nemění: tlačítko „Odeslat pokyn" zůstane **disabled**, dokud faktura nemá přiložený soubor (`expense.fileUrl === null`). Tooltip zůstane: „Nejdříve nahrajte soubor faktury".

---

## Co se nemění

- Schéma DB — `fileUrl` je již nullable, `isPaid` již existuje. **Žádná migrace není potřeba.**
- Stávající upload flow (nahrát soubor → Gemini → potvrdit) zůstává beze změny a je nadále primární cestou pro účtenky.
- Existující záznamy `isPaid=false` s přiloženým souborem — `DraftProcessDialog`, `ExpenseEditDialog` atd. se nemění.

---

## Technické podklady

### Aktuální stav DB / kódu

**`event_expenses` (src/db/schema.ts:528)**
- `is_paid boolean DEFAULT true` — false = faktura placená TJ
- `invoice_payee_name text` — příjemce faktury
- `invoice_payment_sent_at timestamptz` — kdy byl pokyn odeslán
- `file_url`, `file_name`, `file_mime` — všechny nullable; soubor není povinný

**`POST /api/events/[id]/expenses/route.ts` (řádek 159)**
Soubor je nepovinný: `if (file && file.size > 0) { ... }`. Endpoint funguje bez souboru — jen UI ho vždy posílalo v rámci upload flow.

**`AddExpenseForm` (event-expenses-tab.tsx:737)**
Celý formulář je zabalený do upload flow: idle stav = drop zone pro soubor. Přidáme odkaz pod drop zonou pro přidání faktury bez souboru.

**`ExpenseItem` (event-expenses-tab.tsx:1590)**
- Renderuje badge „Faktura k úhradě" při `!expense.isPaid` (řádek 1738)
- Tlačítko „Odeslat pokyn" je disabled při `!expense.fileUrl` (řádek 1753) — toto zůstane

**Attach-file endpoint** — zatím neexistuje. Je potřeba vytvořit.

**Důležité:** attach-file endpoint nesmí být blokován `billingStatus === "prescribed"` (příjmový zámek). Přikládání dokladů k fakturám je povoleno i po uzamčení příjmů. Blokovat ho bude až `expenses_locked` (samostatný výdajový zámek, viz zadání č. 4).

### Soubory ke změně

| Soubor | Změna |
|---|---|
| `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` | Tlačítko + dialog „Přidat fakturu bez dokladu" v idle stavu `AddExpenseForm`; badge „Čeká na doklad" + tlačítko „Přiložit fakturu" s upload dialogem v `ExpenseItem` |
| `src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts` | **Nový soubor.** POST handler: přijme `multipart/form-data`, validuje MIME + velikost (stejná pravidla jako stávající POST), nahraje do Blob na `events/{eventId}/expenses/{expenseId}_{timestamp}.{ext}`, aktualizuje `file_url/file_name/file_mime` v DB. Vrátí 409 pokud záznam soubor již má. |

### Žádná DB migrace

`file_url`, `file_name`, `file_mime` jsou nullable od začátku. `is_paid = false` existuje. POST endpoint volání bez souboru funguje.

---

## Otevřené otázky

1. Chceme po přiložení faktury volitelně nabídnout Gemini analýzu pro ověření částky?
2. Přepsat soubor: pokud záznam soubor již má, přidáme tlačítko „Nahradit soubor" — nebo ne?
