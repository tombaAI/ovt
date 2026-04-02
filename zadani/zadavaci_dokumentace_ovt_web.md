# Zadávací dokumentace

## Informační systém OVT

- Verze: draft v1
- Datum: 2. 4. 2026
- Účel dokumentu: rozpracovat původní stručné zadání do podoby použitelné pro návrh, nacenění a implementaci webové aplikace.

> Poznámka k technickému stacku po navazující oponentuře:
> Sekce 9, 10 a poslední technické doporučení v sekci 14 odrážejí původní variantu s limitem do 1000 Kč za rok a preferencí českého sdíleného hostingu.
> Pokud se projekt realizuje na stacku Vercel + Supabase + Resend, má pro technické rozhodnutí přednost dokument `zadani/technicka_oponentura_vercel_supabase_resend.md`.
> Funkční požadavky v tomto dokumentu zůstávají nadále platné.

## 1. Cíl projektu

Cílem je vytvořit interní webovou aplikaci pro OVT, která nahradí stávající evidenci vedenou v Excel souborech a sjednotí agendy členské evidence, členských příspěvků, lodí, brigád a podpory činnosti.

Aplikace má být v první iteraci určena pro více správců a musí běžet na veřejně dostupném hostingu, ideálně u providera v ČR nebo alespoň v EU. Musí obsahovat databázi a být navržena tak, aby šla později rozšířit o samoobslužné rozhraní pro členy.

## 2. Vstupní podklady

Jako zdroj současného fungování byly analyzovány tyto soubory:

- OVT Příspěvky.xlsx
- OVT Krakorce.xlsx
- OVT Podpora činnosti.xlsx
- OVT Finance.xlsx
- popis_zadani_1.txt

Z těchto podkladů vyplývá, že dnes existují minimálně tyto samostatné agendy:

- evidence členů a jejich kontaktních údajů
- evidence ročních příspěvků a plateb
- evidence lodí uložených v krakorcích
- evidence brigád a jejich dopadu na příspěvky v dalším roce
- evidence typových a individuálních slev
- evidence podpory činnosti a vyúčtování akcí
- historická data za více let

## 3. Základní východiska a omezení

- V1 bude interní agenda pouze pro správce.
- V první etapě nemusí být přihlášení přes Google podmínkou.
- Google OAuth je vhodné budoucí rozšíření pro další etapu.
- Správců bude více.
- V první etapě je cílem co nejjednodušší provoz: lokální vývoj a jedno hostované prostředí.
- Samostatná DEV, STAGING a PROD prostředí nejsou startovní požadavek.
- Aplikace musí být navržena tak, aby bylo možné později doplnit portál pro členy.
- Počet členů je nyní přibližně 50.
- Počet lodí je o něco menší než počet členů.
- Roční objem odeslaných e-mailů je v nízkých stovkách.
- Nejsou speciální regulatorní požadavky nad rámec běžné ochrany osobních údajů.
- Rozpočet na provoz je cíleně do 1000 Kč za rok.
- V1 má obsahovat import stávajících dat z Excelů.
- Odesílání e-mailů bude v budoucí implementaci přes Resend.

## 4. Hlavní business cíle

Systém má pokrýt tyto potřeby:

1. Přestat provozně záviset na několika ručně udržovaných Excel souborech.
2. Mít jednotnou pravdu o členech, jejich statutu, slevách, lodích, brigádách a platbách.
3. Umožnit připravit a rozeslat personalizované výzvy k platbě včetně QR kódu.
4. Evidovat, kdo zaplatil, kdy zaplatil, kolik zaplatil a zda zaplatil včas.
5. Umožnit posílat připomínky neplatičům.
6. Evidovat podporu činnosti jako samostatnou agendu s ročním rozpočtem, rezervacemi a vyúčtováním.
7. Udržet řešení jednoduché na provoz, levné a rozšiřitelné.

## 5. Rozsah řešení pro V1

### 5.1 Evidence členů

Systém musí umožnit kompletní CRUD nad členy.

Požadované údaje člena:

- interní identifikátor
- jméno a příjmení
- e-mail
- telefon
- adresa
- datum narození, pokud je potřeba z historických dat
- členské číslo ČSK, pokud existuje
- variabilní symbol pro platby
- stav členství v OVT
- poznámka

Požadavky:

- evidovat aktivní i historické členy
- umět odlišit aktivního člena, nečlena a ukončené členství
- vyhledávání a filtrování v seznamu členů
- zobrazení detailu člena včetně historie příspěvků, lodí, brigád a slev

### 5.2 Typy slev a kategorie

Systém musí podporovat kombinaci pevných kategorií a individuálních slev.

V současné logice existují minimálně:

- sleva pro výbor
- sleva pro vedoucí TOM
- individuální sleva

Požadavky:

- evidovat seznam členů výboru
- evidovat seznam vedoucích TOM
- evidovat individuální slevu přidělenou konkrétnímu členu
- mít správu typů slev odděleně od konkrétních členů
- umožnit, aby výše slev byla nastavena po ročnících jako součást ceníku
- umožnit ruční override pro jednotlivého člena

### 5.3 Brigády

Systém musí umožnit evidovat brigády a jejich účastníky.

Brigáda obsahuje minimálně:

- datum brigády
- vedoucího brigády
- seznam zúčastněných členů
- poznámku

Business pravidlo:

- účast na brigádě ovlivňuje příspěvky pro další rok
- v historických datech se brigáda projevuje jako splněná nebo nesplněná podmínka, typicky formou přirážky za neodpracovanou brigádu

Požadavky:

- přidat brigádu ručně
- hromadně zapsat účastníky
- v detailu člena vidět, zda má brigádu pro další příspěvkové období splněnou
- umožnit ruční opravu stavu brigády

### 5.4 Lodě a krakorce

Systém musí obsahovat samostatnou evidenci lodí.

Z Excelů vyplývají minimálně tyto atributy lodě:

- identifikace umístění v krakorcích nebo jiné pozici
- majitel nebo odpovědný člen
- popis lodě
- barva
- příznak, zda je na pozici skutečně loď
- stav zaplacení
- poznámka
- případně foto nebo odkaz na foto

Požadavky:

- evidovat lodě samostatně, ne jen jako několik sloupců u člena
- umožnit přiřazení lodě ke členu
- umožnit jednomu členu více lodí
- evidovat pořadí lodí pro účely ceníku
- evidovat tarif lodě podle ročníku ceníku
- umožnit výjimky a ruční úpravy pro zvláštní případy

Aktuálně potvrzené pravidlo pro rok 2026:

- první loď člena: 1200 Kč
- druhá loď člena: 800 Kč
- třetí loď člena: 800 Kč

Z historických dat je zřejmé, že ceny lodí se mezi lety mění a v některých letech existují i výjimky. Systém proto nesmí mít cenu lodí natvrdo v kódu.

### 5.5 Roční příspěvky

Systém musí umět spravovat příspěvky po jednotlivých ročnících.

Každý ročník příspěvků musí mít vlastní sadu pravidel a ceník.

Pro každého člena musí systém umět vypočítat výslednou částku z kombinace:

- základního příspěvku
- kategoriálních slev
- individuální slevy
- stavu brigády
- lodí a jejich tarifů
- případných ručních korekcí

V detailu výpočtu musí být zřejmé:

- jaká byla základní částka
- jaké slevy nebo přirážky byly použity
- jaký dopad měly lodě
- jaká je výsledná částka k úhradě

Z historických dat vyplývají tyto změny parametrů, které musí systém umět konfigurovat po ročnících:

- základní příspěvek byl v letech 2020 až 2022 typicky 800 Kč
- základní příspěvek byl v letech 2023 až 2025 typicky 1000 Kč
- základní příspěvek je v roce 2026 typicky 1500 Kč
- sleva pro výbor a pro vedoucí TOM byla historicky typicky -400 Kč, nově -500 Kč
- přirážka za nesplněnou brigádu byla historicky typicky 400 Kč, později 500 Kč
- ceny lodí se mezi lety měnily a nesmí být součástí pevné logiky

### 5.6 Platební agenda

V1 má zatím řešit ruční evidenci plateb. Napojení na Fio banku je mimo rozsah V1 a bude řešeno později.

Systém musí umožnit:

- ručně označit člena jako zaplaceného
- zadat datum platby
- zadat skutečně zaplacenou částku
- evidovat částečnou platbu
- evidovat pozdní platbu
- evidovat poznámku k platbě
- evidovat, zda částka odpovídá očekávané částce

Přehledy musí umožnit minimálně filtrovat:

- nezaplaceno
- zaplaceno
- zaplaceno pozdě
- částečně zaplaceno
- rozdíl oproti očekávané částce

### 5.7 E-mailing a platební výzvy

Systém musí podporovat přípravu a odeslání personalizovaných e-mailů.

V1 musí podporovat:

- vygenerování personalizovaného textu výzvy k platbě
- vygenerování QR kódu pro českou platbu v Kč na český účet
- odeslání jednotlivého e-mailu
- odeslání hromadné kampaně vybraným členům
- připomínky neplatičům

Personalizace musí umět pracovat minimálně s těmito proměnnými:

- jméno člena
- výsledná částka
- účet a variabilní symbol
- termín splatnosti
- rozpis položek, proč je částka taková, jaká je

Systém musí evidovat historii odeslaných e-mailů:

- komu byl e-mail poslán
- kdy byl poslán
- jaký template byl použit
- k jakému ročníku příspěvků se vztahoval

### 5.8 Evidence podpory činnosti

Jde o samostatný modul.

Systém musí umožnit evidovat akce, na které oddíl poskytuje dotaci nebo podporu činnosti.

Každá akce musí mít minimálně:

- datum akce
- název akce
- typ akce
- rezervovanou částku, pokud existuje
- požadovanou částku
- informaci, zda je na dotaci nárok
- schválenou nebo efektivní částku
- skutečně využitou částku
- odpovědnou osobu za vyúčtování
- stav vyúčtování
- poznámku

Systém musí evidovat roční rozpočet podpory činnosti a umět spočítat, kolik prostředků je právě volných.

#### Pravidla odvozená z podkladů

Pravidla musí být v systému konfigurovatelná, ne natvrdo zapsaná v kódu.

Aktuálně z podkladů vyplývá:

- roční rozpočet podpory činnosti je typicky 30 000 Kč
- základní dotace na jednu akci je 2 000 Kč
- některé akce mají předem rezervovanou částku
- vybrané akce mohou mít až dvojnásobnou dotaci, typicky do 4 000 Kč
- pro některé akce existují konkrétní částky, například jednotlivé ČPV a zahraniční voda
- platí limit 200 Kč na člena a den
- dotace nesmí překročit relevantní náklady
- dotace je určena členům oddílu, ne nečlenům
- dotace musí mít dostatek volných prostředků v rozpočtu
- akce čerpají prostředky podle pořadí data konání, přičemž některé prioritní akce mají rezervaci předem
- o novou akci je třeba požádat předem, pokud už nemá rezervaci
- akce musí být následně vyúčtována

#### Procesní požadavky pro V1

Systém musí umět:

- založit ročník podpory činnosti s rozpočtem
- založit akci s rezervací nebo bez rezervace
- spočítat orientační nárok na dotaci podle pravidel
- ukázat, kolik prostředků je aktuálně ještě volných
- uzavřít akci vyúčtováním a skutečnou částkou
- zaznamenat, kdo vyúčtování dodal a zda už bylo vyplaceno

V1 nemusí řešit detailní evidenci všech účastníků akce, ale datový model s tím má do budoucna počítat.

### 5.9 Import dat z Excelů

V1 musí obsahovat import existujících dat.

Import musí pokrýt minimálně:

- členy
- historické příspěvky po ročnících
- lodě
- podporu činnosti

Požadavky na import:

- validace před potvrzením importu
- zobrazení mapování sloupců
- log chyb a neimportovaných řádků
- možnost opakovaného importu v průběhu implementace před ostrým přechodem

Není potřeba řešit plnohodnotnou trvalou synchronizaci Excel <-> aplikace.

### 5.10 Administrace a přístupová práva

V1:

- jediná role je správce
- v první etapě stačí jednoduché bezpečné admin-only přihlášení
- Google OAuth je volitelné budoucí rozšíření
- přístup pouze pro předem schválené admin účty nebo e-mailové adresy

Do budoucna:

- člen
- organizátor akce
- účetní nebo omezený správce

## 6. Datový model

Níže je doporučený koncept entit. Nejde o finální fyzický model databáze, ale o požadovaný business model.

### 6.1 Základní entity

- Člen
- Admin účet
- Ročník příspěvků
- Ceník příspěvků
- Typ slevy
- Přiřazení slevy členu
- Brigáda
- Účast člena na brigádě
- Loď
- Tarif lodě
- Roční výpočet příspěvku člena
- Platba
- E-mailová šablona
- Odeslaný e-mail
- Ročník podpory činnosti
- Akce podpory činnosti
- Vyúčtování akce
- Import běh
- Importní chyba

### 6.2 Doporučené vazby

- jeden člen může mít více lodí
- jeden člen může mít více přiřazených slev, ale systém musí umět rozlišit kategoriální a individuální slevy
- jeden člen může mít pro každý rok právě jeden záznam výpočtu příspěvků
- jeden záznam výpočtu příspěvků může mít více plateb
- jedna brigáda má více účastníků
- jeden ročník podpory činnosti má více akcí
- jedna akce podpory činnosti může mít jednu nebo více položek vyúčtování

### 6.3 Co nesmí být natvrdo v kódu

- výše základního příspěvku
- výše kategoriálních slev
- přirážka za nesplněnou brigádu
- ceník lodí
- roční rozpočet podpory činnosti
- seznam prioritních akcí a rezervovaných částek
- texty e-mailových šablon

## 7. Hlavní workflow

### 7.1 Roční workflow příspěvků

1. Správce založí nový ročník příspěvků.
2. Správce nastaví ceník pro daný rok.
3. Systém načte nebo vytvoří seznam členů pro daný rok.
4. Správce doplní slevy, lodě a brigády.
5. Systém vygeneruje výpočty příspěvků.
6. Správce výpočty zkontroluje a ručně opraví výjimky.
7. Systém vygeneruje personalizované výzvy k platbě a QR kódy.
8. Správce odešle e-maily.
9. Správce průběžně eviduje platby.
10. Systém umožní posílat připomínky těm, kdo nezaplatili.

### 7.2 Workflow podpory činnosti

1. Správce založí ročník podpory činnosti a rozpočet.
2. Založí akce s rezervací nebo bez ní.
3. Systém spočítá orientační dostupnost prostředků.
4. Po akci správce nebo odpovědná osoba doplní vyúčtování.
5. Systém uloží schválenou a skutečně čerpanou částku.
6. Systém průběžně přepočítává volný zůstatek rozpočtu.

## 8. Ne-funkční požadavky

### 8.1 Bezpečnost a přístup

- aplikace musí běžet pouze přes HTTPS
- jednoduché bezpečné admin-only přihlášení, Google OAuth až jako volitelné rozšíření
- whitelist administrátorů
- audit základních změn v citlivých datech
- ochrana osobních údajů v běžném rozsahu

### 8.2 Provoz a údržba

- jednoduchý deployment
- v první etapě není potřeba budovat samostatné staging prostředí bez jasného praktického přínosu
- běh bez potřeby trvale běžícího workeru, pokud to dovolí zvolený hosting
- možnost pravidelného zálohování databáze
- export dat pro zálohu a přenositelnost

### 8.3 Uživatelská přívětivost

- responzivní webové rozhraní použitelné na notebooku i mobilu
- důraz na přehledné tabulky, filtry a detail člena
- minimum nutných kliků pro běžnou administrativu

### 8.4 Rozšiřitelnost

Návrh musí počítat s budoucími oblastmi:

- Fio API a automatické párování plateb
- samoobsluha členů
- synchronizace s ČSK
- platby na ČSK
- přehlednější finance obecně
- soutěže
- náklady na vlek
- přeúčtování TOM
- Hamerák a další akce včetně kompletní finanční evidence
- případná synchronizace s dalšími systémy

## 9. Hostingový research a dopad na architekturu

### 9.1 Zjištění z veřejně dohledatelných providerů

Byly prověřeny veřejné nabídky českých providerů, zejména Active24, FORPSI a Webglobe.

#### Sdílený hosting

| Provider | Varianta | Orientační cena po 1. roce | Veřejně dohledatelné vlastnosti | Hodnocení pro tento projekt |
| --- | --- | --- | --- | --- |
| Active24 | Webhosting Simple | 59 Kč bez DPH měsíčně | 1 doména, 1 až 3 GB SSD, neomezené e-maily, FTP a databáze, PHP 8.4 | Cenově se vejde, technicky použitelný pro jednoduchý monolit s DB |
| FORPSI | Easy Hosting Linux | 65 Kč bez DPH měsíčně | 1 web, 1 databáze, SSH přístup, MySQL, Linux skriptování | Cenově se vejde, vhodný pro jednoduchý monolit s jednou DB |
| Webglobe | Webhosting Start | 69 Kč bez DPH měsíčně | 1 doména, 5 GB disk, 1 databáze, 5 schránek | Technicky použitelný, ale po DPH je lehce nad cílovým limitem 1000 Kč ročně |

#### VPS a vlastní stack

| Provider | Varianta | Orientační cena | Veřejně dohledatelné vlastnosti | Hodnocení pro tento projekt |
| --- | --- | --- | --- | --- |
| Active24 | VPS Custom / Starter | od cca 302,60 až 455,40 Kč bez DPH měsíčně | root přístup, vlastní konfigurace, Ubuntu, KVM | Funkčně vhodné, ale výrazně mimo provozní rozpočet |
| Webglobe | VPS Start | 329 Kč bez DPH měsíčně | 1 CPU, 2 GB RAM, 20 GB SSD, Linux, root přístup | Funkčně vhodné, ale výrazně mimo provozní rozpočet |

### 9.2 Závěr researchu

Při limitu do 1000 Kč za rok jsou realistické hlavně varianty na sdíleném hostingu.

To má zásadní dopad na technický návrh:

- řešení musí fungovat jako jednoduchý webový monolit
- databáze musí být běžná sdílená MySQL nebo MariaDB
- periodické úlohy je vhodné řešit přes cron
- není vhodné spoléhat na trvale běžící fronty, kontejnery nebo vlastní serverové procesy
- pokud by měl být backend v Pythonu nebo Node.js se silnějšími provozními nároky, rozbije se provozní rozpočet a typicky i vhodnost českého sdíleného hostingu

## 10. Doporučená technická varianta

### 10.1 Doporučená varianta pro V1

Nejpraktičtější varianta pro zadané omezení je:

- webový monolit
- relační databáze MySQL nebo MariaDB
- hostování na českém sdíleném hostingu
- jednoduché admin-only přihlášení, Google OAuth případně až později
- Resend pro odesílání e-mailů
- cron pro pravidelné úlohy

### 10.2 Proč je to doporučené

Tato varianta:

- splní provozní rozpočet
- odpovídá možnostem veřejných providerů v ČR
- je dostatečná pro interní aplikaci o desítkách členů a stovkách e-mailů ročně
- umožní pozdější migraci na silnější hosting bez změny business modelu

### 10.3 Co nedoporučuji pro V1

Pro V1 nedoporučuji stavět řešení, které vyžaduje:

- vlastní VPS
- Docker jako nutnou součást provozu
- oddělený frontend a backend se složitým deploymentem
- trvale běžící queue workery
- komplikovanou infrastrukturu jen kvůli malé interní agendě

### 10.4 Praktické doporučení k výběru providera

Nejlepší fit pro zadaný provozní limit:

1. Active24 Webhosting Simple nebo Smart, pokud bude potřeba víc prostoru nebo pohodlnější rezerva.
2. FORPSI Easy Hosting Linux, pokud bude stačit jedna databáze a jednoduchý deployment.

Webglobe dává smysl technicky, ale je hůře sladitelný s cílovým limitem do 1000 Kč ročně.

## 11. Návrh rozdělení na etapy

### Etapa 1: Základ systému

- jednoduché admin-only přihlášení
- členové
- lodě
- slevy
- brigády
- import dat

### Etapa 2: Příspěvky a e-mailing

- ročník příspěvků
- výpočty
- QR kódy
- e-mailové kampaně
- ruční evidence plateb
- přehled neplatičů

### Etapa 3: Podpora činnosti

- roční rozpočet
- akce
- rezervace a žádosti
- vyúčtování
- přehled čerpání

### Etapa 4: Budoucí rozšíření

- Fio API
- portál pro členy
- synchronizace s ČSK
- další finanční moduly

## 12. Otevřené body

Tyto body neblokují sepsání zadání, ale bude vhodné je potvrdit před implementací:

- přesná pravidla pro vzácné historické výjimky v příspěvcích a tarifech lodí
- finální textace e-mailových šablon a připomínek
- přesná podoba výstupních přehledů a exportů
- zda má být součástí V1 auditní log po položkách nebo stačí základní historie změn
- zda se mají v rámci podpory činnosti později evidovat i jednotliví účastníci akcí

## 13. Doporučení pro implementační zadání

Pokud se z tohoto dokumentu bude připravovat přímo implementační backlog, doporučuji další krok rozdělit do těchto balíků:

1. datový model a importy
2. členská agenda a lodě
3. výpočet příspěvků
4. platební agenda a QR
5. e-mailing
6. podpora činnosti
7. provoz, zálohy a audit

## 14. Shrnutí rozhodnutí

- V1 je interní webová agenda pro správce.
- V1 vystačí s jednoduchým admin-only přihlášením.
- Google OAuth je budoucí rozšíření, ne podmínka startu.
- Pro první etapu stačí lokální vývoj a jedno hostované prostředí.
- Import stávajících Excel dat je součástí V1.
- Odesílání e-mailů bude přes Resend.
- Systém musí mít konfigurovatelný ceník po ročnících.
- Systém musí samostatně evidovat lodě, brigády a podporu činnosti.
- Nejlepší technický fit vzhledem k rozpočtu a českým providerům je jednoduchý webový monolit na sdíleném hostingu s databází.