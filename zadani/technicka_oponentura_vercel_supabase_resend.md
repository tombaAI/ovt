# Technická oponentura varianty Vercel + Supabase + Resend

- Datum: 2. 4. 2026
- Kontext: tento dokument doplňuje zadávací dokumentaci a nahrazuje její původní hostingové doporučení tam, kde se projekt vědomě odklání od varianty "levný český sdílený hosting + monolit".
- Zdroj pravdy pro business požadavky zůstává: `zadani/zadavaci_dokumentace_ovt_web.md`.
- Pro aktuální rozhodnutí s tvrdým rozpočtem a bez Google OAuth v první etapě viz také `zadani/revize_prvni_etapy_rozpoctu_a_rls.md`.

## 1. Co se změnilo oproti původnímu researchi

Původní doporučení ve prospěch sdíleného hostingu vzniklo za těchto předpokladů:

- důraz na veřejné providery v ČR
- cílový provozní rozpočet do 1000 Kč za rok
- preference co nejjednoduššího hostingu bez samostatné PaaS databáze

Aktuální rozhodovací rámec je jiný:

- akceptovatelný je provider v EU, ne nutně v ČR
- preferovaný je moderní developer-friendly stack pro rychlou realizaci ve VS Code s Copilotem
- hlavní kandidát je Vercel + Supabase + Resend

To znamená, že už se neoptimalizuje primárně na absolutně nejnižší roční cenu, ale na poměr rychlost dodání / jednoduchost provozu / rozšiřitelnost.

## 2. Stručný verdikt

Verdikt:

- Ano, Vercel + Supabase + Resend je pro tento projekt dobrý technický fit.
- Ne, není to dobrý fit, pokud by dál platil tvrdý limit do 1000 Kč za rok v produkci.

Prakticky:

- pro V1 interní administraci, desítky členů a nízké stovky e-mailů ročně je stack funkčně více než dostačující
- pro rychlý start je výrazně lepší než vlastní VPS nebo ručně spravovaný backend
- cenově ale vychází jako vědomě dražší varianta než původně doporučený sdílený hosting

Orientační provozní realita:

- Vercel Hobby může pro V1 pravděpodobně stačit
- Resend Free pro očekávaný objem e-mailů pravděpodobně stačí
- Supabase Free je vhodný pro vývoj, ale ne pro produkci
- produkční Supabase dává smysl minimálně na Pro plánu od 25 USD měsíčně
- pokud budeš chtít i brandovaný auth domain pro lepší důvěryhodnost Google přihlášení, je to další placený doplněk

Jinými slovy: funkčně ano, provozně jednoduché ano, ale už to není "levná roční hostingová položka".

Po dalším upřesnění je potřeba odlišit dvě různé situace:

- technicky spustitelný interní pilot nebo první etapa na velmi nízkém rozpočtu
- dlouhodobě doporučený ostrý provoz s rozumnými provozními garancemi

Supabase Free může dávat smysl pro první případ.
Pro druhý případ zůstává problémem.

## 3. Posouzení vůči skutečným požadavkům

| Oblast | Hodnocení | Poznámka |
| --- | --- | --- |
| Interní admin-only aplikace | silný fit | Malá zátěž, omezený počet uživatelů, jednoduché nasazení |
| Budoucí Google login pro více správců | silný fit | Technicky bez problému, ale pro první etapu není nutný |
| Historická data a import z Excelů | dobrý fit | Soubory jsou malé, import lze řešit přes upload + serverové zpracování + audit |
| Konfigurovatelný ceník po ročnících | silný fit | PostgreSQL je pro tabulkově konfigurovaná pravidla velmi vhodná |
| Lodě, brigády, slevy, historie | silný fit | Relační model sedí přirozeně |
| Personalizované e-maily s QR platbou | silný fit | Render na serveru + Resend je jednoduché a dostatečné |
| Připomínky neplatičům a budoucí Fio sync | přijatelný fit | Jednoduché dávky zvládne Vercel Cron, ale není to plnohodnotný job runner |
| Podpora činnosti s rezervacemi a vyúčtováním | silný fit | Data i workflow jsou CRUD + výpočty, bez zvláštních infra nároků |
| Nízké provozní náklady | slabší fit | Produkční Supabase znamená pravidelný měsíční náklad |

## 4. Proč je tento stack pro projekt dobrý

### 4.1 Přirozeně sedí na rozsah V1

Projekt není veřejný portál s vysokou návštěvností, ale interní agenda. To nahrává stacku, který:

- zrychlí první dodání
- minimalizuje množství vlastního provozního know-how
- dovolí pohodlně přidávat moduly bez přestavby infrastruktury

Vercel + Next.js je velmi dobrý pro administrativní web. Supabase řeší databázi, auth a případně storage bez potřeby zvlášť stavět backendovou platformu. Resend dobře sedí na nízký objem transakčních e-mailů.

### 4.2 Výrazně lepší developer experience než "levný hosting za každou cenu"

Oproti sdílenému hostingu získáš:

- kvalitní deployment workflow přes Git
- preview buildy
- rozumnou práci s proměnnými prostředí
- hotovou SQL databázi a auth vrstvu
- menší tlak na ruční správu serveru

To je důležité, protože repo je zatím prázdné a projekt bude teprve vznikat. U takové situace má rychlost prvního funkčního základu vysokou hodnotu.

To ale neznamená, že je nutné hned zavádět více hostovaných prostředí. Pro první etapu s jedním administrátorem, později možná jedním dalším, je rozumnější zůstat u lokálního vývoje a jednoho hostovaného prostředí.

### 4.3 Budoucí rozšíření zůstává otevřené

Stack není jen řešení pro V1. Pořád umožňuje později doplnit:

- členský portál
- Fio integraci
- jemnější role
- detailnější audit
- storage pro importní soubory a exporty

Protože jádro stojí na PostgreSQL a standardním webovém frameworku, nevzniká zásadní technologická slepá ulička.

## 5. Kde je potřeba být opatrný

### 5.1 Nákladový strop se posouvá

Tohle je hlavní protiargument.

Původní návrh cílil na řádově stovky korun ročně. Variantou Supabase produkce se dostáváš spíš na řád stovek korun měsíčně. Pokud zůstane Vercel na Hobby a Resend na Free, největší fixní náklad bude databáze.

Tedy:

- pokud je pro tebe zásadní minimalizace měsíčních nákladů, tahle varianta není optimální
- pokud je pro tebe důležitější rychlost realizace, čistý deployment a nízká provozní složitost, pak dává smysl

### 5.2 Supabase Free není dobrý dlouhodobý ostrý základ

Je důležité to říct přesně.

Supabase Free se technicky provozovat dá.
Co se ale nedá zodpovědně doporučit, je stavět na něm dlouhodobý ostrý provoz, pokud ti záleží na předvídatelnosti a obnově dat.

Oficiální podklady uvádějí pro Free mimo jiné:

- pause po 1 týdnu neaktivity
- bez automatických záloh
- bez point-in-time recovery
- bez custom domain
- Auth audit logs jen 1 hodina
- API a databázové logy jen 1 den
- pouze community support

Pro interní systém s malým počtem uživatelů je kritický hlavně první a druhý bod:

- aplikace může být dlouho bez aktivity a pak nechceš řešit uspávání projektu
- u důležitých dat nechceš být bez standardních managed záloh

Doporučení tedy upravuji takto:

- vývoj: Supabase Free je v pořádku
- první interní rozpočtová etapa: Supabase Free je přijatelný jen jako vědomý kompromis
- dlouhodobý ostrý provoz: Supabase Free nedoporučuji

### 5.3 Kdy má Supabase Free i tak smysl

Při tvém upřesnění rozpočtu a scope první etapy má Free smysl jen za těchto podmínek:

- první etapa je čistě admin-only
- v první etapě není nutný Google OAuth ani branded auth doména
- všechen přístup k datům jde server-side přes aplikaci
- bude existovat vlastní export nebo zálohovací disciplína mimo Supabase dashboard
- počítá se s tím, že pokud se systém osvědčí a rozšíří, databázová vrstva se může přesunout na placený nebo jiný PostgreSQL hosting

### 5.4 Google OAuth a preview deploymenty nejsou úplně bez tření

Google OAuth je v tomto stacku dobrá volba, ale je potřeba počítat s tím, že:

- produkční doména a localhost se nastavují snadno
- dočasné preview URL z Vercelu nejsou pro OAuth testování ideální
- nevyplatí se stavět workflow na tom, že každé preview musí mít funkční login

Doporučení:

- login testovat hlavně na localhost a na jedné stabilní produkční URL
- preview deploymenty používat primárně pro UI a neautentizované části

Stejně tak nedává smysl kvůli tomu v první etapě budovat DEV + STAGING + PROD. Integritu dat je lepší chránit dumpy, migracemi, validací importů a možností lokální obnovy nad kopií dat.

### 5.5 RLS je výhoda, ale jen když se používá disciplinovaně

Jednoduše řečeno:

- RLS je databázová bezpečnostní vrstva v PostgreSQL
- funguje jako neviditelné `WHERE` podmínky nad tabulkami
- určuje, které řádky může konkrétní uživatel číst nebo měnit

Příklad myšlenky:

- bez RLS by přihlášený člen mohl teoreticky číst celou tabulku plateb, pokud bys mu omylem pustil přístup
- s RLS dostane jen ty řádky, které policy výslovně dovolí

To je velmi silné, když browser mluví přímo na databázové API.
Pro první etapu ale nemusí být RLS povinný základ.

Pokud bude první etapa postavená takto:

- admin-only
- žádné přímé browser -> database dotazy pro doménová data
- všechny citlivé operace přes server-side vrstvu aplikace

pak lze první etapu navrhnout bez závislosti na RLS jako hlavním stavebním bloku.

To je z hlediska jednoduchosti i budoucí přenositelnosti správný směr.
RLS pak můžeš doplnit později:

- při členském portálu
- při jemnějších rolích
- nebo jako defense in depth vrstvu nad již fungující server-side autorizací

Supabase svádí k tomu, aby se část logiky rychle udělala přes dashboard nebo široký service role přístup. To je přesně cesta, která se později vymstí.

Pro tento projekt je potřeba držet tato pravidla:

- schema a politiky musí být verzované v SQL migracích v repu
- service role key nesmí jít do klienta
- admin operace musí jít přes server-side vrstvu po explicitní kontrole, že přihlášený uživatel je schválený admin
- RLS defaultně zavírat, ne otevírat

### 5.6 Jak se vyhnout vendor-locku a budoucímu refaktoru

Tohle je pro tvůj případ klíčové. Pokud chceš zůstat rozpočtově flexibilní, nesmíš si splést "Supabase jako pohodlný hosting Postgresu" se "Supabase jako platforma, na které závisí všechno".

Doporučená pravidla:

- doménový model držet v běžném PostgreSQL schématu
- schéma a změny držet v SQL migracích v repu
- kritickou business logiku nepsat do Supabase dashboardu jako ruční konfiguraci
- v první etapě preferovat server-side přístup k databázi před přímým browserovým přístupem
- neudělat z Edge Functions nebo Storage povinnou součást core logiky, pokud to není nutné
- e-mailové šablony a výpočtová pravidla držet v repu a databázi, ne v provider-specific konfiguraci

Když tohle dodržíš, případný přesun ze Supabase na jiný PostgreSQL hosting bude hlavně provozní změna, ne přepis celé aplikace.

### 5.7 Cron a dávky jsou vhodné jen pro jednoduché úlohy

Vercel Cron podle oficiální dokumentace volá produkční endpoint přes HTTP GET a běží v UTC. To je pro projekt dostačující, pokud cron slouží na:

- odeslání připomínek neplatičům
- periodické přepočty stavů
- budoucí jednoduché Fio synchronizace

Je ale potřeba počítat s tím, že na Vercel Hobby jsou cron joby omezené na spuštění jednou denně. Hodinové nebo častější dávky na Hobby nejsou k dispozici.

Není to ale důvod zavádět do V1 složité background workflow. Pro současný rozsah to není potřeba.

### 5.8 E-mailing funguje dobře, ale jen s ověřenou doménou

Resend je pro tento projekt silný fit, protože:

- objem e-mailů je nízký
- API je jednoduché
- free tier aktuálně pokrývá 3000 e-mailů měsíčně a 100 e-mailů denně

Ale pro produkční použití musíš počítat s tím, že:

- je potřeba vlastní doména nebo subdoména
- musíš správně nastavit SPF a DKIM
- DMARC je sice volitelný, ale rozumně doporučený

Bez toho budou e-maily vypadat nedůvěryhodně a doručitelnost bude zbytečně slabá.

### 5.9 Importy z Excelu musí být auditovatelné a idempotentní

Samotný stack import zvládne. Riziko není v infrastruktuře, ale v návrhu.

Je potřeba, aby import:

- nejdřív validoval data a ukázal problémy
- ukládal log běhu a chyb
- nepřepisoval historická data bez stopy
- šel spouštět opakovaně během implementace

Malá velikost souborů znamená, že není potřeba zvláštní importní worker. Běžný serverový endpoint stačí.

### 5.10 Portabilita a zálohy se musí řešit vědomě

Stack je sice moderní, ale pořád je to kombinace tří externích služeb. Není to problém, pokud od začátku počítáš s přenositelností.

Doporučení:

- data držet ve standardním PostgreSQL modelu bez zbytečných exotických závislostí
- mít SQL migrace v repu
- pravidelně dělat export dat a příloh
- e-mailové šablony držet v repu, ne jen v providerovi

## 6. Doporučená cílová architektura

### 6.1 Doporučený aplikační stack

- Next.js App Router + TypeScript
- npm jako package manager
- Fluent UI v9 pro UI komponenty
- jednoduchý admin access gate v první etapě, Supabase Auth nebo Google login až jako volitelné rozšíření
- Supabase PostgreSQL jako hlavní databáze
- Supabase Storage jen pokud bude potřeba ukládat importní soubory, exporty nebo přílohy
- Resend pro transakční e-maily
- Vercel pro deployment webu a jednoduché plánované joby

### 6.2 Doporučené architektonické hranice

- V1 bez samostatného backendu a bez odděleného API serveru
- server-side akce a route handlery pro administrativní operace
- veřejný klient jen pro session a bezpečné čtení podle potřeby
- citlivé zápisy a importy pouze server-side
- databázové změny výhradně přes verzované migrace

### 6.3 Jak modelovat klíčové doménové věci

Zadání už správně říká, co nesmí být natvrdo. V tom je potřeba být důsledný i v implementaci.

Do databáze jako konfigurovatelné entity musí jít minimálně:

- ročník příspěvků
- základní příspěvek
- kategoriální slevy
- individuální slevy a override
- přirážka za nesplněnou brigádu
- tarify lodí podle pořadí a roku
- roční pravidla podpory činnosti
- rezervace vybraných akcí
- texty e-mailových šablon

### 6.4 Co naopak nedoporučuji přidávat do V1

- samostatnou message queue
- event-driven architekturu
- oddělený frontend a backend repozitář
- generické workflow enginy
- složitou víceúrovňovou roli uživatelů
- automatické párování banky v první verzi

## 7. Doporučení k provoznímu modelu

Pro první etapu s jedním až dvěma administrátory doporučuji nepřehánět prostředí. Praktický start je:

- lokální vývoj
- jeden hostovaný Vercel projekt
- jeden hostovaný Supabase projekt

Integritu dat v této fázi chraň dumpy, migracemi, dry-run importy a možností lokální obnovy nad kopií dat, ne povinným DEV, STAGING a PROD splitem.

### Varianta A: dlouhodobě doporučený ostrý provoz

- Vercel Hobby pro web v první fázi
- Supabase Free pro vývoj
- Supabase Pro pro produkci
- Resend Free, dokud objem e-mailů zůstává nízký
- vlastní doména pro aplikaci a samostatná subdoména pro odesílání e-mailů

### Varianta B: tvrdě rozpočtová první etapa

- Vercel Hobby pro web
- Supabase Free jako kompromisní databázová vrstva pro admin-only první etapu
- bez závislosti na Google OAuth v první etapě
- všechen přístup k doménovým datům server-side
- vlastní exportní nebo zálohovací režim mimo Supabase Free garance
- Resend Free s ověřenou subdoménou

Tato varianta je technicky použitelná, ale je potřeba ji chápat jako rozpočtový kompromis, ne jako ideální finální stav.

### Kdy přejít na vyšší plán Vercelu

Vercel Pro řeš až tehdy, kdy narazíš na konkrétní potřebu:

- více lidí potřebuje pohodlnější týmové workflow ve Vercelu
- začneš narážet na limity hobby usage
- budeš chtít lepší kontrolu nad provozem a spoluprací

Pro samotnou existenci V1 to není nutný předpoklad.

## 8. Finální doporučení

Pokud je cílem postavit první verzi rychle, čistě a s rozumnou budoucí rozšiřitelností, potom Vercel + Supabase + Resend pořád dává smysl.

Podmínky tohoto doporučení jsou ale dvě:

- buď přijímáš, že dlouhodobě doporučený produkční provoz nebude v limitu do 1000 Kč za rok
- nebo přijímáš, že první etapa pojede na Supabase Free jako vědomý kompromis s omezenými provozními garancemi

V obou případech musí zůstat architektura disciplinovaně jednoduchá a nesmí se z ní stát generická SaaS platforma.

Největší praktický přínos proti původní variantě je rychlost dodání a menší provozní tření.
Největší cena za to je buď pravidelný měsíční náklad databázové platformy, nebo přijetí rizik Free varianty.