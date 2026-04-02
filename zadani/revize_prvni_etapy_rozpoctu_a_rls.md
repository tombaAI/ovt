# Revize první etapy, rozpočtu a RLS

- Datum: 2. 4. 2026
- Kontext: tento dokument zpřesňuje technické rozhodnutí po doplnění těchto faktů:
  - provozní limit kolem 1000 Kč za rok je opravdu tvrdý
  - Google OAuth není podmínka první etapy
  - první etapa je interní admin evidence
  - důležitá je budoucí přenositelnost bez bolestivého refaktoru

## 1. Krátký závěr

Pro první etapu doporučuji tento režim:

- web na Vercel Hobby
- databáze na Supabase Free jako rozpočtový kompromis
- Resend Free pro transakční e-maily s ověřenou subdoménou
- bez závislosti na Google OAuth v první etapě
- bez závislosti na RLS jako hlavním bezpečnostním mechanismu v první etapě
- všechen přístup k doménovým datům server-side přes aplikaci
- bez povinnosti samostatného hostovaného DEV, STAGING a PROD v první etapě

Tohle je technicky použitelné a zároveň to není slepá ulička, pokud se dodrží několik architektonických pravidel.

Pro první etapu s jedním administrátorem, později možná jedním dalším, je rozumný model lokální vývoj a jedno hostované prostředí. Integritu dat chraň dumpy, migracemi a validací importů, ne povinným multi-environment režimem.

## 2. Proč problém není výkon, ale provozní garance

Supabase Free pro tento projekt nenaráží primárně na velikost dat nebo výkon.
Problém je jinde:

- free projekty se po týdnu neaktivity uspávají
- nejsou v ceně automatické zálohy
- není point-in-time recovery
- nejsou custom domains
- log retention je krátká

Proto je potřeba rozlišit:

- "jde to spustit" -> ano
- "je to dobrý dlouhodobý ostrý základ" -> ne

U tvé první etapy se s tím dá žít, pokud to budeš brát jako vědomě omezený provozní režim.

## 3. Co přesně znamená RLS

RLS = Row Level Security.

Prakticky:

- je to funkce PostgreSQL
- na tabulku nastavíš pravidla, kdo smí vidět nebo měnit které řádky
- databáze ta pravidla vynucuje sama

Je to, jako by databáze automaticky přidávala podmínku do každého dotazu.

Příklad:

- bez RLS může chyba v aplikaci omylem vrátit všechny platby všech členů
- s RLS může databáze sama říct: tento uživatel smí jen svoje řádky nebo jen admin data

## 4. Proč RLS nemusí být základ první etapy

RLS je nejdůležitější tehdy, když:

- klientský browser mluví přímo na databázové API
- existují běžní členové s omezenými právy
- potřebuješ row-level oddělení dat mezi různými uživateli

To ale první etapa není.

První etapa je:

- interní
- admin-only
- bez member portálu

Proto je pro start lepší tento model:

- browser mluví jen s aplikací
- aplikace na serveru kontroluje, jestli je uživatel admin
- server teprve potom sahá do databáze

Tím pádem:

- RLS není blokátor startu
- nevážeš architekturu na přímý browserový přístup do Supabase
- zůstáváš přenositelnější na jiný PostgreSQL hosting

## 5. Jak se neuzamknout do Supabase

Klíč je použít Supabase hlavně jako pohodlně hostovaný PostgreSQL, ne jako nepostradatelnou platformu pro vše.

Drž tato pravidla:

- databázové schéma drž v běžném PostgreSQL
- všechny změny schématu verzuj v SQL migracích v repu
- business logiku drž v aplikaci a databázi, ne v dashboard klikání
- neudělej z přímého browser -> Supabase přístupu základ aplikace
- neudělej ze Supabase Auth povinnou podmínku první etapy
- neukládej důležité šablony a pravidla jen do provider-specific konfigurací

Když tohle dodržíš, budoucí přesun bude vypadat spíš takto:

- změníš databázový hosting
- změníš connection string a případně pár integračních detailů
- nerefaktoruješ celé jádro aplikace

## 6. Co to znamená pro Google OAuth

Google OAuth tedy doporučuji přesunout z první etapy do druhé nebo pozdější.

Důvody:

- není potřeba pro první admin-only hodnotu systému
- přináší další konfigurační a provozní práci
- na Supabase Free by později narážel i na absenci custom domain, pokud budeš chtít důvěryhodnější auth flow

První etapa má získat hodnotu daty, importem a administrativou.
Teprve potom má smysl řešit pohodlnější nebo elegantnější přihlášení.

## 7. Co doporučuji jako závazná pravidla první etapy

1. Žádné přímé klientské čtení nebo zápisy doménových tabulek přes Supabase API.
2. Všechny citlivé operace jen server-side.
3. Žádné hardcodované roční částky a pravidla.
4. Žádné spoléhání na ruční dashboard změny jako zdroj pravdy.
5. Pravidelné exporty nebo zálohy mimo Supabase Free garance.
6. Google OAuth až jako navazující rozšíření.
7. RLS zavést až ve chvíli, kdy k tomu vznikne skutečný důvod.

## 8. Praktické doporučení pro další implementaci

Pokud chceš co nejmenší budoucí bolest, další technické zadání by mělo směřovat k tomuto:

- admin-only interní aplikace
- server-side data access
- standardní PostgreSQL model
- jednoduché první přihlášení bez Google závislosti
- lokální vývoj a jedno hostované prostředí pro první etapu
- připravenost na pozdější přidání Google OAuth a případně RLS

To je při tvém rozpočtu nejrozumnější kompromis mezi cenou, rychlostí a budoucí přenositelností.

## 9. Co dělat, když Supabase Free přestane stačit a nechceš Supabase Pro

Tohle je přesně důvod, proč držíme server-side přístup a běžné PostgreSQL schéma.

Pak máš reálně tyto možnosti:

### 9.1 Jednoduchý přesun na jiný PostgreSQL hosting

Nejjednodušší budoucí cesta je:

- nechat Vercel pro web
- nechat Resend pro e-maily
- vyměnit jen databázi za jiný PostgreSQL hosting

Typicky to znamená:

- udělat dump databáze
- obnovit ji na cílovém PostgreSQL
- přepnout connection string
- ověřit migrace, indexy a importy

Pokud první etapa nebude závislá na Supabase Auth, RLS a přímém Supabase API pro doménová data, je to relativně čistý přesun.

### 9.2 Vlastní PostgreSQL na levném VPS

To je nejsilnější rozpočtová alternativa, pokud budeš ochotný přijmout trochu víc provozní práce.

Výhody:

- velmi nízký měsíční náklad
- plná kontrola nad databází
- vlastní zálohy a retenční politika

Nevýhody:

- musíš řešit správu serveru
- musíš řešit aktualizace, monitoring a obnovu
- odpovědnost je více na tobě

### 9.3 Jiný managed PostgreSQL provider

Další možnost je nepřejít na Supabase Pro, ale na jiný managed PostgreSQL hosting.

To dává smysl, pokud chceš:

- zůstat bez správy serveru
- mít databázi mimo Supabase pricing model
- zachovat jednoduchý provoz aplikace

### 9.4 Pokročilejší přesun přes logickou replikaci

Supabase oficiálně popisuje i logical replication do externího PostgreSQL.
To je zajímavé pro budoucnost, pokud budeš chtít:

- postupný přesun bez jednorázového velkého výpadku
- nebo si postavit sekundární databázi mimo Supabase

Pro první etapu to ale není potřeba. Je to spíš upgrade cesta, ne startovní návrh.

## 10. Vlastní zálohování

Ano, připadá v úvahu a na Free plánu je to rozumné.

Supabase v dokumentaci přímo doporučuje, aby Free projekty pravidelně exportovaly data přes CLI `db dump` a držely off-site backup.

Prakticky to znamená:

- dělat pravidelný logický dump databáze
- ukládat ho mimo Supabase
- mít občas vyzkoušenou obnovu do jiné PostgreSQL instance

### 10.1 Co zálohovat

Minimálně:

- role a oprávnění
- schéma
- data

Pokud budeš používat storage pro soubory, musíš řešit zvlášť i export souborů. Databázové backupy storage objekty samy o sobě neobsahují, jen jejich metadata.

### 10.2 Kde zálohování spouštět

Nejrozumnější jsou tyto varianty:

- externí plánovaný runner mimo Vercel aplikaci
- GitHub Actions scheduled workflow
- malý cron na vlastním VPS nebo jiném běžícím stroji
- krajní manuální varianta: periodický export z lokálního notebooku

### 10.3 Kde zálohy držet

Zálohy musí být mimo primární databázovou platformu.

Tedy:

- ne jen v Supabase
- ne jen na lokálním disku bez další kopie

Rozumný princip je:

- šifrovaný dump
- off-site uložení
- jednoduchá retenční politika

## 11. Crony a provozní disciplína

Tvoje obava je správná. Cron se velmi snadno stane místem, kam se začne lepit všechno, co se nikam jinam nevešlo.

### 11.1 Co je na Vercel Hobby důležité vědět

Podle oficiální dokumentace:

- cron jobs jsou na Hobby plánu omezené na spuštění jednou denně
- hodinové nebo častější výrazy na Hobby neprojdou deployem
- časování není přesné na minutu

To znamená:

- pro denní údržbu nebo denní připomínky je to v pořádku
- pro hodinové dávky na Hobby ne

### 11.2 Co na cron patří

Patří tam malé, jasně vymezené a idempotentní úlohy, například:

- denní kontrola a rozeslání připomínek
- denní export nebo trigger zálohy
- denní přepočet nebo kontrolní auditní úloha

### 11.3 Co na cron nepatří

- dlouhé dávkové procesy jako univerzální backend
- složité workflow s více kroky a ručním stavem
- velké importy a migrace jako běžný provozní mechanismus
- hromadění nesouvisejících úloh v jednom endpointu bez jasné odpovědnosti

### 11.4 Má smysl více Vercel projektů nad jednou DB?

Technicky ano.

Můžeš mít:

- hlavní aplikaci
- a vedle toho samostatný maintenance nebo jobs projekt

Oba se mohou připojovat na stejnou databázi.

Ale jako způsob, jak obcházet limity nebo na sílu přidávat další crony, to nedoporučuji.

Rizika jsou:

- duplikace tajných klíčů a konfigurace
- drift mezi deployi
- nejasné vlastnictví migrací a jobů
- závody a dvojí spuštění nad stejnými daty

Smysl to má až tehdy, když to bude vědomé oddělení rolí, ne workaround.

### 11.5 Doporučené pravidlo pro tento projekt

Pro první etapu doporučuji:

- jeden hlavní aplikační projekt
- maximálně jeden malý maintenance mechanismus navíc, pokud bude opravdu potřeba
- žádné rozdělování do více Vercel projektů jen kvůli cronům

Pokud jednou vznikne reálná potřeba častějšího nebo spolehlivějšího plánování, je lepší změnit scheduler než množit projekty.