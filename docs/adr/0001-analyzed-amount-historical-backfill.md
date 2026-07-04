---
status: superseded — viz rozhodnutí níže
---

# Historická data pro `analyzedAmount`: reálná re-analýza, ne odhad

Kontrola shody zjištěné vs. zapsané částky (`analyzedAmount` vs. `amount`) se plní jen při
Gemini analýze dokladu — u nákladů, které mají doklad přiložený už dnes, žádná analýza
neproběhla a bez zásahu by `analyzedAmount` zůstal `NULL` napořád (kontrola by se na ně
nikdy neuplatnila).

**Původní návrh** (odmítnutý): migrace nastaví `analyzed_amount = amount` u všech
existujících nákladů s přílohou — bez skutečné analýzy, čistě aby stará data vypadala
jako "shoda" a kontrola je nevyhodnocovala jako falešný alert.

**Finální rozhodnutí**: místo odhadu proběhne jednorázová **skutečná** re-analýza —
zjištění při návrhu, že existujících nákladů s přílohou je jen 37, změnilo kalkulaci:
reálná Gemini analýza všech 37 je levná (řádově desetikoruny, pár minut běhu), takže
není důvod spokojit se s nepřesným odhadem. Backfill tedy volá stejnou logiku jako
nový endpoint `reanalyze` (viz design spec, sekce 4 a 7) — jednorázový skript spuštěný
po nasazení, ne SQL `UPDATE`.

Vedlejší produkt tohoto rozhodnutí: vznikla trvalá funkce **Přeanalyzovat** (re-analýza
existující přílohy bez nutnosti soubor nahrávat znovu) — nejen jednorázový nástroj pro
migraci, ale i budoucí způsob, jak ověřit starý doklad znovu (např. po zlepšení promptu).

Důsledek zůstávající i po této revizi: akce s `lockForReimbursement = true` (plně
uzavřené k proplacení) se nedají re-analyzovat vůbec, ani hospodářem — pokud se akce
uzavře dřív, než backfill/re-analýza proběhne, `analyzedAmount` u ní zůstane `NULL`
(nebo poslední známá hodnota) navždy. Aktuálně (2026-07-04) se to netýká žádného
existujícího nákladu — všech 37 je na akcích bez `lockForReimbursement`.
