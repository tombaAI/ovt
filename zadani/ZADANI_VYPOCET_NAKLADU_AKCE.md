# Zadání: Výpočet nákladů akce a doplatku za účastníka

Kanonický popis algoritmu pro vyúčtování akce — zobrazení v záložce **Náklady** i generování **předpisu doplatku** musí dát stejné číslo, protože obojí vychází z jednoho průchodu tímto algoritmem (`getEventSettlement`).

Navazuje na `ZADANI_PROPADLA_ZALOHA.md` (definice propadlé zálohy) — tento dokument definuje navíc přesný pořadí kroků a **kdy se (ne)zaokrouhluje**, což byla příčina issue #28 (Čeněk Havelka / bus).

---

## Princip: počítej s plnou přesností, zaokrouhli jen jednou — na konci, per účastník

Celý výpočet od nákladu po doplatek běží **ve float/decimal přesnosti, beze ztráty** (žádné mezivýsledkové `Math.ceil`/`Math.round`). Zaokrouhlení **nahoru** na celé koruny se provede **přesně jednou** — na úplném konci, pro **finální částku jednoho účastníka**, ne pro náklad, ne pro přihlášku jako celek.

**Výjimka — dotace na člena (krok 6) se zaokrouhluje DOLŮ na celé Kč hned v kroku 6**, ne na konci. Důvod: dotace je schválená částka, kterou klub reálně dává členům jako slevu — součet skutečně přiznané dotace (`subsidyPerMember × totalMemberParticipants`) tak nikdy nepřekročí schválenou `event.subsidyPerMember`, nanejvýš bude o pár Kč nižší (zbytek zůstává klubu, ne navíc rozpočítaný mezi členy zaokrouhlením nahoru). Zaokrouhlení nahoru v kroku 7 zůstává jediné zaokrouhlení směrem nahoru v celém výpočtu.

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

**⚠️ Důležité — tahle částka je tím "spotřebovaná".** Jakmile `forfeit_to_expense` snížil `effectiveAmount` nákladu (a tím i `unitPrice`, a tím nepřímo náklad VŠECH aktivních účastníků akce), nesmí se ta samá koruna ještě jednou započítat jako "zaplacená záloha" v Kroku 8 u přihlášky, ze které propadlá záloha pocházela — viz `ownForfeitedAmount` v Kroku 8 níže. Jinak se stejná koruna použije dvakrát (issue nalezený 2026-06-24, akce „Zahraniční zájezd – Isel" — viz sekce „Issue: dvojí započtení propadlé zálohy" na konci dokumentu).

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
subsidyPerMember = floor( event.subsidyPerMember / totalMemberParticipants )   // ZAOKROUHLENO DOLŮ na celé Kč
```

kde `totalMemberParticipants` = počet aktivních účastníků s `memberId != null` (napříč celou akcí, ne per přihláška).

Dotace se odečítá **jen účastníkům, kteří jsou členi** (`memberId != null`); ostatní platí `totalCost(p)` bez odpočtu.

`subsidyPerMember` je od tohoto kroku dál **celé číslo (Kč)** — žádná desetinná přesnost se do kroku 7 nepřenáší (viz výjimka v principu výše).

**Příklad:** `floor(5000 / 19) = floor(263,157894736…) = 263 Kč` — dál se počítá s `263`, ne s `263,157894736…`.

---

## Krok 7 — finální částka účastníka (jediné zaokrouhlení NAHORU v celém výpočtu)

```
participantFinal(p) = ceil( max(0, totalCost(p) − (isMember(p) ? subsidyPerMember : 0)) )
```

`ceil` = matematicky nahoru na celé Kč (vždy nahoru, ne na nejbližší — klub se nesmí dostat do mínusu kvůli zaokrouhlení).

**Příklad:**
- Nečlen: `ceil(4577,053076923…) = 4578`
- Člen: `ceil(4577,053076923… − 263) = ceil(4314,053076923…) = 4315`

---

## Krok 8 — částka přihlášky (doplatek)

```
registrationTotal = Σ participantFinal(p) pro všechny AKTIVNÍ účastníky této přihlášky

ownForfeitedAmount(registration) =
  Σ over participants p of THIS registration where:
    p.cancelledAt IS NOT NULL
    AND p.depositForfeitPolicy = 'forfeit_to_expense'
  of:
    depositPerPerson(p) = depositPrescription(registration).amount / registration.personsCount
    max(0, depositPerPerson(p) − p.depositRefundAmount)

effectiveDepositForSettlement(registration) =
  max(0, effectiveDepositAmount(registration) − ownForfeitedAmount(registration))

settlementAmount = max(0, registrationTotal − effectiveDepositForSettlement(registration))
```

`effectiveDepositAmount` — viz `event-settlement.ts::effectiveDepositAmount`: zálohu započítáváme jen pokud byla skutečně přijata (`status IN ('matched','paid')`) nebo přislíbena (`depositPromise = true`); jinak 0, i když je prescription vystavený.

**`ownForfeitedAmount` — nová položka (oprava issue z 2026-06-24).** Pokud má přihláška odhlášeného účastníka s `depositForfeitPolicy = 'forfeit_to_expense'`, ta část zálohy, která propadla, už byla v Kroku 2 použita ke snížení `effectiveAmount` nákladu (a tím nákladu všech aktivních účastníků akce). Stejnou částku proto **nelze podruhé** započítat jako "zaplaceno" u zbylých (stále aktivních) účastníků téže přihlášky — odečítá se z `effectiveDepositAmount` ještě před výpočtem doplatku. Pro politiky `forfeit_to_club` a `forfeit_split` (zatím v Kroku 2 nemají žádný efekt na `effectiveAmount`) je `ownForfeitedAmount = 0` — tam k dvojímu započtení nedochází, protože se nic neodečítá v Kroku 2.

Pokud přihláška nemá žádného odhlášeného účastníka s `forfeit_to_expense`, `ownForfeitedAmount = 0` a `effectiveDepositForSettlement = effectiveDepositAmount` (beze změny oproti dřívějšímu chování).

Sčítají se **už zaokrouhlené `participantFinal` hodnoty jednotlivých účastníků** — ne nezaokrouhlený `totalCost`. Tj. pro přihlášku se 2 účastníky se nejdřív zaokrouhlí každý zvlášť, pak se sečte.

---

## Vyřešení zálohy — povinný krok před generováním předpisů (od 2026-06-24)

Samotná logika výpočtu (kroky 1–8 výše) se **nezměnila** — nevyřešená záloha se do doplatku stále počítá jako `effectiveDepositAmount = 0` (celá částka jde do doplatku), úplně stejně jako dřív. Co je nové: `lockBilling` a `regeneratePrescriptions` (`event-settlement.ts`) teď **odmítnou vygenerovat předpisy**, pokud má kterákoli aktivní přihláška se zálohou nevyřešený stav — tedy `status NOT IN ('matched','paid','cancelled')` a zároveň ani `depositPromise`, ani nově `depositWontPay` (viz níže).

Pro každou zálohu existují po vyřešení přesně 3 stavy (zobrazené na záložce **Platby** i v záložce **Přihlášky**):

| Stav | `effectiveDepositAmount` pro doplatek | Jak se nastaví |
|---|---|---|
| **Zaplaceno** | plná částka (`matchedAmount` nebo `amount`) | automaticky, spárováním s bankou (`status = 'matched'/'paid'`) |
| **Příslib zaplacení** | plná částka, počítá se jako zaplacená | admin manuálně, `setDepositPromise(id, true, note)` — `depositPromise = true` |
| **Nebude platit zálohu** | `0` — celá částka jde do doplatku | admin manuálně, `setDepositWontPay(id, true, note)` — `depositWontPay = true` |

`depositPromise` a `depositWontPay` jsou vzájemně výlučné — nastavení jednoho vynuluje druhé (včetně poznámky/kdo/kdy). Přihláška bez zálohy vůbec (např. admin přidaná bez deposit prescription) gate neblokuje — nic k vyřešení není.

Dokud žádný ze 3 stavů není nastavený, záloha je **„Nevyřešeno"** (červený badge) a blokuje `lockBilling`/`regeneratePrescriptions` s chybou vypisující jména dotčených přihlášek.

---

## Zobrazení (UI)

Všechny mezivýsledky (efektivní částka nákladu, cena/jednotka, náklad na osobu před zaokrouhlením, dotace na člena) se v UI zobrazují **zaokrouhlené na 2 desetinná místa matematicky** (round-half-up), čistě pro čitelnost. Tato zobrazená hodnota se nikdy nevrací do výpočtu — interní reprezentace zůstává plná přesnost (float/decimal) po celou dobu průchodu kroky 1–7.

**Pravidlo „Cena akce − Dotace = K zaplacení musí vždy přesně sedět":** kdekoli se v UI (Přehled plateb) nebo v e-mailu s předpisem zobrazuje hrubá cena před dotací (souhrnně za přihlášku, nebo per účastník), **nepoužívá se** raw `totalCost`/`expensesTotal` (krok 4–5, plná přesnost před zaokrouhlením), protože odečtením celočíselné dotace od neceločíselného nákladu a až následným porovnáním se zaokrouhleným `K zaplacení` vznikne viditelný nesoulad o 1 Kč (issue nahlášený uživatelem 2026-06-24 — Cena akce 4 577 − Dotace 263 ≠ K zaplacení 4 315).

Místo toho se zobrazená hrubá cena **odvozuje zpětně z už zaokrouhlených kanonických hodnot**:

```
displayGrossCost(p)          = finalAmount(p) + subsidyAmount(p)        // per účastník (e-mail "Cena/os.")
displayGrossCost(registrace) = totalAmount(registrace) + subsidy(registrace)   // souhrnně (UI "Cena akce")
```

Díky tomu, že `subsidyAmount`/`subsidy` je od kroku 6 celé číslo, platí `displayGrossCost − dotace = finalAmount`/`totalAmount` **přesně**, bez ohledu na to, kolik desetinných míst měl původní `totalCost`. `expensesTotal` na `SettlementRegistrationRow` zůstává interní/informativní pole (např. pro rozpad ceny podle jednotlivých nákladů v popoveru) — pro headline „Cena akce" se už nepoužívá.

---

## Stav implementace vs. tento spec (k 2026-06-24, po realizaci kroků 3/6/7/8)

| Krok | Aktuální kód | Soulad se spec |
|---|---|---|
| Krok 1 (váhy) | `activePersonKeysForRegistration` (sdílená funkce) + váhy per náklad přímo z `participantCoefficients` (`with_coefficients`) nebo `eventExpenseAllocations` rozpočtených rovným dílem (`per_registration`) v `getEventSettlement` | ✅ |
| Krok 2 (forfeit → effectiveAmount) | `calcForfeitForExpense` — beze změny, opraveno dříve (commit `e698029`) | ✅ |
| Krok 3 (cena za jednotku váhy, plná přesnost) | `unitPriceByExpense.set(expense.id, effectiveAmount / totalWeight)` — žádné mezivýsledkové zaokrouhlení. `setExpenseParticipantCoefficients` už neukládá derivovanou Kč alokaci (jen koeficienty) | ✅ |
| Krok 4–5 (náklad na účastníka) | `participantCalcs` — `totalCost` per účastník, plná přesnost | ✅ |
| Krok 6 (dotace, zaokrouhleno DOLŮ) | `subsidyPerMember = Math.floor(subsidyTotal / totalMemberParticipants)` v `getEventSettlement` — výjimka z principu, viz výše | ✅ (2026-06-24) |
| Krok 7 (jediné zaokrouhlení nahoru) | `ceilMoney(max(0, totalCost − subsidyAmount))` — počítáno přesně jednou, per účastník (`ParticipantCalc.finalAmount`) | ✅ |
| Krok 8 (součet přihlášky) | `totalAmount = calcs.reduce((s,c) => s + c.finalAmount, 0)` — součet už zaokrouhlených částek účastníků | ✅ |
| Krok 8 (`ownForfeitedAmount` odpočet od zálohy) | `effectiveDepositAmount()` v `event-settlement.ts` a `settlement-calc.ts` zatím **nepočítá** `ownForfeitedAmount` — používá se celá `effectiveDepositAmount(registration)` bez odpočtu propadlé části | ❌ **TODO — viz „Issue: dvojí započtení propadlé zálohy" níže** |

**Ověřeno** (2026-06-24) nezávislou JS reprodukcí nového algoritmu nad reálnými staging daty (event id 4) — výsledky přesně odpovídají sekci „Vypsané výpočty doplatku" níže (1815 / 4315 / 3893 / 1815 / 1656 Kč) po zavedení floor dotace v kroku 6.

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
- člen: **4315 Kč** (dotace zaokrouhlena dolů na 263 Kč v kroku 6, ne 263,157894736…)

Tato čísla lze použít jako acceptance test (unit test na čistou funkci dle dřívějšího návrhu testů, nebo Playwright assert na záložce Náklady + vygenerovaný předpis) — obě musí dát identický výsledek.

---

## Vypsané výpočty doplatku — 5 konkrétních přihlášek (stejná fixture, event id 4)

Společné pro všechny: `unitPrice` per náklad je stejné jako výše (Bus 3657,038461538…, Kemp 910,41, Odvoz 9,604615384…), `subsidyPerMember = 263 Kč` (floor(5000/19), krok 6 — celé číslo, ne 263,157894736…). Liší se jen `personsCount`, váhy jednotlivých účastníků a stav zálohy.

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

ownForfeitedAmount = 2 500   ("A A", forfeit_to_expense → expense 49, refund 0 — STEJNÁ koruna,
                              co už snížila effectiveAmount busu v kroku 2, viz upozornění tam)
effectiveDepositForSettlement = max(0, 7500 − 2500) = 5000   (= 2 × 2500, reálný podíl Ceneka a Jiriho)

doplatek = max(0, 9156 − 5000) = 4156 Kč
```

**Bez tohoto odpočtu** (= aktuální chování kódu k 2026-06-24) vychází doplatek `max(0, 9156 − 7500) = 1656 Kč` — o 2 500 Kč méně, protože stejná koruna z propadlé zálohy „A A" se započítá dvakrát: jednou už v kroku 2 (snížila náklad busu pro všech 26 aktivních účastníků), podruhé tady (jako už zaplacená záloha Ceneka a Jiriho). Viz „Issue: dvojí započtení propadlé zálohy" na konci dokumentu pro úplnou rekonstrukci na celé akci.

### Tomáš Bauer (registrace 12, 1 osoba)

```
Tomáš Bauer:    člen (member_id = 56), váha 1 na všech 3 nákladech
                totalCost = 4577,053076923…
                − subsidyPerMember 263 (floor, krok 6) = 4314,053076923…
                participantFinal = ceil(4314,053076923…) = 4315

registrationTotal = 4315

Záloha: prescription 2 500, status = matched, matched_amount = 2 500
effectiveDepositAmount = 2 500

doplatek = max(0, 4315 − 2500) = 1815 Kč
```

### Robert Riedl (registrace 24, 2 osoby)

Robert Riedl je člen, Hana Riedlová (druhá osoba na přihlášce) ne — dotace se počítá per účastník, ne per přihláška, takže se uvnitř jedné přihlášky liší.

```
Robert Riedl:   člen (member_id = 161), váha 1
                totalCost = 4577,053076923… − 263 (floor, krok 6) = 4314,053076923…
                participantFinal = ceil(4314,053076923…) = 4315

Hana Riedlová:  nečlen, váha 1, bez dotace
                totalCost = 4577,053076923…
                participantFinal = ceil(4577,053076923…) = 4578

registrationTotal = 4315 + 4578 = 8893

Záloha: prescription 5 000, status = matched, matched_amount = 5 000
effectiveDepositAmount = 5 000

doplatek = max(0, 8893 − 5000) = 3893 Kč
```

### Štěpán Klepač (registrace 13, 2 osoby) — nebude platit zálohu

Štěpán Klepač má na všech 3 nákladech explicitní koeficient **0** (je to organizátor/řidič — sám se na nákladech nepodílí, viz krok 1). Záloha této přihlášky (5 000 Kč, fixní sazba × 2 osoby) je v DB `status = pending`, `deposit_promise = false` — tj. **nebyla přijata ani přislíbena**, takže podle `effectiveDepositAmount` se nezapočítává vůbec (= scénář „nebude platit zálohu").

```
Štěpán Klepač:     váha 0 na všech nákladech (nečlen)
                    totalCost = 0
                    participantFinal = ceil(max(0, 0 − 0)) = 0

Kateřina Klepačová: člen (member_id = 62), váha 1
                    totalCost = 4577,053076923… − 263 (floor, krok 6) = 4314,053076923…
                    participantFinal = ceil(4314,053076923…) = 4315

registrationTotal = 0 + 4315 = 4315

Záloha: prescription 5 000, status = pending, deposit_promise = false
effectiveDepositAmount = 0   (nepřijata, nepřislíbena → nezapočítává se)

doplatek = max(0, 4315 − 0) = 4315 Kč
```

Pozn.: pokud by se „nebude platit zálohu" myslelo jako trvalé rozhodnutí (záloha se nikdy nevybere), je vhodné to v UI/datech odlišit od běžného „zatím nepřišla" pendingu — jinak vyúčtování vypadá identicky jako běžná nezaplacená záloha čekající na úhradu. Funkčně na výpočet doplatku to ale nemá vliv, dokud `status` zůstává `pending` a `deposit_promise = false`.

### Zbynek Herynek (registrace 48, 1 osoba) — příslib zálohy

Záloha 2 500 Kč je v DB `status = pending`, ale `deposit_promise = true` — podle `effectiveDepositAmount` se přislíbená záloha započítává v plné výši, i když fyzicky ještě nedorazila.

```
Zbynek Herynek: člen (member_id = 73), váha 1
                totalCost = 4577,053076923… − 263 (floor, krok 6) = 4314,053076923…
                participantFinal = ceil(4314,053076923…) = 4315

registrationTotal = 4315

Záloha: prescription 2 500, status = pending, deposit_promise = true
effectiveDepositAmount = 2 500   (přislíbená záloha se počítá jako přijatá)

doplatek = max(0, 4315 − 2500) = 1815 Kč
```

---

## Issue: dvojí započtení propadlé zálohy (nalezeno 2026-06-24)

**Symptom:** Akce má reálné náklady **121 503,38 Kč** (47+48+49: 249,72 + 23 670,66 + 97 583,00), dotaci **5 000 Kč** — naivně by tedy účastníci měli dohromady zaplatit `121 503,38 − 5 000 = 116 503,38 Kč`. Součet toho, co se podle aktuálního kódu od účastníků skutečně vybere (zaplacené zálohy + přislíbené zálohy + doplatky), ale vyjde jen **114 031,00 Kč** — o **2 472,38 Kč méně**.

**Příčina:** propadlá záloha „A A" (2 500 Kč, `forfeit_to_expense` → Bus, registrace 64 — Cenek Havelka) se započítává **dvakrát**:

1. V Kroku 2 snižuje `effectiveAmount` busu (97 583 → 95 083) → nižší `unitPrice` busu pro **všech 26 aktivních účastníků** akce (mírně nižší náklad pro každého, ne jen pro Ceneka/Jiriho).
2. V Kroku 8 (před opravou) se ale **celá** záloha registrace 64 (7 500 Kč, `status = matched`) započítává jako `effectiveDepositAmount` proti doplatku Ceneka a Jiriho — včetně té samé propadlé části. Reálně by mělo k jejich vlastnímu doplatku přispívat jen 5 000 Kč (jejich 2 × 2 500 vlastní záloha), protože těch 2 500 Kč navíc už "udělalo svou práci" v kroku 1.

**Důsledek:** stejná koruna sníží náklad jednou pro celou akci (krok 2) a podruhé zase jen pro Ceneka a Jiriho (krok 8) — `2 500 Kč` se tak ztratí z toho, co se má vybrat.

**Ověření výpočtem (nezávisle na účetní logice, jen sečtením skutečné hotovosti):**

```
Zaplacené zálohy                52 500,00
Přislíbené zálohy                5 000,00
Doplatky (současný kód)         56 531,00
Dotace (skutečně přiznaná)       4 997,00   (floor(5000/19) × 19, krok 6)
─────────────────────────────────────────
Celkem k dispozici              119 028,00
Náklady akce                   121 503,38
Chybí                             2 475,38
```

(Rozdíl `2 500 − 24,62 Kč` zaokrouhlovacího zisku z kroku 7 napříč 26 platícími účastníky = `2 475,38` — sedí přesně na chybějící částku.)

**Oprava** (popsaná výše v Kroku 8 — `ownForfeitedAmount`): od `effectiveDepositAmount` registrace se před výpočtem doplatku odečte ta část zálohy, která už propadla s politikou `forfeit_to_expense`. Po opravě:

```
Doplatek Havelka (oprava)        4 156,00   (= 1 656 + 2 500, místo 1 656)
─────────────────────────────────────────
Zaplacené zálohy                52 500,00
Přislíbené zálohy                5 000,00
Doplatky (opraveno)             59 031,00   (= 56 531 + 2 500)
Dotace (skutečně přiznaná)       4 997,00
─────────────────────────────────────────
Celkem k dispozici              121 528,00
Náklady akce                   121 503,38
Přebytek (zaokrouhlovací zisk)      24,62   ✅ čeká se přesně tento drobný přebytek (krok 7 vždy zaokrouhluje nahoru)
```

Po opravě tedy sedí účet na korunu (až na očekávaný zaokrouhlovací přebytek ~24,62 Kč, který je podle principu výpočtu žádoucí — klub se díky zaokrouhlení nahoru nikdy nedostane do mínusu).

**Rozsah dopadu:** chyba se projeví jen u přihlášky, kde **(a)** je alespoň jeden odhlášený účastník s `depositForfeitPolicy = 'forfeit_to_expense'` **a** **(b)** v té samé přihlášce zůstává alespoň jeden aktivní (platící) účastník. Pokud se zruší celá přihláška (všichni účastníci odhlášeni), k dvojímu započtení nedochází — taková přihláška se do `registrationRows`/doplatků vůbec nepočítá. Politiky `forfeit_to_club` a `forfeit_split` chybou nejsou zasaženy (Krok 2 je v současné implementaci nijak nezohledňuje).

**Status:** popsáno a přepočítáno v tomto spec dokumentu (Krok 8, sekce „Stav implementace"), **čeká na schválení a implementaci** v `src/lib/actions/event-settlement.ts` (`upsertPrescriptionAmounts`, `effectiveDepositAmount`) a `src/lib/settlement-calc.ts` (`effectiveDepositAmount` + nová `ownForfeitedAmount`/`calcForfeitForExpense` na úrovni registrace). Billing akce „Zahraniční zájezd – Isel" (event id 4) je na staging ve stavu `draft` (nic zamčené, žádné odeslané e-maily) — bezpečné pro opravu a přegenerování předpisů.

### Shrnutí

| Přihláška | registrationTotal | Záloha (efektivní pro doplatek) | Doplatek |
|---|---|---|---|
| Cenek Havelka (3 os., 1 odhlášen) | 9156 | 5000 (7500 matched − 2500 `ownForfeitedAmount`) | **4156 Kč** |
| Tomáš Bauer (1 os.) | 4315 | 2500 (matched) | **1815 Kč** |
| Robert Riedl (2 os.) | 8893 | 5000 (matched) | **3893 Kč** |
| Štěpán Klepač (2 os., 1 s váhou 0) | 4315 | 0 (pending, bez příslibu) | **4315 Kč** |
| Zbynek Herynek (1 os.) | 4315 | 2500 (pending, příslib) | **1815 Kč** |

Pozn.: doplatek Havelkovy přihlášky je zde podle **opraveného** vzorce (s `ownForfeitedAmount`). Aktuální kód k 2026-06-24 dává 1656 Kč (bez odpočtu) — viz tabulka „Stav implementace" výše a sekce „Issue: dvojí započtení propadlé zálohy" níže.
