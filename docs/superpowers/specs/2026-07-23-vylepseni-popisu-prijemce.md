---
status: produkce
---

# Zadání: Návrh lepšího popisu a příjemce faktury podle analýzy dokladu

> **Stav: Produkce.** Vzniklo z postřehu, že vedoucí akce zapisují náklady narychlo a stroze,
> což dělá problém při proplacení účetnímu oddělení. Zgrilováno, implementováno na
> samostatné feature větvi a nasazeno v produkci (PR #32).

## Kontext / problém

Gemini analýza dokladu (`analyzeExpenseFile()`) umí z faktury přesně vyčíst příjemce
(`payee_name`), obchodníka (`merchant`) a účetní kategorii (`category_name`) — ale
zapsaná data u nákladu (`purposeText` = popis/účel, `invoicePayeeName` = příjemce faktury)
odrážejí to, co vedoucí akce v rychlosti napsal, a bývají chudá. Typický případ:

- Příjemce zapsán jako `"Kuklaa"` místo skutečného `"JAN KUKLA - autobusová doprava"`
  z hlavičky faktury.
- Popis zapsán jako `"Bus"` — nedostatečné pro účetní oddělení, kam náklad jde k proplacení.

Dnes se to nijak neřeší:

- **Nový náklad** (`AddExpenseForm`): `invoicePayeeName` se u faktur tiše přepíše
  `payee_name` z analýzy (pole bylo prázdné, takže to nevadí). `AnalysisCard` se
  zobrazuje přímo nad editovatelnými poli popis/příjemce, takže kontext je vidět —
  tahle cesta zůstává beze změny, viz „Mimo rozsah".
- **Existující náklad** — výměna přílohy (`AttachFileDialog`) a přeanalýza
  (`ReanalyzeDialog`): podle `docs/superpowers/specs/2026-07-04-invoice-attachment-replace-design.md`
  je popis/příjemce **vědomě mimo rozsah** toho návrhu — upravují se jen přes samostatný
  `ExpenseEditDialog`. Nic ale neupozorní, že by se měly zkontrolovat, takže se re-analýza
  spustí, částka se ověří, ale sloupec s toporným popisem/příjemcem zůstává navždy beze
  změny — přesně to je mezera, kterou tohle zadání řeší.

## Cíl

V `AttachFileDialog` (výměna/přiložení dokladu) a `ReanalyzeDialog` (přeanalyzovat bez
výměny souboru) — tedy u **existujícího** nákladu — zobrazit popis a příjemce jako
editovatelná pole přímo vedle čerstvé Gemini analýzy, aby si toho, kdo doklad
nahrává/ověřuje, všiml a mohl je na místě opravit, bez nutnosti otevírat zvlášť
`ExpenseEditDialog`.

## Rozsah

1. **`AttachFileDialog`**:
   - Popis/účel (`purposeText`) jako vždy viditelné editovatelné pole (předvyplněné
     aktuální hodnotou), vedle `AnalysisCard` — dnes je to jen statický text.
   - Příjemce faktury (`invoicePayeeName`) jako editovatelné pole, jen když
     `!expense.isPaid` (jde o fakturu) — dnes tam vůbec není. Porovnání se zjištěným
     `analysis.payee_name` + tlačítko „Použít" (stejný vzor jako dnešní
     `AmountComparison` / „Použít zjištěnou" u částky).
   - Uložení („Uložit"): stávající POST na `attach-file` (soubor + částka, beze změny
     chování) následovaný PATCH na existující `/api/events/[id]/expenses` (stejný
     endpoint, který dnes používá `ExpenseEditDialog`) s `purposeText`/`invoicePayeeName`
     — jen pokud se od původních hodnot změnily.

2. **`ReanalyzeDialog`**:
   - Po dokončení automatické re-analýzy (stav `done`) přidat stejnou dvojici
     editovatelných polí popis/příjemce + porovnání příjemce pod výsledek.
   - „Uložit" na konci dialogu provede stejný navazující PATCH jako výše, opět jen
     při reálné změně.
   - Samotný `reanalyze` POST endpoint zůstává beze změny — dál dělá jen to, co dělá
     dnes (zapíše `analyzed_amount`, nic jiného).

3. **Žádná změna API kontraktu** u `attach-file`/`reanalyze` endpointů — popis/příjemce
   se ukládají přes už existující, otestovaný PATCH endpoint (validace neprázdného
   popisu, audit log diff, `lockForReimbursement` gate — nic z toho se nepíše znovu).

4. **Žádné nové pole v Gemini analýze.** Návrh příjemce vychází z už existujícího
   `analysis.payee_name` (přímý zdroj z hlavičky faktury). Popis nemá obdobu 1:1 — nabízí
   se jen jako vždy editovatelné pole vedle analýzy, bez tlačítka „Použít". Nudge je
   samotná viditelnost + editovatelnost v okamžiku, kdy je čerstvá analýza před očima —
   ne AI-generovaný text.

## Zámky a chybové stavy

- `lockForReimbursement`: `attach-file`/`reanalyze` i PATCH už dnes tvrdě blokují (409)
  — pokud první volání projde, zámek pro druhé (PATCH) platí stejně.
- `lockForParticipants`: podle stávající logiky PATCH endpointu se netýká popisu/příjemce
  (jen částky) — beze změny chování.
- Částečné selhání (soubor/částka se uloží, navazující PATCH popisu/příjemce selže):
  nezobrazovat jako celkové selhání uložení dokladu — dialog zůstane otevřený s chybovou
  hláškou jen u popisu/příjemce, ať jde uložení zopakovat bez nového nahrávání souboru.

## Mimo rozsah

- Zakládání nového nákladu (`AddExpenseForm`) — `AnalysisCard` už dnes funguje jako
  dostatečná nápověda (pole jsou prázdná, kontext je vidět nad nimi), a `invoicePayeeName`
  se už tiše předvyplňuje z `payee_name`. Beze změny.
- AI-generovaný/kompletovaný popis (nové pole v Gemini promptu/schématu) — vědomě
  vynecháno, viz bod 4 výše.
- Cokoliv z `docs/superpowers/specs/2026-07-04-invoice-attachment-replace-design.md`
  týkající se částky (`AmountComparison`, treasurer/confirm gate) — beze změny, jen se
  vedle toho přidávají pole popis/příjemce.

## Testing / ověření

Bez automatických testů (repo konvence u téhle oblasti) — lint + `tsc --noEmit` + ruční
průchod na stagingu:
1. Výměna přílohy u existujícího nákladu se stroze zapsaným příjemcem/popisem → objeví se
   návrh příjemce z faktury, „Použít" ho zkopíruje, popis lze rovnou přepsat, uložení
   projde jedním „Uložit".
2. Přeanalýza (bez výměny souboru) u nákladu se starým popisem/příjemcem → po dokončení
   se zobrazí editovatelná pole, uložení projde.
3. Zamčená akce (`lockForReimbursement`) → obě dialogová okna zůstávají zablokovaná jako
   dnes, žádná nová cesta jak zámek obejít.
4. Neměněný popis/příjemce (uživatel nic needituje) → žádný zbytečný PATCH/audit záznam.
