# Zadání: Výpočet nákladů akce a doplatku za účastníka

Kanonický popis algoritmu pro vyúčtování akce — zobrazení v záložce **Náklady** i generování **předpisu doplatku** musí dát stejné číslo, protože obojí vychází z jednoho průchodu tímto algoritmem (`getEventSettlement`).

Navazuje na `ZADANI_PROPADLA_ZALOHA.md` (definice propadlé zálohy) — tento dokument definuje navíc přesný pořadí kroků a **kdy se (ne)zaokrouhluje**, což byla příčina issue #28 (Čeněk Havelka / bus).

---

## Princip: počítej s plnou přesností, zaokrouhli jen jednou — na konci, per účastník

Celý výpočet od nákladu po doplatek běží **ve float/decimal přesnosti, beze ztráty** (žádné mezivýsledkové `Math.ceil`/`Math.round`). Zaokrouhlení nahoru na celé koruny se provede **přesně jednou** — na úplném konci, pro **finální částku jednoho účastníka**, ne pro náklad, ne pro přihlášku jako celek.

Zobrazení (UI) může jakoukoli mezivýslednou hodnotu ukázat zaokrouhlenou na 2 desetinná místa (matematicky — round-half-up), ale **ta zobrazená zaokrouhlená hodnota se nikdy nepoužije zpátky do dalšího počítání** — vždy se pokračuje s plnou přesností uloženou v paměti/výpočtu.

---

## Vstupy

- `event.subsidyPerMember` — celková dotace akce (Kč), ne na osobu navzdory názvu pole — rozpočítává se na členy.
- `eventExpenses` se `status = 'final'` — náklady k rozúčtování. Každý má `amount`, `allocationMethod` (`split_all` | `per_registration` | `with_coefficients`), případně `participantCoefficients`.
- `eventRegistrations` s `cancelledAt IS NULL` — aktivní přihlášky.
- `eventRegistrationParticipants` — účastníci přihlášek, včetně individuálně odhlášených (`cancelledAt NOT NULL`) s `depositRefundAmount`, `depositForfeitPolicy`, `depositForfeitExpenseId`.
- `eventPaymentPrescriptions` typu `deposit` — záloha per přihláška (fixní sazba × `personsCount`).

---

## Krok 1 — váha (weight) každého účastníka, per náklad

Každý **aktivní** (neodhlášený) účastník má pro daný náklad váhu:

| `allocationMethod` | váha účastníka |
|---|---|
| `split_all` | `1` pro všechny aktivní účastníky |
| `with_coefficients` | `participantCoefficients[personKey] ?? 0` — explicitní koeficient; chybějící klíč i explicitní `0` = účastník se na tomto nákladu nepodílí (typicky organizátor/řidič, který sám neplatí) |
| `per_registration` (bez coefficients) | relativní váha = částka manuálně zadaná adminem za přihlášku (`eventExpenseAllocations.amount`); v rámci přihlášky se rozpočítá rovným dílem na její aktivní účastníky |

Odhlášený účastník (`cancelledAt NOT NULL`) má váhu **0** na všech nákladech, bez ohledu na to, co je uloženo v `participantCoefficients` (klíč v JSON může historicky zůstat, ale při čtení se ignoruje).

`totalWeight(expense)` = suma vah všech aktivních účastníků akce pro tento náklad.

**Reálný příklad (akce „Zahraniční zájezd – Isel“, staging, event id 4):** 27 aktivních účastníků, z toho jeden (organizátor) má explicitní koeficient `0` na nákladech Bus/Kemp/Odvoz → `totalWeight = 26` pro všechny tři náklady. Toto číslo **nikde není konstanta** — je to suma vah, vyplyne z dat.

---

## Krok 2 — propadlá záloha per náklad

```
forfeitedForExpense(expense) =
  Σ over participants p where:
    p.cancelledAt IS NOT NULL
    AND p.depositForfeitPolicy = 'forfeit_to_expense'
    AND p.depositForfeitExpenseId = expense.id
  of:
    depositPerPerson(p) = depositPrescription(p.registration).amount / registration.personsCount
    max(0, depositPerPerson(p) − p.depositRefundAmount)
```

`effectiveAmount(expense) = max(0, expense.amount − forfeitedForExpense(expense))`

Náklady bez napojeného forfeitu: `effectiveAmount = amount` (beze změny).

**Příklad:** Bus 97 583, propadlá záloha 2 500 (Čeněk Havelka, 1 z 3 účastníků jeho přihlášky, plný podíl bez vrácení) → `effectiveAmount = 95 083`. Kemp a Odvoz nemají na sobě napojený žádný forfeit → beze změny.

---

## Krok 3 — cena za jednotku váhy

```
unitPrice(expense) = effectiveAmount(expense) / totalWeight(expense)   // PLNÁ přesnost, žádné zaokrouhlení
```

**Příklad:**
- Bus: `95 083 / 26 = 3657,038461538…`
- Kemp: `23 670,66 / 26 = 910,41` (přesně)
- Odvoz: `249,72 / 26 = 9,604615384…`

---

## Krok 4 — náklad na účastníka, per expense

```
participantCost(p, expense) = unitPrice(expense) × weight(p, expense)
```

Pro účastníka s váhou `1` na všech třech nákladech v příkladu výše:
`3657,038461538… + 910,41 + 9,604615384… = 4577,053076923…`

---

## Krok 5 — součet nákladů účastníka přes všechny finální expenses

```
totalCost(p) = Σ participantCost(p, expense) pro všechny finální expenses
```

Stále plná přesnost, žádné zaokrouhlení.

---

## Krok 6 — dotace

```
subsidyPerMember = event.subsidyPerMember / totalMemberParticipants   // PLNÁ přesnost
```

kde `totalMemberParticipants` = počet aktivních účastníků s `memberId != null` (napříč celou akcí, ne per přihláška).

Dotace se odečítá **jen účastníkům, kteří jsou členi** (`memberId != null`); ostatní platí `totalCost(p)` bez odpočtu.

**Příklad:** `5000 / 19 = 263,157894736…`

---

## Krok 7 — finální částka účastníka (JEDINÉ místo, kde se zaokrouhluje)

```
participantFinal(p) = ceil( max(0, totalCost(p) − (isMember(p) ? subsidyPerMember : 0)) )
```

`ceil` = matematicky nahoru na celé Kč (vždy nahoru, ne na nejbližší — klub se nesmí dostat do mínusu kvůli zaokrouhlení).

**Příklad:**
- Nečlen: `ceil(4577,053076923…) = 4578`
- Člen: `ceil(4577,053076923… − 263,157894736…) = ceil(4313,895182186…) = 4314`

---

## Krok 8 — částka přihlášky (doplatek)

```
registrationTotal = Σ participantFinal(p) pro všechny AKTIVNÍ účastníky této přihlášky
settlementAmount = max(0, registrationTotal − effectiveDepositAmount(registration))
```

`effectiveDepositAmount` — viz `event-settlement.ts::effectiveDepositAmount`: zálohu započítáváme jen pokud byla skutečně přijata (`status IN ('matched','paid')`) nebo přislíbena (`depositPromise = true`); jinak 0, i když je prescription vystavený.

Sčítají se **už zaokrouhlené `participantFinal` hodnoty jednotlivých účastníků** — ne nezaokrouhlený `totalCost`. Tj. pro přihlášku se 2 účastníky se nejdřív zaokrouhlí každý zvlášť, pak se sečte.

---

## Zobrazení (UI)

Všechny mezivýsledky (efektivní částka nákladu, cena/jednotka, náklad na osobu před zaokrouhlením, dotace na člena) se v UI zobrazují **zaokrouhlené na 2 desetinná místa matematicky** (round-half-up), čistě pro čitelnost. Tato zobrazená hodnota se nikdy nevrací do výpočtu — interní reprezentace zůstává plná přesnost (float/decimal) po celou dobu průchodu kroky 1–7.

---

## Stav implementace vs. tento spec (k 2026-06-24, po realizaci kroků 3/7/8)

| Krok | Aktuální kód | Soulad se spec |
|---|---|---|
| Krok 1 (váhy) | `activePersonKeysForRegistration` (sdílená funkce) + váhy per náklad přímo z `participantCoefficients` (`with_coefficients`) nebo `eventExpenseAllocations` rozpočtených rovným dílem (`per_registration`) v `getEventSettlement` | ✅ |
| Krok 2 (forfeit → effectiveAmount) | `calcForfeitForExpense` — beze změny, opraveno dříve (commit `e698029`) | ✅ |
| Krok 3 (cena za jednotku váhy, plná přesnost) | `unitPriceByExpense.set(expense.id, effectiveAmount / totalWeight)` — žádné mezivýsledkové zaokrouhlení. `setExpenseParticipantCoefficients` už neukládá derivovanou Kč alokaci (jen koeficienty) | ✅ |
| Krok 4–6 (náklad na účastníka, dotace) | `participantCalcs` — `totalCost`/`subsidyAmount` per účastník, plná přesnost | ✅ |
| Krok 7 (jediné zaokrouhlení) | `ceilMoney(max(0, totalCost − subsidyAmount))` — počítáno přesně jednou, per účastník (`ParticipantCalc.finalAmount`) | ✅ |
| Krok 8 (součet přihlášky) | `totalAmount = calcs.reduce((s,c) => s + c.finalAmount, 0)` — součet už zaokrouhlených částek účastníků | ✅ |

**Ověřeno** (2026-06-24) nezávislou JS reprodukcí nového algoritmu nad reálnými staging daty (event id 4) — výsledky přesně odpovídají sekci „Vypsané výpočty doplatku" níže (1814 / 4314 / 3892 / 1814 / 1656 Kč).

`expensesTotal`/`subsidy` na `SettlementRegistrationRow` zůstávají informativní (plná přesnost, součet před zaokrouhlením) — skutečný doplatek (`totalAmount`) se od nich může lišit o pár Kč u přihlášek s více účastníky s různým členským statusem, protože se teď zaokrouhluje per účastník, ne per přihláška. To je očekávané a správné chování dle kroku 8.

`recalculateWithCoefficientsAllocations` byla zrušena — váhy `with_coefficients` se čtou živě z `participantCoefficients`, odhlášení účastníci se vyřadí automaticky při čtení, není co přepočítávat a ukládat zvlášť.

---

## Testovací fixture (reálná data, staging, neměnit)

Akce **„Zahraniční zájezd – Isel“**, `events.id = 4`, staging DB, `billing_status = draft` (bezpečné pro opakované testování, nic není zamčené).

- 3 finální náklady, všechny `with_coefficients`, rovné koeficienty (1) kromě jednoho účastníka s `0`:
  - Bus: `97 583,00` (expense id 49)
  - Kemp: `23 670,66` (expense id 48)
  - Odvoz řidiče busu: `249,72` (expense id 47)
- `subsidyPerMember = 5000,00`
- 21 aktivních přihlášek, 28 účastníků na nich, 1 odhlášený (Čeněk Havelka — přihláška 64, 3 osoby — jeho spolucestující "A A", `deposit_forfeit_policy = forfeit_to_expense`, `deposit_forfeit_expense_id = 49`, `deposit_refund_amount = 0`)
- 19 aktivních účastníků s `member_id != null`

**Očekávané výsledky podle tohoto spec (krok 7), účastník s váhou 1 na všech 3 nákladech:**
- nečlen: **4578 Kč**
- člen: **4314 Kč**

Tato čísla lze použít jako acceptance test (unit test na čistou funkci dle dřívějšího návrhu testů, nebo Playwright assert na záložce Náklady + vygenerovaný předpis) — obě musí dát identický výsledek.

---

## Vypsané výpočty doplatku — 5 konkrétních přihlášek (stejná fixture, event id 4)

Společné pro všechny: `unitPrice` per náklad je stejné jako výše (Bus 3657,038461538…, Kemp 910,41, Odvoz 9,604615384…), `subsidyPerMember = 263,157894736…`. Liší se jen `personsCount`, váhy jednotlivých účastníků a stav zálohy.

### Cenek Havelka (registrace 64, 3 osoby)

Aktivní účastníci: **Cenek Havelka** (nečlen, váha 1 na všech 3 nákladech) a **Jiri Havelka** (nečlen, váha 1). Třetí účastník přihlášky („A A") je odhlášený → nepočítá se do `registrationTotal`, jeho propadlá záloha 2 500 už byla odečtena v kroku 2 (efektivní náklad busu).

```
Cenek Havelka:  totalCost = 4577,053076923…   (nečlen, bez dotace)
                participantFinal = ceil(4577,053076923…) = 4578

Jiri Havelka:   totalCost = 4577,053076923…   (nečlen, bez dotace)
                participantFinal = ceil(4577,053076923…) = 4578

registrationTotal = 4578 + 4578 = 9156

Záloha: prescription 7 500, status = matched, matched_amount = 7 500
effectiveDepositAmount = 7 500   (skutečně přijatá)

doplatek = max(0, 9156 − 7500) = 1656 Kč
```

### Tomáš Bauer (registrace 12, 1 osoba)

```
Tomáš Bauer:    člen (member_id = 56), váha 1 na všech 3 nákladech
                totalCost = 4577,053076923…
                − subsidyPerMember 263,157894736… = 4313,895182187…
                participantFinal = ceil(4313,895182187…) = 4314

registrationTotal = 4314

Záloha: prescription 2 500, status = matched, matched_amount = 2 500
effectiveDepositAmount = 2 500

doplatek = max(0, 4314 − 2500) = 1814 Kč
```

### Robert Riedl (registrace 24, 2 osoby)

Robert Riedl je člen, Hana Riedlová (druhá osoba na přihlášce) ne — dotace se počítá per účastník, ne per přihláška, takže se uvnitř jedné přihlášky liší.

```
Robert Riedl:   člen (member_id = 161), váha 1
                totalCost = 4577,053076923… − 263,157894736… = 4313,895182187…
                participantFinal = ceil(4313,895182187…) = 4314

Hana Riedlová:  nečlen, váha 1, bez dotace
                totalCost = 4577,053076923…
                participantFinal = ceil(4577,053076923…) = 4578

registrationTotal = 4314 + 4578 = 8892

Záloha: prescription 5 000, status = matched, matched_amount = 5 000
effectiveDepositAmount = 5 000

doplatek = max(0, 8892 − 5000) = 3892 Kč
```

### Štěpán Klepač (registrace 13, 2 osoby) — nebude platit zálohu

Štěpán Klepač má na všech 3 nákladech explicitní koeficient **0** (je to organizátor/řidič — sám se na nákladech nepodílí, viz krok 1). Záloha této přihlášky (5 000 Kč, fixní sazba × 2 osoby) je v DB `status = pending`, `deposit_promise = false` — tj. **nebyla přijata ani přislíbena**, takže podle `effectiveDepositAmount` se nezapočítává vůbec (= scénář „nebude platit zálohu").

```
Štěpán Klepač:     váha 0 na všech nákladech (nečlen)
                    totalCost = 0
                    participantFinal = ceil(max(0, 0 − 0)) = 0

Kateřina Klepačová: člen (member_id = 62), váha 1
                    totalCost = 4577,053076923… − 263,157894736… = 4313,895182187…
                    participantFinal = ceil(4313,895182187…) = 4314

registrationTotal = 0 + 4314 = 4314

Záloha: prescription 5 000, status = pending, deposit_promise = false
effectiveDepositAmount = 0   (nepřijata, nepřislíbena → nezapočítává se)

doplatek = max(0, 4314 − 0) = 4314 Kč
```

Pozn.: pokud by se „nebude platit zálohu" myslelo jako trvalé rozhodnutí (záloha se nikdy nevybere), je vhodné to v UI/datech odlišit od běžného „zatím nepřišla" pendingu — jinak vyúčtování vypadá identicky jako běžná nezaplacená záloha čekající na úhradu. Funkčně na výpočet doplatku to ale nemá vliv, dokud `status` zůstává `pending` a `deposit_promise = false`.

### Zbynek Herynek (registrace 48, 1 osoba) — příslib zálohy

Záloha 2 500 Kč je v DB `status = pending`, ale `deposit_promise = true` — podle `effectiveDepositAmount` se přislíbená záloha započítává v plné výši, i když fyzicky ještě nedorazila.

```
Zbynek Herynek: člen (member_id = 73), váha 1
                totalCost = 4577,053076923… − 263,157894736… = 4313,895182187…
                participantFinal = ceil(4313,895182187…) = 4314

registrationTotal = 4314

Záloha: prescription 2 500, status = pending, deposit_promise = true
effectiveDepositAmount = 2 500   (přislíbená záloha se počítá jako přijatá)

doplatek = max(0, 4314 − 2500) = 1814 Kč
```

### Shrnutí

| Přihláška | registrationTotal | Záloha (efektivní) | Doplatek |
|---|---|---|---|
| Cenek Havelka (3 os., 1 odhlášen) | 9156 | 7500 (matched) | **1656 Kč** |
| Tomáš Bauer (1 os.) | 4314 | 2500 (matched) | **1814 Kč** |
| Robert Riedl (2 os.) | 8892 | 5000 (matched) | **3892 Kč** |
| Štěpán Klepač (2 os., 1 s váhou 0) | 4314 | 0 (pending, bez příslibu) | **4314 Kč** |
| Zbynek Herynek (1 os.) | 4314 | 2500 (pending, příslib) | **1814 Kč** |
