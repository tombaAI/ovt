---
status: navrh
---

# Zadání: Záloha nesedí po změně počtu osob na přihlášce

> **Stav: Návrh.** Vedlejší nález z grilování [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) — zatím jen zapsáno k dořešení, negrilováno, žádné rozhodnutí o řešení.

## Problém

Záloha (`eventPaymentPrescriptions.type = 'deposit'`) se počítá a zapisuje **jen jednou**, při vzniku přihlášky:

```
amount = personsCount × FOREIGN_WATER_AMOUNT_PER_PERSON     // event-registrations.ts:557
```

Ale `personsCount` na přihlášce se dál mění — admin může kdykoli přidat nebo odebrat účastníka:

- `addParticipantToRegistration` — `personsCount + 1` (`event-settlement.ts:1611-1665`)
- `removeParticipantFromRegistration` — `personsCount − 1`, floor na 1 (`event-settlement.ts:1667-1727`)

**Ani jedna z těchto funkcí nijak neupraví `amount` už existující zálohy.** Záloha zůstává zamrzlá na původním počtu osob, i když se `personsCount` reálně změní.

Zároveň se ale „záloha na osobu" v celém vyúčtování **odvozuje za běhu** z aktuálního (ne původního) `personsCount`:

```
depositPerPerson = depositPrescription.amount / registration.personsCount
```

— použito na několika místech: `event-settlement.ts:108` (`calcForfeitForExpense`), `:122` (`registrationForfeitTotal`), `:1445` (výpočet per-person zálohy pro e-mail/zobrazení).

## Důsledek

Když se po vzniku zálohy počet osob na přihlášce změní, `depositPerPerson` se tiše přepočítá s novým `personsCount`, ale **celková částka zálohy se nezmění** — neodpovídá tomu, co by mělo být vybráno (`nový_personsCount × sazba`), ani tomu, co bylo případně už zaplaceno proti původnímu počtu osob.

**Příklad:** přihláška 2 osoby, záloha vytvořená jako `2 × sazba` (třeba 2 500 → 5 000 Kč). Admin přidá třetího účastníka (`personsCount` 2→3). Záloha zůstává 5 000 Kč, ale `depositPerPerson` se v propadlé záloze i v zobrazení přepočítá jako `5000 / 3 = 1666,67`, místo původních `2500`. Nikde se přitom neukáže, že celková záloha už neodpovídá `3 × 2500 = 7500`, a nikdo není vyzván to řešit.

## Rozsah dopadu (nutno ověřit)

- Postihuje jen přihlášky, kde se po vzniku zálohy měnil počet účastníků (`addParticipantToRegistration`/`removeParticipantFromRegistration`) — jak časté to v praxi je, není ověřeno.
- Dotčené výpočty: propadlá záloha při odhlášení účastníka (`calcForfeitForExpense`, `calcOwnForfeitedAmount` — viz [2026-06-15-propadla-zaloha.md](2026-06-15-propadla-zaloha.md)), zobrazení „záloha na osobu" v UI/e-mailu.

## Otevřené otázky (nerozhodnuto)

1. Má se `amount` zálohy **automaticky přepočítat** při přidání/odebrání účastníka, nebo to má procházet stejným mechanismem návrh/potvrzení jako [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) (tedy rozšířit jeho rozsah i na `type = 'deposit'`, což ono zadání teď explicitně vylučuje)?
2. Pokud záloha už byla zaplacena/spárována (`status IN ('matched','paid')`) a pak se počet osob změní — co se má stát? Doplatek navíc? Vratka? Nic (ponechat nesoulad, řešit až v doplatku)?
3. Je vůbec žádoucí měnit počet osob na přihlášce **po** vytvoření zálohy, nebo by `addParticipantToRegistration`/`removeParticipantFromRegistration` měly být blokované, dokud záloha není vyřešená?

## Vazby

- Objeveno při grilování [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) (otázka rozsahu „settlement vs. i deposit").
- [2026-06-15-propadla-zaloha.md](2026-06-15-propadla-zaloha.md) — definice propadlé zálohy, používá `depositPerPerson`.
- `src/lib/actions/event-registrations.ts:557` (vznik zálohy), `src/lib/actions/event-settlement.ts:1611-1727` (změna `personsCount`), `:108,122,1445` (derivace `depositPerPerson`).
