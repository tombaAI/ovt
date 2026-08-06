---
status: navrh
---

# Zadání: Online přihlašování na závod ČPV (podzim 2026)

> **Stav: Návrh.** Zapsáno podle zadání uživatele 2026-08-03, obohaceno o rešerši oficiálních pravidel ČPV 2026 a propozic Hameráku 2024, doplněno o poznámky uživatele 2026-08-05. Negrilováno — před implementací projde grilling session a pravděpodobně dekompozicí na dílčí zadání. Jde o největší samostatný celek od vzniku systému: ne první veřejnou část (veřejné přihlášky na oddílové akce už máme a jsou zdrojem inspirace), ale první veřejnou část **samostatně přístupnou bez přihlášení** a s **komplexním životním cyklem** (přihláška → platba → změny → vratky).

## Souhrn

OVT Bohemians na podzim 2026 pořádá závod seriálu **Český pohár vodáků (ČPV)**. Chceme v rámci OVT správy postavit systém, který pokryje celý životní cyklus přihlášky na tento závod:

1. **Veřejný přihlašovací formulář** (oddíly i jednotlivci, bez přihlášení do systému),
2. **evidenci přihlášených** (lidé, lodě, kategorie),
3. **generování předpisů plateb** (řada s prefixem „H“, splatnost 7 dní, účet TJ Bohemians — stejný princip jako u akcí),
4. **příjem a párování plateb** (výhradně přes TJ Bohemians — import výsledovky TJ do existujícího payment ledgeru; párování rozšířit na všechny pohyby včetně vratek),
5. **změny přihlášky** účastníky samotnými až do 7 dní před akcí (přidání/odebrání/výměna lidí, rozdílové platby, přeplatky),
6. **vratky** — od vrácení přeplatku jednotlivci až po hromadné vratky při zrušení celé akce.

Systém musí být robustní, intuitivní pro účastníky, s jasným přehledem pro organizátora, odolný proti náhodným „ukliknutím“ (účastníků i organizátora) a plně auditovaný.

**Termíny (potvrzeno uživatelem):** závod — náš tradiční **„Hamerák“** — je v sobotu **3. 10. 2026**; deadline samoobslužných změn přihlášek = neděle **27. 9. 2026** („7 dní před akcí“); odvolání „pevného startu předem“ do čtvrtka **1. 10. 2026** večer (větev 2). Přesný oficiální název závodu v kalendáři ČPV doplnit.

**Referenční rámec:** řídíme se pravidly, vzorem přihlášky a stavem ČPV/ČSK **platnými pro rok 2026**.

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

Oficiální vzor přihlášky 2026 (XLSX) obsahuje číselník kategorií s těmito kódy a názvy: **K1M** (Kajak muži), **K1Ž** (Kajak ženy), **K1H** (Kajak hoši), **K1D** (Kajak dívky), **C1** (Singlkanoe), **C2** (Deblkanoe), **C2M** (Deblkanoe mládež), **GTX** (Deblkanoe nafukovací), **K2** (Deblkajak) — náš číselník převezme tyto kódy. Pozor na drobný nesoulad: text pravidel používá pro dospělou deblkanoi zkratku „C2d“, formulář kód „C2“. GTX je dle formuláře výslovně dvoumístná nafukovací kánoe (posádka 2 osob).

Doplňující pravidla podstatná pro datový model:

- Start mládeže mezi dospělými/juniory je nepřípustný; **výjimka jen C2d** — smíšená posádka je zařazena podle staršího člena (bod 1.5).
- Výměna jednoho člena posádky C2/GTX = z pohledu seriálu **nová posádka** (bod 1.5) — pro nás jen evidenční poznámka, náš závod to řeší výměnou řádku.
- Jeden závodník se smí v rámci závodu přihlásit **v každé kategorii jen jednou** (porušení = diskvalifikace v dané kategorii), ale smí startovat ve více kategoriích (body 1.7 a 7.7) — systém by měl duplicitu v téže kategorii detekovat a varovat.
- Závodníci do 18 let nemají právo samostatné přihlášky — přihlašuje a zodpovídá „vysílající složka“ (bod 1.7), u nezletilých podepisuje „osoba povinná dohledem“.

### Hamerák — náš závod (propozice 2024)

Závod **ČPV Hamerský potok** (Malý Ratmírov – Jindřiš; v roce 2024 62. ročník) pořádá oddíl vodní turistiky TJ Bohemians Praha; web [hamerak.ovtbohemians.cz](https://hamerak.ovtbohemians.cz). Fakta z propozic 2024 (`zadani/CPV-Hamersky-potok-2024-propozice.pdf`) relevantní pro tento systém — pro ročník 2026 potvrdit:

- **Věkový limit hlavního závodu: 16+** („závodu se mohou účastnit závodníci, kteří v daném soutěžním roce dovrší věk 16 let a starší; za mladistvé zodpovídá vysílající složka“). **Soutěž mládeže je samostatná** (2024: start 14:00 ve Dvorečku, mimo hlavní trať) → přímý vstup pro otevřenou otázku 9.
- **Poplatky 2024:** startovné **200 Kč/osoba** (zahrnuje závod + splutí na víkend); vedle toho splutí pro nezávodníky (víkend 200 Kč, den 150 Kč) a permanentka na autobusovou dopravu (oba dny 230 Kč, den 170 Kč) — placeno hotově na místě, mimo přihlášku. **Ztráta startovního čísla: 500 Kč.**
- **Návrh cen 2026** (web [hamerak.ovtbohemians.cz](https://hamerak.ovtbohemians.cz/), načteno 2026-08-05): web už avizuje *„možnost online předregistrace a platby přes samostatnou stránku“* — tedy tento systém — s podmínkou *„při registraci a úhradě do 7 dní před akcí získáte slevu 50 Kč z každé položky ceníku“* (7 dní před akcí = 27. 9., shodné s deadline změn přihlášek). Ceník (na místě / online): **splutí se závodem ČPV 300 / 250 Kč**; splutí víkend 350/300, sobota 250/200, neděle 300/250; doprava oba dny 350/300, sobota 300/250, neděle 300/250; doporučená kombinace „na místě 650 Kč · online 550 Kč“. Ztráta startovního čísla 500 Kč. Důsledky pro systém: platba předem má nově reálnou finanční motivaci (interakce s principem „termín platby není závazný“) a ceník obsahuje i položky nad rámec startovného (splutí bez závodu, doprava) — co z toho online přihláška prodává, viz otázka 11.
- **Harmonogram soboty 2024:** přihlašování a placení 8:00–11:30, výklad trati 9:00, start první lodi 9:30, start poslední lodi 12:30 — časové okno prezence a výdeje čísel pro větev 2.
- **Občerstvení v cíli se vydává proti vrácení startovního čísla** — existující motivace k vracení čísel, na kterou naváže evidence výdeje/vrácení (větev 2).
- Protesty se odchylně od pravidel podávají písemně řediteli závodu do týdne od uveřejnění výsledků.

### Referenční formulář přihlášky

**Referenční je aktuální oficiální vzor 2026** (`zadani/Prihl_CPV_vzor.xlsx`) — online formulář i tisková podoba přihlášky se řídí jím. Papírová přihláška 2016 (`zadani/Prihl_CPV_2016_Blanice.pdf`) je jen historická ukázka téhož layoutu.

Hlavička: název závodu, rok, **zúčastněný oddíl + číslo oddílu** (dle adresáře ČSK; neregistrovaný oddíl uvádí „N“), **kontaktní osoba + telefon + adresa + e-mail** (osoba zodpovědná za správné vyplnění přihlášky **a vrácení startovních čísel** — bod 1.7).

Tabulka, **co řádek, to jeden člověk** (až 20 řádků): poř. č. | startovní číslo | kategorie | reg. č. ČSK VT (nečlen: rok narození) | příjmení | jméno | podpis závodníka (u nezletilých osoby povinné dohledem).

Nad tabulkou je blok prohlášení (start na vlastní nebezpečí, povinná vesta + přilba, dobrý plavec, seznámení s pravidly a bezpečnostními podmínkami čl. 2, splouvání jezů, souhlas se zpracováním osobních údajů) — **podpis na přihlášce tohle vše stvrzuje**. Jak toto stvrzení nahradit v online podobě je otevřená otázka (viz níže).

## Klíčové doménové koncepty

- **Řádek = člověk.** Na jednomístné lodi (K1, C1) je řádek zároveň loď. U deblových lodí (C2, K2, nafukovací dvojice GTX) jsou to **dva řádky = dva lidé = jedna loď = jedno startovní číslo**.
- **Startovní číslo patří lodi**, ne člověku. Do přihlášky se startovní čísla **nevyplňují** — přidělují se až v sobotu ráno při prezenci (větev 2). Čísla tvoří souvislou řadu a vydávají se sekvenčně v pořadí, v jakém oddíly fyzicky přijdou.
- **Pořadí řádků na přihlášce je závazné** pro pořadí lodí při výdeji čísel (tak to funguje dodnes — čísla se přidělují po přihláškách, v pořadí podání/příchodu).
- **Platí se za člověka** (startovné X Kč / osoba), ne za loď. Předpis = počet přihlášených lidí × sazba.
- **Registrační číslo ČSK VT**: v MVP **nemáme žádná interní data z databáze ČSK** — volné textové pole bez validace proti ČSK a bez předvyplňování; nečlen vyplní rok narození. Kontrolují se pouze **duplicity zadaných reg. čísel** (napříč řádky i přihláškami). Formát dle ČSK exportu je šesticiferné číslo (např. `556101`). Integrace s ČSK je odložená větev 1.
- **E-mail kontaktní osoby = vstupní brána k přihlášce.** Odkaz pro úpravy zaslaný e-mailem, bez účtu a hesla — stejný princip, jaký už používáme u přihlášek na oddílové akce (edit-link s tokenem).

## Rozsah — hlavní větev (co systém má umět)

### 1. Veřejný přihlašovací formulář

- Veřejná stránka (bez přihlášení) s formulářem odpovídajícím oficiálnímu vzoru 2026: hlavička (oddíl, číslo oddílu / „N“, kontaktní osoba, telefon, e-mail, adresa) + libovolný počet řádků závodníků (jméno, příjmení, kategorie z číselníku, reg. č. ČSK VT / rok narození).
- Deblové kategorie (C2m, C2d, K2, GTX): UI musí umět svázat dva řádky do jedné lodi (posádky). Validace: posádka má právě 2 členy, kategorie obou řádků se shoduje, C2d smí kombinovat věkové skupiny.
- Kromě řádků závodníků může přihláška obsahovat i **další položky ceníku bez závodu** — splutí (víkend/sobota/neděle) a dopravu (oba dny/sobota/neděle), např. pro doprovod (rozhodnuto v otázce 11a; přesná podoba — počty kusů vs. jmenovité osoby — ke grilování).
- Měkké validace podle pravidel: ročník vs. kategorie (mládež/junioři/dospělí), duplicitní závodník v téže kategorii, chybějící reg. číslo i rok narození. Tvrdě blokovat jen skutečné nesmysly — přihlašuje se i pro cizí lidi a organizátor musí umět cokoli opravit.
- Stvrzení prohlášení (pravidla ČPV, bezpečnostní podmínky, vzetí na vědomí informace o zpracování osobních údajů — přesné znění převzít z oficiálního vzoru 2026): checkbox + zaznamenat kdy/kdo/odkud.
- Po odeslání: potvrzovací e-mail na kontaktní adresu s rekapitulací, platebními údaji a odkazem pro úpravy. Zvážit ověření e-mailu ještě před potvrzením přihlášky (překlep v e-mailu = ztracený přístup i nedoručitelné platební údaje).

### 2. Tisk přihlášky

- Přihlášku lze kdykoli po vyplnění **vytisknout ve formátu oficiálního formuláře** (vzor 2026) — vypadá jako vyplněný papírový formulář ČPV.
- Navíc oproti vzoru: v zápatí **datum a čas tisku** a na dokumentu **QR kód vedoucí na detail přihlášky**. **Pozor — nikoli na editační odkaz** (na papíře by to bylo bezpečnostní riziko), ale na **view-only náhled** (pro nepřihlášeného), resp. **admin pohled** na tutéž přihlášku (pro přihlášeného admina) — tentýž pohled, jakým se přihláška „posílá k výdeji“ (větev 2: stejný QR slouží při sobotní prezenci).
- View-only náhled má vlastní token oddělený od editačního.
- Tisk dostupný z potvrzovací stránky, z view-only náhledu, z editačního rozhraní i z admin detailu.

### 3. Předpis platby

- Po potvrzení přihlášky se vygeneruje **předpis se splatností 7 dní** (od tohoto okamžiku): částka = suma položek přihlášky v online ceně — startovné za každého závodníka + případné další položky ceníku (splutí bez závodu, doprava).
- **Číselná řada s prefixem „H“**, obdoba předpisů u akcí (`event_payment_prescriptions.prescription_code`), stejný princip (částka, VS, zpráva pro příjemce, QR platba pokud ji u akcí máme). Platí se **výhradně na účet TJ Bohemians** (jako u akcí). Mapování „H“ řady na numerický variabilní symbol pro banku dořešit při grilování.
- **Komunikace splatnosti a upomínání:** splatnost 7 dní komunikujeme při vygenerování předpisu; po jejím marném uplynutí systém pošle **jednu upomínku** k zaplacení — další upomínky se už neposílají. Jinak se při nezaplacení průběžně **nic neděje**: termín není vymáhaný ani sankcionovaný (ale nikde to nepíšeme). Smysl sedmidenní splatnosti je **rozložit placení a evidenci plateb v čase** — nekoncentrovat všechno k 27. 9.
- **Finální hranice 27. 9.:** do ní platí online cena (sleva 50 Kč/položka při registraci a úhradě). Kdo do 27. 9. nezaplatí, riskuje zrušení přihlášky — řešeno **individuálně, ne automaticky**: pondělí 28. 9. je státní svátek; v úterý 29. 9. si organizátor nad aktuálním výpisem plateb projde nezaplacené přihlášky, individuálně je osloví s náhradním termínem „zaplatit dnes“, a ve středu 30. 9. s novým výpisem nezaplacené stornuje. Systém žádné automatické storno nedělá — jen pro tento proces poskytuje podporu (viz Přehled organizátora).
- Při každé změně počtu osob se předpis přepočítává, resp. vzniká rozdílový předpis (viz scénáře).

### 4. Úpravy přihlášky účastníkem (do 27. 9.)

- Odkaz z e-mailu otevře přihlášku k úpravám: přidat člověka, odebrat člověka, vyměnit člověka, opravit údaje (jméno, reg. číslo, kategorie), přeuspořádat pořadí řádků, přeskládat posádky.
- Do **neděle 27. 9. 2026** (7 dní před akcí) bez omezení a bez sankcí. Po tomto datu je samoobslužná editace zamčená — změny už jen přes organizátora (a na místě).
- **Odolnost proti ukliknutí**: destruktivní kroky (odebrání člověka, storno přihlášky) vyžadují explicitní potvrzení; smazání je soft-delete s možností obnovy organizátorem; každá změna je auditovaná (kdo — účastník přes token / admin, kdy, co, staré → nové hodnoty; stejný vzor jako `audit_log`).
- Každá relevantní změna generuje notifikační e-mail s rekapitulací (účastník má vždy aktuální stav v ruce, a zároveň je to obrana proti změnám, kterých si nevšiml).

### 5. Platby a párování

- **Veškeré finance jdou jen a pouze přes TJ Bohemians** — oddílový účet a Fio sync nejsou pro tento systém relevantní. Příchozí platby se do systému dostávají **importem výsledovky TJ Bohemians** (existující modul `finance-tj`, `import_fin_tj_transactions`) → `payment_ledger` → auto-match podle VS na předpisy „H“ řady. Přesná částka → spárováno; odchylka → návrh k ručnímu potvrzení (stejná logika jako u členských příspěvků/akcí).
- Stavy vůči přihlášce: nezaplaceno / částečně / zaplaceno / přeplatek. Zobrazovat je účastníkovi (přes edit-link) i organizátorovi.
- Pozor na **prodlevu výsledovky** — import z TJ není denní bankovní sync; mezi odesláním platby a jejím objevením v systému mohou uplynout i týdny. Komunikace stavů nesmí působit jako urgence („evidujeme platby k datu posledního importu X“, ne „NEZAPLACENO!“). Scénář „zaplaceno, ale ještě to nevidíme“ je tady normou, ne výjimkou.
- V posledním týdnu před akcí je naopak potřeba pracovat s čerstvými daty: na 29. 9. (individuální řešení nezaplacených) a 30. 9. (storno) organizátor počítá s aktuálními výpisy plateb — importy budou v tomto okně časté (denně/ad hoc).
- **Párování rozšířit na všechny pohyby závodu** — nejen příchozí startovné, ale i **odchozí vratky** a jakékoli další platby: každá vratka odeslaná účtárnou TJ se musí v následném importu výsledovky objevit a spárovat s evidovanou žádostí o vratku (uzavření smyčky). Funkčnosti kolem párování plateb je potřeba v tomto duchu rozšířit — dnes se párují jen příchozí platby.

### 6. Přeplatky, rozdílové platby a vratky

- Přidání osob po zaplacení → **rozdílový předpis** na doplatek (stejná splatnost 7 dní, vlastní položka v „H“ řadě).
- Odebrání osob po zaplacení → **přeplatek**; účastník může požádat o vrácení (tlačítko v edit rozhraní), nebo přeplatek nechat (vyřeší se na místě / propadne ve prospěch pořadatele — rozhodnout).
- **Vratky**: fronta žádostí pro organizátora; schválení → **e-mail na účtárnu TJ Bohemians** s pokynem k vratce (částka, protiúčet — primárně protiúčet skutečné příchozí platby; stejný pattern, jaký už používáme u proplácení nákladů akcí), účtárna odešle, systém vratku eviduje a následně **spáruje s odchozí platbou v importu výsledovky**. Auditované.
- **Zrušení akce**: hromadný scénář — všechny zaplacené přihlášky přejdou do stavu „k vrácení“, systém vygeneruje pro účtárnu TJ hromadný seznam vratek (částka + protiúčet), systém odškrtává podle importů výsledovky. Musí to být proveditelné pro nižší stovky plateb bez ručního dohledávání.

### 7. Přehled organizátora (admin)

- Dashboard závodu: počty přihlášek / lidí / lodí, rozpad podle kategorií, stav plateb (zaplaceno / částečně / nezaplaceno / přeplatky), fronta žádostí o vratku, přihlášky se stavem „ke kontrole“ (podezřelé duplicity, nevalidní kategorie…).
- Detail přihlášky: plná editace všeho (i po 27. 9.), historie změn, platební historie, možnost ručně přidat platbu (hotovost na místě), poslat znovu edit-link, storno přihlášky.
- **Podpora finálního doúčtování (29.–30. 9.):** filtr nezaplacených přihlášek po 27. 9., individuální oslovení s náhradním termínem, následné ruční storno nezaplacených — auditované, s možností obnovy.
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
8. Platba „v letu“ — odeslána, ale ještě není v importované výsledovce TJ (prodleva i týdny); účastník mezitím upravuje přihlášku. Nesmí dojít ke zmatení stavů ani k urgenci.
9. Platba dorazí až po odebrání člověka, na který byla určena (crossing platby a změny) → skončí jako přeplatek, standardní cesta.
10. Platba z cizího účtu (platí rodič, oddílová pokladna…) → párování dle VS funguje; vratka jde na protiúčet skutečné platby, ne „účet přihlášeného“.
11. Platba nikdy nepřijde → po splatnosti jedna upomínka, pak se až do 27. 9. nic neděje; 29. 9. individuální oslovení organizátorem s náhradním termínem „zaplatit dnes“, 30. 9. ruční storno nezaplacených. Pokud organizátor přihlášku ponechá, doplácí se na místě za cenu „na místě“.
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
33. Vratka odeslaná účtárnou TJ se v následném importu výsledovky nespáruje automaticky (odchylka částky, chybějící VS) → ruční párování; vratka nespárovaná po dalším importu = položka „ke kontrole“.

## Větev 1 (odloženo, mimo MVP): Integrace s databází ČSK

**Rozhodnutí pro verzi 1 (MVP):** žádná integrace — nebudeme nic předvyplňovat ani validovat reg. čísla proti ČSK; nemáme k dispozici žádná interní data z databáze členů, pracuje se jen s tím, co přihlašovatel zadá. Jediná kontrola: **duplicity v zadaných číslech ČSK** (napříč řádky i přihláškami). Vše níže je budoucí rozšíření — bude samostatné zadání + podklady pro jednání s ČSK:

- ČSK vede databázi oddílů; každý oddíl má správce a členy. Idea: přihlašovatel vybere oddíl z **našeptávače** (adresář oddílů ČSK je poloveřejný — název + číslo oddílu) a zadá — **bez nápovědy, jako důkaz oprávnění** — e-mail správce oddílu. Pokud se shoduje s ČSK evidencí, začneme mu **našeptávat členy oddílu** (jméno, příjmení, reg. číslo, ročník → automatické zařazení do kategorie). To by byl gamechanger: bezchybná reg. čísla, žádné překlepy, rychlé vyplnění.
- Co máme v ruce: vlastní oddílový export z ČSK (`zadani/csk_data-utf-2026-04-08-22-59-48.csv`) se strukturou `PRIJMENI; JMENO; DATUM_NAROZENI; ADRESA; OBEC; E-MAIL; TELEFON; FUNKCE; REG_CISLO; TR_TRIDA; ROZH_TRIDA; NSA-*; CLEN-OD/DO; SPORTOVEC-OD/DO; PROHLIDKA-OD/DO` — tj. ČSK data obsahují vše potřebné pro našeptávání (a víc, než bychom směli použít).
- **Eskalační škála využití ČSK dat** (od nejmenšího zásahu po gamechanger — lze jednat postupně, každý stupeň má samostatnou hodnotu):
  1. *Číselník oddílů* — název + číslo oddílu pro našeptávač v hlavičce přihlášky (adresář je poloveřejný, nejmenší GDPR zátěž).
  2. *Validace reg. čísla* — dotaz „existuje reg. číslo X a patří oddílu Y?“ (ano/ne, žádná osobní data k nám netečou; eliminuje překlepy = administrativní pochybení dle 6.8–6.10).
  3. *Našeptávání členů oddílu* po ověření správce — jméno, příjmení, reg. číslo, ročník (automatické zařazení do kategorie).
  4. *Příznak „registrovaný závodník“* dle bodu 1.6 (uhrazené příspěvky do 31. 3.) — zajímavé pro výsledky/celkové hodnocení, možná mimo rozsah přihlášek.

- **K projednání s ČSK — data:** přesný minimální rozsah polí pro stupeň 3 (jméno, příjmení, reg. číslo, ročník — nic víc); zdroj a aktuálnost (jak často se členská základna mění, sync před závodem); formát (API vs. periodický export typu našeho oddílového CSV).
- **K projednání s ČSK — právní režim (GDPR):** role správce/zpracovatele (ČSK správce členské DB, my správce dat závodu — předání mezi správci, nebo my zpracovatel pro ČSK?); právní titul (oprávněný zájem — konzistentní s doložkou na vzoru přihlášky 2026 — vs. plnění členské smlouvy vs. souhlas); minimalizace (preferovat režim, kdy data neopouštějí ČSK — autocomplete API vrací jen shody k dotazu, žádný plošný export); retence u nás (jen soutěžní rok, pak výmaz — zrcadlí doložku vzoru 2026); kdo plní informační povinnost vůči členům oddílů (ideálně ČSK v rámci členské agendy).
- **K projednání s ČSK — ověření správce oddílu:** mechanismus „zadá e-mail správce bez nápovědy“ vyžaduje, aby ČSK uměl potvrdit shodu, aniž by nám e-maily vydal — varianty: (a) porovnání na straně ČSK (my pošleme zadaný e-mail, ČSK vrátí ano/ne), (b) hash e-mailů správců u nás, (c) ověřovací e-mail rozesílá ČSK. Fallback bez ČSK: ověření proti kontaktní osobě z loňské papírové přihlášky, nebo ruční schválení organizátorem.
- **K projednání s ČSK — technika a proces:** existuje API / kdo spravuje členskou DB a zavody-cpv.cz (výsledkový servis už dnes validuje reg. čísla — na čem běží, nejde se napojit tam?); zabezpečení přístupu (token, rate limit, audit na jejich straně); s kým jednat (výbor sekce VT ČSK — cpv@kanoe.cz); precedens — řešil už tohle některý pořadatel?
- **Argumenty pro ČSK:** méně administrativních pochybení ve výsledcích (opravy dle 6.8–6.10 dnes zatěžují výbor), čistší data pro celkové hodnocení seriálu, pilot na našem závodě s možností nabídnout systém i ostatním pořadatelům ČPV.

## Větev 2 (rozpracovat do samostatného zadání): Prezence, spolupráce s výdejním systémem, výdej startovních čísel

Úkol této větve: **navrhnout flow a spolupráci s druhým systémem — a lidmi kolem něj —, který dnes zajišťuje evidenci přihlášek na místě, přidělení startovních čísel a tisk výdejky startovního čísla.** Návrh níže je výchozí podklad k projednání s týmem výdeje; rozpracuje se do samostatného zadání.

### Dnešní proces (dle propozic 2024)

V sobotu 8:00–11:30 přihlašování a placení (výklad trati 9:00, start první lodi 9:30, poslední 12:30). Lidé ve frontě odevzdají papírovou přihlášku → „přední“ stanoviště spočítá lidi a vybere hotovost → papír jde „dozadu“, kde ho obsluha **výdejního systému** přepíše do PC, lodím přidělí startovní čísla (souvislá řada, sekvenčně, v pořadí příchodu a v závazném pořadí řádků přihlášky) → vytiskne se **výdejka startovních čísel** → čísla se fyzicky vydají. Kdo přijde, ten fyzicky je; pořadí příchodu = pořadí startu; jiné pořadí výdeje než sekvenční od začátku neexistuje. Občerstvení v cíli se vydává proti vrácení čísla; ztráta čísla stojí 500 Kč.

### Aktéři

| Aktér | Role |
|---|---|
| Účastník (kontaktní osoba oddílu) | přichází s QR (vytištěná přihláška nebo mobil), řeší doplatek, přebírá čísla |
| Prezence („přepážka“ vpředu) | skenuje QR, kontroluje stav přihlášky a plateb, inkasuje hotovost, zařazuje do fronty |
| Výdejní systém + obsluha („vzadu“) | dnes samostatná evidence: přiděluje startovní čísla, tiskne výdejku |
| Náš systém (OVT správa) | zdroj pravdy o přihláškách a platbách, fronta k výdeji |

### Navržené flow v sobotu ráno

1. Účastník přijde s QR kódem — z vytištěné přihlášky (viz Tisk přihlášky) nebo z potvrzovacího e-mailu v mobilu.
2. Prezence naskenuje QR mobilem → otevře se **admin pohled na přihlášku** (tentýž, na který vede QR z tisku): aktuální složení (lidé/lodě/kategorie), stav plateb, co doplatit či vrátit.
3. Hotovost se vyřeší na místě (doplatek, případně vrácení přeplatku) a ihned zaeviduje (cash platba v ledgeru).
4. Tlačítko **„Zařadit k výdeji“** → přihláška vstupuje do **fronty výdeje** s časovým razítkem; pořadí fronty = závazné pořadí přidělování čísel.
5. Lodím přihlášky se přidělí souvislý blok startovních čísel v pořadí řádků → tisk výdejky → fyzický výdej čísel.
6. Po dojetí se vrácení čísel odškrtává proti výdejce (občerstvení proti vrácení; ztráta 500 Kč).

### Integrace s výdejním systémem — varianty k projednání

- **(a) Výdejní systém čte naši frontu** — obrazovka nebo exportní feed z našeho systému nahradí přepisování papíru; čísla přiděluje a výdejku tiskne dál výdejní systém. Nejmenší zásah do zaběhnutého procesu; odpadá přepis — dnešní největší úzké hrdlo a zdroj chyb.
- **(b) Náš systém převezme i přidělování čísel a tisk výdejky** — výdejní systém (resp. zpracování výsledků) dostane až hotovou startovku. Největší přínos, ale i největší změna pro tým výdeje.
- **(c) Přechodná varianta „průvodka“** — prezence z našeho systému vytiskne kompletní čitelnou přihlášku a ta putuje „dozadu“ jako dnes papír; obsluha přepisuje z úplného, čitelného podkladu. Nulová integrace, přesto eliminuje nečitelné ručně psané přihlášky.
- Varianty lze kombinovat v čase (c → a → b, podle důvěry a kapacity týmu). **K projednání s lidmi kolem výdejního systému:** co je to za software a kdo ho ovládá, jaká data potřebuje na vstupu, v jakém formátu umí přijmout startovku/frontu, a co je pro tým přijatelné už pro ročník 2026.

### Pevný start předem

Na přihlášce lze zaškrtnout „chci startovat hned na začátku; beru na vědomí, že jsem tím pevně zařazen ke startu, a pokud to neodvolám do čtvrtka 1. 10. večer, čísla mi takto zůstanou a je moje zodpovědnost si je vyzvednout“. Bloky čísel pro tyto přihlášky se přidělí předem (výdejky nachystané) — třeba polovina startovního pole může být daná předem a sobotní fronta se dramaticky zkrátí.

### Další témata větve 2

Evidence vrácení čísel (zodpovídá kontaktní osoba oddílu, bod 1.7; navazuje poplatek 500 Kč za ztrátu), papírová podpisová listina při prezenci (možné řešení otázky podpisů — otázka 1), souběh více prezenčních stanovišť (jedna fronta?), offline odolnost (síť v kempu na břehu potoka), samostatné odbavení soutěže mládeže (jiný čas i místo startu).

## Nefunkční požadavky a architektonické poznámky

- **Veřejný perimetr.** Veřejné přihlášky na oddílové akce už existují (edit-link s tokenem) a jsou zdrojem inspirace i ověřených vzorů. Tohle je ale první veřejná část **samostatně přístupná bez přihlášení** (vlastní vstupní stránka, přihlášku nezakládá nikdo zevnitř systému) a s komplexním životním cyklem přihláška → platba → změny → vratky. Bezpečnostní požadavky: tokeny s dostatečnou entropií, **oddělené tokeny pro view-only náhled a pro editaci** (QR na tištěné přihlášce vede jen na view), rate limiting, žádný únik osobních dat mezi přihláškami, oddělení od admin API. Zásadní bod pro grilování.
- **GDPR:** sbíráme osobní údaje cizích lidí (jména, ročníky, reg. čísla, kontakty). Oficiální vzor 2026 už nepracuje se souhlasem, ale s **informací o zpracování na základě oprávněného zájmu pořadatele**: kontaktní údaje kontaktní osoby se uchovávají do konce soutěžního roku a poté se likvidují; jméno, příjmení a rok narození závodníka slouží k identifikaci a rozřazení a zveřejňují se ve výsledkových listinách. Online systém tento režim převezme (informační povinnost na formuláři, retence/anonymizace kontaktů po konci soutěžního roku); u online plateb navíc dořešit retenci platebních údajů (protiúčty) vůči účetním povinnostem.
- **Audit všeho** — stejný standard jako zbytek systému (`audit_log`), včetně akcí provedených účastníkem přes token (aktér = přihláška/token, ne admin e-mail).
- **E-maily přes Resend** — potvrzení, rekapitulace změn, platební údaje, edit-linky; pozor na kvóty a doručitelnost (SPF/DKIM už vyřešeno pro is.ovtbohemians.cz).
- **Vztah k existujícímu modulu akcí:** předpisy „H“ řady jsou obdobou `event_payment_prescriptions`; přihláškový model (registrace s více osobami, edit-link) je obdobou `event_registrations`. Při grilování rozhodnout: rozšíření stávajících tabulek vs. samostatné tabulky pro závod (kandidát: samostatné — veřejný závod má jinou strukturu řádků/posádek a jiný lifecycle, sdílet jen ledger + párování).
- **Znovupoužitelnost:** navrhnout tak, aby šel systém použít pro další ročníky (závod = entita s termínem, sazbou startovného, deadline změn), ne jednorázový hardcode roku 2026.

## Otevřené otázky

1. **Podpis / kvalifikované stvrzení prohlášení.** Papírový podpis stvrzuje bezpečnostní prohlášení + vzetí na vědomí informace o zpracování osobních údajů (u nezletilých podpis osoby povinné dohledem). Jak nahradit online? Kandidáti: (a) checkbox + auditovaný záznam (kdo, kdy, IP) — právně nejslabší, ale bezbariérové; (b) potvrzení odkazem z e-mailu (double opt-in); (c) podpisová listina vytištěná ze systému a podepsaná fyzicky při prezenci v sobotu (kombinuje online data s papírovým podpisem — dnes fakticky nejblíž současné praxi); (d) kombinace a + c. **Necháno otevřené na pokyn uživatele.**
2. **Oficiální název závodu v kalendáři ČPV** — doplnit (termín potvrzen: sobota 3. 10. 2026; návrh cen 2026 je na webu — viz sekce Hamerák, startovné se závodem 300 Kč / online 250 Kč).
3. **Mapování „H“ řady na variabilní symbol** — VS musí být numerický; jak přesně kóduje řadu (např. VS = `8` + pořadové číslo?), jednotný vs. per-předpis VS.
4. **Osud neproplacených přeplatků** — vratka na žádost; co s přeplatky, o které si nikdo neřekne (propadají? aktivně vracíme vše po závodě?).
5. **Kapacita závodu** — existuje strop počtu lodí? (Ovlivňuje potřebu „pod čarou“ logiky známé z akcí.) Předpoklad: bez limitu.
6. **Rozdílový předpis vs. přepis částky** u nezaplaceného předpisu (scénář 14/16) — jednodušší UX vs. čistší účetní stopa; souvisí s již zgrilovaným mechanismem návrh/potvrzení změny částky předpisu ([2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md)).
7. **Ověření e-mailu před vznikem přihlášky** (double opt-in) — ano/ne; chrání proti překlepům a spamu, přidává tření.
8. **Vícejazyčnost** — stačí čeština? (ČPV je česká soutěž; předpoklad: ano, jen česky.)
9. **Účast závodníků do 18 let na Hameráku** — pojedou dětské a mládežnické kategorie (mládež K1H, K1D, C2M), případně junioři mladší 18 let? Rozhodnutí pořadatele. Propozice 2024: hlavní závod **16+**, soutěž mládeže **samostatná** (start 14:00 ve Dvorečku) — pro 2026 potvrdit a rozhodnout, zda a jak se mládežnická soutěž přihlašuje online (odděleně od hlavního závodu?). Dopad: rozsah číselníku kategorií ve formuláři, stvrzení osobou povinnou dohledem (otázka 1), pravidlo „do 18 let přihlašuje vysílající složka“ (bod 1.7), případná úprava trati pro mládež (bod 4.7 pravidel).
10. **Využití dat ČSK — rozsah a režim.** Pro MVP rozhodnuto: **bez jakýchkoli ČSK dat** (viz větev 1) — jen kontrola duplicit zadaných čísel. Otázka zůstává pro další fáze: co a v jakém režimu můžeme z databáze ČSK využít, aby to bylo vyvážené mezi GDPR a praktičností/UX — škála od číselníku oddílů po našeptávání členů po ověření správce. Řídíme se stavem platným pro rok 2026; k projednání s ČSK.
11. **Rozsah online prodeje a cenový model 2026.** Částečně rozhodnuto (2026-08-05): **(a) ANO — online přihláška prodává i splutí bez závodu a dopravu** (všechny položky ceníku); přesná podoba položek na přihlášce (počty kusů vs. jmenovité osoby) ke grilování. **(c) vyřešeno komunikačním modelem** v sekci Předpis platby: splatnost 7 dní od vygenerování + jediná upomínka po splatnosti, jinak se nic neděje; hranice 27. 9. (online cena), individuální doúčtování 29. 9. a ruční storno nezaplacených 30. 9. Zbývá ke grilování: **(b)** technické promítnutí online ceny do předpisu (cena podle data úhrady vs. vzniku předpisu; platba odeslaná před 27. 9., ale importovaná později — jak ji poznáme včas) a napojení doplatku 50 Kč/položka při platbě na místě.

## Vazby a podklady

- `zadani/Pravidla_CPV_2026_full.pdf` — oficiální pravidla ČPV 2026, lokální kopie ([originál na kanoe.cz](https://www.kanoe.cz/img/turistika/2026/Pravidla_CPV_2026_full.pdf), ověřeno checksum).
- `zadani/Prihl_CPV_vzor.xlsx` — oficiální vzor přihlášky 2026 s číselníkem kategorií a GDPR doložkou ([originál](https://www.kanoe.cz/img/turistika/2026/Prihl_CPV_vzor.xlsx)).
- `zadani/Prihl_CPV_2016_Blanice.pdf` — historický vzor papírové přihlášky 2016 (struktura shodná se vzorem 2026, liší se GDPR text — 2016 „souhlas“, 2026 „informace o zpracování“; referenční je vzor 2026).
- `zadani/CPV-Hamersky-potok-2024-propozice.pdf` — propozice Hameráku 2024 (věkový limit 16+, samostatná soutěž mládeže, poplatky, harmonogram prezence, občerstvení proti vrácení čísla).
- `zadani/csk_data-utf-2026-04-08-22-59-48.csv` — export členů našeho oddílu z ČSK databáze (struktura dat pro větev 1).
- [Stránka ČPV na kanoe.cz](https://www.kanoe.cz/vodni-turistika/pyranha-cup-cpv), [výsledky zavody-cpv.cz](http://www.zavody-cpv.cz).
- [2026-06-15-zivotni-cyklus-akce.md](2026-06-15-zivotni-cyklus-akce.md) — přihlášky na oddílové akce (edit-link princip, předpisy, zálohy) — ideový předchůdce.
- [2026-04-10-rekonciliace-plateb-v1.md](2026-04-10-rekonciliace-plateb-v1.md) — payment ledger, auto-match, split alokace — platební základ, na kterém stavíme.
- Modul importu výsledovky TJ Bohemians (`src/lib/actions/finance-tj.ts`, tabulky `import_fin_tj_*`) — jediná cesta, kudy do systému tečou bankovní pohyby závodu (příchozí platby i odchozí vratky).
- [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) — mechanismus změny částky předpisu (otevřená otázka 6).
