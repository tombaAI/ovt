# Otevřené otázky a rozhodnutí před implementací

Datum: 2026-04-10

Níže jsou body, kde je potřeba rozhodnutí nebo upřesnění před psaním kódu.
Označení: [DO] = nutné pro V1, [V2] = lze odložit.

---

## A) Závazkový řádek — rozšiřitelnost

**Otázka:** Jak zobecnit `charge_type` / `charge_id`?

Možnosti:
1. **Polymorfní pole** (dnešní návrh): `charge_type text`, `charge_id int`. Jednoduché, ale bez FK integrity.
2. **Rodičovská tabulka `charges`**: všechny druhy předpisů mají řádek v `charges`, který se FK sdílí. FK integrita, ale migrace existujících `member_contributions` je nutná.
3. **Jen contributions pro V1**: nezobecňovat nyní, nechat `contrib_id not null`. Zobecnit až při skutečné potřebě.

**Doporučení:** Možnost 1 pro V1 — polymorfní reference, jednoduché, srozumitelné, zobecnitelné. Dodat application-level validaci.

**Rozhodnutí:** [DO] Zvolit přístup před zahájením migrace.

---

## B) Unikátní klíč pro CSV výpisy

**Otázka:** Co je unikátní klíč transakce při importu CSV výpisu od jiné banky?

Fio: `fio_id` (přiděluje Fio, spolehlivý).
Jiné banky: závisí na formátu. Pokud chybí systémové ID:
- Syntetický klíč = SHA256(datum + částka + VS + protistrana + pořadí_v_souboru)?
- Nebo přijmout riziko duplicit a zobrazit warning?

**Doporučení:** Pokud profil nemá `unique_key_col`, vygenerovat SHA256 ze stabilních polí + upozornit uživatele. Duplicitní syntetický klíč → skip + warn.

**Rozhodnutí:** [DO] Potvrdit, jestli bude kromě Fio nějaká druhá banka v blízké době.

---

## C) Hotovostní platby — kde v UI se zadávají?

Dnes je „Přidat platbu" v šuplíku předpisu (PaymentSheet). V nové architektuře:
- Šuplík předpisu → „Přidat hotovostní platbu" → vytvoří `payment_allocation` (source_type=cash) + `payment_allocation_line` (charge_type=contribution, charge_id=contrib.id) rovnou v confirmed stavu.
- Nebo: hotovostní platbu zadat v rekonciliačním rozhraní a pak párovat.

**Doporučení:** Pro jednoduchost zachovat flow v šuplíku předpisu — hotovostní platba rovnou confirmed, přeskočí staging. Rekonciliační rozhraní pro elektronické a nejasné platby.

**Rozhodnutí:** [DO] Odsouhlasit UX flow pro hotovost.

---

## D) Rodinné platby — identifikace příbuzných

**Otázka:** Jak zjistit, že Marek Hořejší platí za Marii Hořejší a Vaška Hořejšího?

Možnosti:
1. **Manuálně vždy** — admin splittuje ručně, systém nenabízí skupiny.
2. **Heuristika příjmení** — člen se stejným příjmením → navrhni jako kandidáta split.
3. **Explicitní „rodinná skupina"** v DB — členové mohou být označeni jako rodina/skupina, sdílí VS.

**Doporučení:** Pro V1 — manuální split s heuristickým návrhem (text zprávy + příjmení match). Explicitní skupina jako V2.

**Rozhodnutí:** [V2] Skupiny. [DO] Heuristika.

---

## E) Period locked / uzávěrka

**Otázka:** Má smysl zamknout rekonciliaci uzavřeného roku?

Doporučení: `contribution_periods.status = 'closed'` již existuje. Po uzavření roku → odpárování plateb v tom roce vyžaduje roli `super_admin` nebo explicitní override s povinnou poznámkou.

**Rozhodnutí:** [V2] Implementovat, ale upozornit na to teď v kódu.

---

## F) Migrace dat ze stávající tabulky `payments`

**Otázka:** Kdy a jak?

Navrhovaný postup:
1. Nová architektura nasazená a otestovaná (payments_allocations funguje).
2. Backfill: každý záznam v `payments` přemigrovat na `payment_allocations` + `payment_allocation_lines`.
3. Spustit reconciliation report — porovnat před/po migrace.
4. Označit `payments.is_legacy = true` pro všechny migrované.
5. Po jednom uzavřeném měsíci bez problémů: deprecate payments v UI.
6. Po dalším uzavřeném roce: DROP payments.

**Rozhodnutí:** [DO] Odsouhlasit timing a postup zpětné migrace.

---

## G) Zobrazení „uhrazeno" na předpisu po migraci

Dnes: `paidTotal = SUM(payments.amount WHERE contribId = X)`.
Po migraci: `paidTotal = SUM(payment_allocation_lines.allocated_amount WHERE charge_type='contribution' AND charge_id = X AND allocation.status = 'confirmed')`.

**Rozhodnutí:** [DO] Oba dotazy musí vrátit shodné výsledky po backfillu. Ověřit a přidat integrační test.

---

## H) Jak se zobrazí „legacy" platba v UI

Možnosti:
1. Zobrazit v payment sheetu jako šedý záznam s poznámkou „Historická evidence".
2. Skrýt z payment sheetu, zobrazit pouze v nové architektuře.
3. Migrovat backfill před spuštěním nového UI.

**Doporučení:** Možnost 3 — nezobrazovat staré platby jinak, backfillovat dřív než nasadíme nové UI.

**Rozhodnutí:** [DO] Odsouhlasit pořadí nasazení.
