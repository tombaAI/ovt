---
status: navrh
---

# Zadání: Online přihlašování na závod ČPV (podzim 2026)

> **Stav: Návrh.** Zapsáno podle zadání uživatele 2026-08-03 a obohaceno o rešerši oficiálních pravidel ČPV 2026. Negrilováno — před implementací projde grilling session a pravděpodobně dekompozicí na dílčí zadání (jde o největší samostatný celek od vzniku systému: první veřejná, ne-admin část aplikace).

## Souhrn

OVT Bohemians na podzim 2026 pořádá závod seriálu **Český pohár vodáků (ČPV)**. Chceme v rámci OVT správy postavit systém, který pokryje celý životní cyklus přihlášky na tento závod:

1. **Veřejný přihlašovací formulář** (oddíly i jednotlivci, bez přihlášení do systému),
2. **evidenci přihlášených** (lidé, lodě, kategorie),
3. **generování předpisů plateb** (řada s prefixem „H“, splatnost 7 dní, stejný účet a princip jako u akcí),
4. **příjem a párování plateb** (existující payment ledger),
5. **změny přihlášky** účastníky samotnými až do 7 dní před akcí (přidání/odebrání/výměna lidí, rozdílové platby, přeplatky),
6. **vratky** — od vrácení přeplatku jednotlivci až po hromadné vratky při zrušení celé akce.

Systém musí být robustní, intuitivní pro účastníky, s jasným přehledem pro organizátora, odolný proti náhodným „ukliknutím“ (účastníků i organizátora) a plně auditovaný.

**Termíny (odvozeno, potvrdit):** deadline změn přihlášek = neděle **27. 9. 2026** („7 dní před akcí“) → akce se koná o víkendu **3.–4. 10. 2026**. Přesný název a termín závodu doplnit (pravděpodobně tradiční podzimní pražský závod ČPV — potvrdit u uživatele).

## Kontext: co je ČPV (rešerše)

Zdroje: [oficiální stránka ČPV na kanoe.cz](https://www.kanoe.cz/vodni-turistika/pyranha-cup-cpv), [Pravidla ČPV 2026 (PDF)](https://www.kanoe.cz/img/turistika/2026/Pravidla_CPV_2026_full.pdf) — schválena výborem sekce vodní turistiky ČSK 19. 3. 2026, [vzor přihlášky 2026 (XLSX)](https://www.kanoe.cz/img/turistika/2026/Prihl_CPV_vzor.xlsx), výsledkový servis [zavody-cpv.cz](http://www.zavody-cpv.cz).

- ČPV je **dlouhodobá soutěž** vypisovaná výborem sekce vodní turistiky ČSK (VT ČSK); pro rok 2026 je vyhlášeno **9 závodů** (bod 8.1 pravidel). Jednotlivé závody pořádají oddíly.
- Závod je slalomového typu na tekoucí vodě: trať min. 5 km, 15–25 branek (povodné, protivodné, shýbačky, povinné přistání, xylofon). Výsledek = čas + trestné body (1 tb = 1 minuta).
- **Startovat smějí členové ČSK i neregistrovaní vodáci.** „Registrovaný závodník“ = člen oddílu registrovaného v sekci VT ČSK s uhrazenými členskými příspěvky do konce března (bod 1.6). Posádka s jediným registrovaným členem se počítá jako neregistrovaná (bod 1.5). Do celkového hodnocení seriálu se počítají jen registrovaní — na přihlášku a platbu na našem závodě to ale nemá vliv, startovné platí všichni stejně.
- **Start je intervalový podle startovních čísel** (min. interval 30 s, bod 5.1.2). Kdo neodstartuje v čase svého čísla, dostává 20 trestných bodů. Pořadí startu = pořadí startovních čísel → proto je výdej čísel (větev 2) tak citlivý.
- Výsledky zpracovává pořádající oddíl a zveřejňuje na zavody-cpv.cz; k identifikaci závodníka slouží **registrační číslo ČSK-VT** (bod 6.5). Chyby ve jméně, reg. čísle, roce narození či kategorii jsou „administrativní pochybení“ opravitelná i po závodě (body 6.8–6.10) — kvalitní data z přihlášek tato pochybení minimalizují.

### Kategorie 2026 (bod 1.4 pravidel)

| Věková skupina | Kategorie (zkratky) | Vymezení pro rok 2026 |
|---|---|---|
| Mládež | K1 hoši (K1h), K1 dívky (K1d), C2 mládež (C2m) | v soutěžním roce dovrší max. 15 let → ročníky 2011 a mladší |
| Dospělí a junioři — junioři | K1m, K1ž, C1, C2d (podskupina se vyhodnocuje i samostatně) | dovrší 16–20 let → ročníky 2006–2010 |
| Dospělí a junioři — dospělí | K1 muži (K1m), K1 ženy (K1ž), C1, C2 dospělí (C2d) | dovrší 21+ → ročníky 2005 a starší |
| Bez určení věku | GTX (nafukovací kánoe/kajak), K2 (dvoumístný kajak) | bez věkového omezení; K2 se nepočítá do celkového hodnocení seriálu |

Doplňující pravidla podstatná pro datový model:

- Start mládeže mezi dospělými/juniory je nepřípustný; **výjimka jen C2d** — smíšená posádka je zařazena podle staršího člena (bod 1.5).
- Výměna jednoho člena posádky C2/GTX = z pohledu seriálu **nová posádka** (bod 1.5) — pro nás jen evidenční poznámka, náš závod to řeší výměnou řádku.
- Jeden závodník se smí v rámci závodu přihlásit **v každé kategorii jen jednou** (porušení = diskvalifikace v dané kategorii), ale smí startovat ve více kategoriích (body 1.7 a 7.7) — systém by měl duplicitu v téže kategorii detekovat a varovat.
- Závodníci do 18 let nemají právo samostatné přihlášky — přihlašuje a zodpovídá „vysílající složka“ (bod 1.7), u nezletilých podepisuje „osoba povinná dohledem“.

### Dnešní papírová přihláška (vzor `zadani/Prihl_CPV_2016_Blanice.pdf`)

Hlavička: název závodu, rok, **zúčastněný oddíl + číslo oddílu** (dle adresáře ČSK; neregistrovaný oddíl uvádí „N“), **kontaktní osoba + telefon + adresa + e-mail** (osoba zodpovědná za správné vyplnění přihlášky **a vrácení startovních čísel** — bod 1.7).

Tabulka, **co řádek, to jeden člověk** (až 20 řádků): poř. č. | startovní číslo | kategorie | reg. č. ČSK VT (nečlen: rok narození) | příjmení | jméno | podpis závodníka (u nezletilých osoby povinné dohledem).

Nad tabulkou je blok prohlášení (start na vlastní nebezpečí, povinná vesta + přilba, dobrý plavec, seznámení s pravidly a bezpečnostními podmínkami čl. 2, splouvání jezů, souhlas se zpracováním osobních údajů) — **podpis na přihlášce tohle vše stvrzuje**. Jak toto stvrzení nahradit v online podobě je otevřená otázka (viz níže).

## Klíčové doménové koncepty

- **Řádek = člověk.** Na jednomístné lodi (K1, C1) je řádek zároveň loď. U deblových lodí (C2, K2, nafukovací dvojice GTX) jsou to **dva řádky = dva lidé = jedna loď = jedno startovní číslo**.
- **Startovní číslo patří lodi**, ne člověku. Do přihlášky se startovní čísla **nevyplňují** — přidělují se až v sobotu ráno při prezenci (větev 2). Čísla tvoří souvislou řadu a vydávají se sekvenčně v pořadí, v jakém oddíly fyzicky přijdou.
- **Pořadí řádků na přihlášce je závazné** pro pořadí lodí při výdeji čísel (tak to funguje dodnes — čísla se přidělují po přihláškách, v pořadí podání/příchodu).
- **Platí se za člověka** (startovné X Kč / osoba), ne za loď. Předpis = počet přihlášených lidí × sazba.
- **Registrační číslo ČSK VT**: vychází z databáze ČSK, ke které **pravděpodobně nebudeme mít přístup** (GDPR — k dořešení, viz větev 1). Výchozí předpoklad: volné textové pole; nečlen vyplní rok narození. Formát dle ČSK exportu je šesticiferné číslo (např. `556101`).
- **E-mail kontaktní osoby = vstupní brána k přihlášce.** Odkaz pro úpravy zaslaný e-mailem, bez účtu a hesla — stejný princip, jaký už používáme u přihlášek na oddílové akce (edit-link s tokenem).

## Rozsah — hlavní větev (co systém má umět)

### 1. Veřejný přihlašovací formulář

- Veřejná stránka (bez přihlášení) s formulářem odpovídajícím papírové přihlášce: hlavička (oddíl, číslo oddílu / „N“, kontaktní osoba, telefon, e-mail, adresa) + libovolný počet řádků závodníků (jméno, příjmení, kategorie z číselníku, reg. č. ČSK VT / rok narození).
- Deblové kategorie (C2m, C2d, K2, GTX): UI musí umět svázat dva řádky do jedné lodi (posádky). Validace: posádka má právě 2 členy, kategorie obou řádků se shoduje, C2d smí kombinovat věkové skupiny.
- Měkké validace podle pravidel: ročník vs. kategorie (mládež/junioři/dospělí), duplicitní závodník v téže kategorii, chybějící reg. číslo i rok narození. Tvrdě blokovat jen skutečné nesmysly — přihlašuje se i pro cizí lidi a organizátor musí umět cokoli opravit.
- Souhlas s pravidly ČPV, bezpečnostními podmínkami a zpracováním osobních údajů (checkbox + plné znění prohlášení z papírové přihlášky) — zaznamenat kdy/kdo/odkud.
- Po odeslání: potvrzovací e-mail na kontaktní adresu s rekapitulací, platebními údaji a odkazem pro úpravy. Zvážit ověření e-mailu ještě před potvrzením přihlášky (překlep v e-mailu = ztracený přístup i nedoručitelné platební údaje).

### 2. Předpis platby

- Po potvrzení přihlášky se vygeneruje **předpis se splatností 7 dní**: částka = počet přihlášených osob × startovné.
- **Číselná řada s prefixem „H“**, obdoba předpisů u akcí (`event_payment_prescriptions.prescription_code`), stejný bankovní účet, stejný princip (částka, VS, zpráva pro příjemce, QR platba pokud ji u akcí máme). Mapování „H“ řady na numerický variabilní symbol pro banku dořešit při grilování.
- **Termín platby není závazný** a nikde to nebudeme psát — žádné sankce, žádné automatické stornování nezaplacených přihlášek. Nezaplacené přihlášky prostě evidujeme (dnes se platí vše hotově na místě; online platba předem je nová pohodlnější cesta, ne povinnost).
- Při každé změně počtu osob se předpis přepočítává, resp. vzniká rozdílový předpis (viz scénáře).

### 3. Úpravy přihlášky účastníkem (do 27. 9.)

- Odkaz z e-mailu otevře přihlášku k úpravám: přidat člověka, odebrat člověka, vyměnit člověka, opravit údaje (jméno, reg. číslo, kategorie), přeuspořádat pořadí řádků, přeskládat posádky.
- Do **neděle 27. 9. 2026** (7 dní před akcí) bez omezení a bez sankcí. Po tomto datu je samoobslužná editace zamčená — změny už jen přes organizátora (a na místě).
- **Odolnost proti ukliknutí**: destruktivní kroky (odebrání člověka, storno přihlášky) vyžadují explicitní potvrzení; smazání je soft-delete s možností obnovy organizátorem; každá změna je auditovaná (kdo — účastník přes token / admin, kdy, co, staré → nové hodnoty; stejný vzor jako `audit_log`).
- Každá relevantní změna generuje notifikační e-mail s rekapitulací (účastník má vždy aktuální stav v ruce, a zároveň je to obrana proti změnám, kterých si nevšiml).

### 4. Platby a párování

- Příchozí platby tečou existující cestou: Fio sync → `payment_ledger` → auto-match podle VS na předpisy „H“ řady. Přesná částka → spárováno; odchylka → návrh k ručnímu potvrzení (stejná logika jako u členských příspěvků/akcí).
- Stavy vůči přihlášce: nezaplaceno / částečně / zaplaceno / přeplatek. Zobrazovat je účastníkovi (přes edit-link) i organizátorovi.
- Pozor na **prodlevu výpisu** (Fio sync 1× denně): účastník mohl zaplatit včera a systém to ještě nevidí. Komunikace stavů nesmí působit jako urgence („evidujeme k datu X“, ne „NEZAPLACENO!“).

### 5. Přeplatky, rozdílové platby a vratky

- Přidání osob po zaplacení → **rozdílový předpis** na doplatek (stejná splatnost 7 dní, vlastní položka v „H“ řadě).
- Odebrání osob po zaplacení → **přeplatek**; účastník může požádat o vrácení (tlačítko v edit rozhraní), nebo přeplatek nechat (vyřeší se na místě / propadne ve prospěch pořadatele — rozhodnout).
- **Vratky**: fronta žádostí pro organizátora; schválení → evidence vratky (částka, datum, na jaký účet — primárně protiúčet příchozí platby z výpisu), odeslání provádí organizátor ručně v bance, systém eviduje a páruje odchozí platbu. Auditované.
- **Zrušení akce**: hromadný scénář — všechny zaplacené přihlášky přejdou do stavu „k vrácení“, systém vygeneruje seznam vratek (částka + protiúčet), organizátor odbaví, systém odškrtává. Musí to být proveditelné pro nižší stovky plateb bez ručního dohledávání.

### 6. Přehled organizátora (admin)

- Dashboard závodu: počty přihlášek / lidí / lodí, rozpad podle kategorií, stav plateb (zaplaceno / částečně / nezaplaceno / přeplatky), fronta žádostí o vratku, přihlášky se stavem „ke kontrole“ (podezřelé duplicity, nevalidní kategorie…).
- Detail přihlášky: plná editace všeho (i po 27. 9.), historie změn, platební historie, možnost ručně přidat platbu (hotovost na místě), poslat znovu edit-link, storno přihlášky.
- Exporty: startovní listina pro výsledkový software (pořadí, čísla, kategorie, jména, reg. čísla) — samotné zpracování výsledků je mimo rozsah, ale data z přihlášek jsou jeho přímým vstupem.

## Katalog scénářů (k pokrytí návrhem i testy)

Platební flow zná systém z členských příspěvků a akcí; tady navíc přibývá samoobslužná změna přihlášky. Katalog situací, které musí návrh ustát:

**Platby:**

1. Přesná platba se správným VS → auto-match, zaplaceno.
2. Platba se špatným / žádným VS → ruční párování organizátorem.
3. Nižší částka (nedoplatek) → částečně zaplaceno, evidovat rozdíl.
4. Vyšší částka (přeplatek) → evidovat, nabídnout vratku.
5. Více plateb postupně na jeden předpis (doplácení po částech).
6. Jedna platba pokrývající více předpisů (oddíl zaplatí základní předpis + rozdílový jedním převodem; nebo dvě přihlášky téhož oddílu jednou částkou) → split alokace (ledger to umí).
7. Duplicitní platba (zaplatí omylem dvakrát) → přeplatek → vratka.
8. Platba „v letu“ — odeslána, ještě není na výpisu; účastník mezitím upravuje přihlášku. Nesmí dojít ke zmatení stavů ani k urgenci.
9. Platba dorazí až po odebrání člověka, na který byla určena (crossing platby a změny) → skončí jako přeplatek, standardní cesta.
10. Platba z cizího účtu (platí rodič, oddílová pokladna…) → párování dle VS funguje; vratka jde na protiúčet skutečné platby, ne „účet přihlášeného“.
11. Platba nikdy nepřijde → přihláška zůstává platná, doplatí se hotově na místě (dnešní standard). Předpis zůstává otevřený.
12. Platba přijde po provedení vratky → nový přeplatek, další kolo.
13. Hotovostní platba na místě → organizátor ji ručně zaeviduje (cash zdroj v ledgeru existuje).

**Změny přihlášky:**

14. Přidání člověka před zaplacením → navýšení předpisu (rozhodnout: přepis částky vs. rozdílový předpis už zde).
15. Přidání člověka po zaplacení → rozdílový předpis; nový člověk je evidovaný i nezaplacený (možná už poslali, možná pošlou, možná doplatí na místě).
16. Odebrání člověka před zaplacením → snížení předpisu.
17. Odebrání člověka po zaplacení → přeplatek → žádost o vratku, nebo ponechat.
18. Výměna člověka 1:1 → finančně neutrální, jen evidence + audit + notifikace (pravidlo 1.5: u posádky formálně „nová posádka“).
19. Kombinace v jedné editaci (2 odebrat + 3 přidat) → netto rozdíl, jeden rozdílový předpis.
20. Změna kategorie / přeskládání posádek (K1 → C2 spojením dvou řádků, rozpad posádky na dvě K1…) → počet lidí se nemění, finance se nemění, mění se počet lodí.
21. Přeuspořádání pořadí řádků → mění závazné pořadí pro výdej čísel; do 27. 9. povoleno.
22. Souběžná editace (dva lidi se stejným odkazem, dvě záložky) → poslední zápis nesmí tiše přepsat cizí změny; minimálně detekce konfliktu.
23. Omylem smazaný člověk / celá přihláška → potvrzovací dialog + soft-delete + obnova organizátorem.
24. Oprava překlepů (jméno, reg. číslo) → kdykoli, i po závodě (administrativní pochybení dle 6.10) — přes organizátora.
25. Změna kontaktního e-mailu → citlivá operace (přepnutí „vstupní brány“): potvrdit na starém i novém, auditovat.
26. Změny po 27. 9. → samoobsluha zamčená, jen organizátor.
27. Storno celé přihlášky účastníkem → potvrzení, přeplatek → vratka.

**Ostatní:**

28. Duplicitní přihláška téhož oddílu (vyplní formulář dvakrát, protože „to asi neprošlo“) → detekce (stejný oddíl/e-mail), nabídnout pokračování v existující místo založení nové; organizátor umí sloučit/stornovat.
29. Tentýž závodník na dvou přihláškách nebo dvakrát v téže kategorii → dle pravidel hrozí diskvalifikace; systém varuje organizátora (fuzzy shoda jméno + reg. číslo).
30. Nedoručitelný e-mail / překlep → přihláška existuje, ale kontakt je mrtvý; organizátor vidí bounce a umí kontakt opravit + poslat nový link.
31. Robot / spam na veřejném formuláři → rate limiting, honeypot/CAPTCHA, potvrzení e-mailem; nesmí zaplevelit evidenci ani vyčerpat Resend kvótu.
32. Nezletilí: přihlašuje vysílající složka (oddíl); u „rodinné“ přihlášky bez oddílu je přihlašovatelem rodič. Bez podpisu na místě nelze plně splnit bod 1.7 — viz otevřené otázky.

## Větev 1 (rozpracovat později): Integrace s databází ČSK

Jen rámcově — bude samostatné zadání + podklady pro jednání s ČSK:

- ČSK vede databázi oddílů; každý oddíl má správce a členy. Idea: přihlašovatel vybere oddíl z **našeptávače** (adresář oddílů ČSK je poloveřejný — název + číslo oddílu) a zadá — **bez nápovědy, jako důkaz oprávnění** — e-mail správce oddílu. Pokud se shoduje s ČSK evidencí, začneme mu **našeptávat členy oddílu** (jméno, příjmení, reg. číslo, ročník → automatické zařazení do kategorie). To by byl gamechanger: bezchybná reg. čísla, žádné překlepy, rychlé vyplnění.
- Co máme v ruce: vlastní oddílový export z ČSK (`zadani/csk_data-utf-2026-04-08-22-59-48.csv`) se strukturou `PRIJMENI; JMENO; DATUM_NAROZENI; ADRESA; OBEC; E-MAIL; TELEFON; FUNKCE; REG_CISLO; TR_TRIDA; ROZH_TRIDA; NSA-*; CLEN-OD/DO; SPORTOVEC-OD/DO; PROHLIDKA-OD/DO` — tj. ČSK data obsahují vše potřebné pro našeptávání (a víc, než bychom směli použít).
- K projednání s ČSK (seed, doplníme): právní titul a rozsah (jen jméno + reg. číslo + ročník?), API vs. periodický export, ověření správce (e-mail v evidenci vs. jiný mechanismus), příznak uhrazených příspěvků (definice „registrovaného závodníka“ dle 1.6 — pro pořadatele zajímavé, možná mimo rozsah), souhlas oddílů, retence dat po závodě.
- Systém musí plně fungovat i **bez** této integrace (výchozí předpoklad: data ČSK nemáme).

## Větev 2 (rozpracovat později): Prezence a výdej startovních čísel na místě

Jen rámcově — bude samostatné zadání:

- **Dnešní proces:** v sobotu 8:00 se otevře přihlašování; lidé ve frontě odevzdají papírovou přihlášku → spočítáme lidi, vybereme hotovost → papír jde „dozadu“, kde se ručně přepíše do PC a lodím se přidělí startovní čísla → vytiskne se potvrzení a čísla se fyzicky vydají. Kdo přijde, ten fyzicky je — pořadí příchodu určuje pořadí startu. Čísla jsou souvislá řada vydávaná sekvenčně od začátku, jiné pořadí výdeje neexistuje.
- **Cíl:** místo papíru a přepisování check-in z online přihlášky — např. **QR kód** v potvrzovacím e-mailu; organizátor ho naskenuje mobilem = „teď zařaď do fronty“ → systém přidělí lodím z přihlášky souvislý blok startovních čísel (v závazném pořadí řádků) → vydáme čísla, doplatíme případný rozdíl (hotově/na místě).
- **Varianta „pevný start předem“:** na přihlášce lze zaškrtnout „chci startovat hned na začátku; beru na vědomí, že tím jsem pevně zařazen ke startu, a pokud to neodvolám do čtvrtka večera před závodem, čísla mi takto zůstanou a je moje zodpovědnost si je vyzvednout“. Tím může být třeba polovina startovního pole přidělena předem a fronta v sobotu se dramaticky zkrátí.
- Navazuje: evidence **vrácení čísel** (za vrácení zodpovídá kontaktní osoba oddílu, bod 1.7), papírová podpisová listina při prezenci (možné řešení otázky podpisů), přepínání online/hotovost doplatků na místě, offline odolnost (síť na břehu řeky).

## Nefunkční požadavky a architektonické poznámky

- **První veřejná část systému.** Dosud je celá aplikace za admin loginem (Google OAuth + whitelist). Přihlašovací formulář a edit-linky jsou veřejné → nový bezpečnostní perimetr: tokeny s dostatečnou entropií, rate limiting, žádný únik osobních dat mezi přihláškami, oddělení od admin API. Zásadní bod pro grilování.
- **GDPR:** sbíráme osobní údaje cizích lidí (jména, ročníky, reg. čísla, kontakty). Souhlas je součástí prohlášení na přihlášce (převzít text z oficiálního vzoru); dořešit retenci po závodě (výsledky vyžadují jména + reg. čísla trvale, kontakty ne) a informační povinnost na formuláři.
- **Audit všeho** — stejný standard jako zbytek systému (`audit_log`), včetně akcí provedených účastníkem přes token (aktér = přihláška/token, ne admin e-mail).
- **E-maily přes Resend** — potvrzení, rekapitulace změn, platební údaje, edit-linky; pozor na kvóty a doručitelnost (SPF/DKIM už vyřešeno pro is.ovtbohemians.cz).
- **Vztah k existujícímu modulu akcí:** předpisy „H“ řady jsou obdobou `event_payment_prescriptions`; přihláškový model (registrace s více osobami, edit-link) je obdobou `event_registrations`. Při grilování rozhodnout: rozšíření stávajících tabulek vs. samostatné tabulky pro závod (kandidát: samostatné — veřejný závod má jinou strukturu řádků/posádek a jiný lifecycle, sdílet jen ledger + párování).
- **Znovupoužitelnost:** navrhnout tak, aby šel systém použít pro další ročníky (závod = entita s termínem, sazbou startovného, deadline změn), ne jednorázový hardcode roku 2026.

## Otevřené otázky

1. **Podpis / kvalifikované stvrzení prohlášení.** Papírový podpis stvrzuje bezpečnostní prohlášení + souhlas s GDPR (u nezletilých podpis osoby povinné dohledem). Jak nahradit online? Kandidáti: (a) checkbox + auditovaný záznam (kdo, kdy, IP) — právně nejslabší, ale bezbariérové; (b) potvrzení odkazem z e-mailu (double opt-in); (c) podpisová listina vytištěná ze systému a podepsaná fyzicky při prezenci v sobotu (kombinuje online data s papírovým podpisem — dnes fakticky nejblíž současné praxi); (d) kombinace a + c. **Necháno otevřené na pokyn uživatele.**
2. **Přesný název, termín a startovné závodu** — doplnit (odvozený víkend 3.–4. 10. 2026; startovné X Kč/osoba).
3. **Mapování „H“ řady na variabilní symbol** — VS musí být numerický; jak přesně kóduje řadu (např. VS = `8` + pořadové číslo?), jednotný vs. per-předpis VS.
4. **Osud neproplacených přeplatků** — vratka na žádost; co s přeplatky, o které si nikdo neřekne (propadají? aktivně vracíme vše po závodě?).
5. **Kapacita závodu** — existuje strop počtu lodí? (Ovlivňuje potřebu „pod čarou“ logiky známé z akcí.) Předpoklad: bez limitu.
6. **Rozdílový předpis vs. přepis částky** u nezaplaceného předpisu (scénář 14/16) — jednodušší UX vs. čistší účetní stopa; souvisí s již zgrilovaným mechanismem návrh/potvrzení změny částky předpisu ([2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md)).
7. **Ověření e-mailu před vznikem přihlášky** (double opt-in) — ano/ne; chrání proti překlepům a spamu, přidává tření.
8. **Vícejazyčnost** — stačí čeština? (ČPV je česká soutěž; předpoklad: ano, jen česky.)

## Vazby a podklady

- `zadani/Prihl_CPV_2016_Blanice.pdf` — vzor papírové přihlášky (podklad od uživatele).
- `zadani/csk_data-utf-2026-04-08-22-59-48.csv` — export členů našeho oddílu z ČSK databáze (struktura dat pro větev 1).
- [Pravidla ČPV 2026 (PDF, kanoe.cz)](https://www.kanoe.cz/img/turistika/2026/Pravidla_CPV_2026_full.pdf), [vzor přihlášky 2026 (XLSX)](https://www.kanoe.cz/img/turistika/2026/Prihl_CPV_vzor.xlsx), [stránka ČPV](https://www.kanoe.cz/vodni-turistika/pyranha-cup-cpv), [výsledky zavody-cpv.cz](http://www.zavody-cpv.cz).
- [2026-06-15-zivotni-cyklus-akce.md](2026-06-15-zivotni-cyklus-akce.md) — přihlášky na oddílové akce (edit-link princip, předpisy, zálohy) — ideový předchůdce.
- [2026-04-10-rekonciliace-plateb-v1.md](2026-04-10-rekonciliace-plateb-v1.md) — payment ledger, auto-match, split alokace — platební základ, na kterém stavíme.
- [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) — mechanismus změny částky předpisu (otevřená otázka 6).
