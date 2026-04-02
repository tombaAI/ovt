# Průvodce setupem od nuly: Vercel + Supabase + Resend

- Datum: 2. 4. 2026
- Cíl: dostat projekt z prázdného repozitáře do stavu, kdy jde lokálně vyvíjet, rozběhnout první admin-only etapu, posílat e-maily přes Resend a nasazovat na Vercel.
- Tento průvodce předpokládá, že business zadání je popsáno v `zadani/zadavaci_dokumentace_ovt_web.md` a technická volba je popsána v `zadani/technicka_oponentura_vercel_supabase_resend.md`.
- Pro tvrdě rozpočtovou první etapu a vysvětlení RLS viz také `zadani/revize_prvni_etapy_rozpoctu_a_rls.md`.

## 1. Co musíš založit nebo mít k dispozici

Bez toho se nepohneš:

- GitHub účet a repozitář pro projekt
- Vercel účet, ideálně přihlášený přes GitHub
- Supabase účet a organizaci
- Resend účet
- vlastní doménu a přístup do DNS správy

Volitelné až pro další etapu:

- Google Cloud projekt pro OAuth login

Pokud doménu zatím nemáš, lokální vývoj tím nezablokuješ. Zablokuje tě to ale před ostrým nasazením loginu a e-mailů.

## 2. Minimální doporučená struktura prostředí

Doporučuji opravdu minimalistický start.

Pro první etapu stačí:

- lokální vývoj v notebooku
- jeden hostovaný Vercel projekt
- jeden hostovaný Supabase projekt
- jedna produkční doména

Co naopak v první etapě není povinné:

- samostatný staging
- samostatný DEV Supabase projekt
- ručně spravované preview workflow
- plnohodnotný multi-environment release proces

Pokud Vercel automaticky vytváří preview deploymenty, ber je jen jako vedlejší pohodlí, ne jako prostředí, které musíš aktivně udržovat.

Integritu dat chraň jinak:

- před rizikovější změnou udělat dump databáze
- importy nejdřív validovat a ideálně spustit nanečisto
- větší změny schématu nebo importů si podle potřeby ověřit lokálně nad kopií dat

## 3. V jakém pořadí to udělat

Správné pořadí ti ušetří dost zbytečných vratek:

1. založit GitHub repo
2. založit jeden Supabase projekt pro první etapu
3. založit Vercel projekt napojený na repo
4. připravit lokální vývojové prostředí
5. rozběhnout první funkční skeleton admin evidence
6. teprve potom řešit Resend a produkční doménu
7. teprve až bude reálný důvod, uvažovat o druhém hostovaném prostředí
8. Google OAuth řešit až jako navazující rozšíření, pokud bude dávat smysl

Tohle pořadí je důležité hlavně proto, že lokální vývoj a auth zprovozníš rychleji než perfektní produkční DNS.

## 4. GitHub a repozitář

Uděláš toto:

- založ nový privátní repozitář
- nech hlavní branch jako `main`
- přidej základní ochranu branch, pokud na tom bude dělat víc lidí
- připoj repozitář do lokálního workspace

Do repa už teď patří:

- zdrojový kód aplikace
- SQL migrace pro Supabase
- seed nebo import skripty
- e-mailové šablony
- technická dokumentace

Do repa naopak nepatří:

- service role klíče
- Resend API klíče
- Google client secret
- ručně exportované produkční databázové dumpy s osobními údaji

## 5. Supabase

### 5.1 Co založit

V Supabase pro první etapu založ jeden projekt.

Klidně ho pojmenuj neutrálně, například `ovt-main`.

Zvol evropský region. Praktický cíl je držet databázi geograficky co nejblíž k produkčnímu nasazení webu.

### 5.2 Jak to nastavit hned na začátku

U tohoto projektu si poznamenej:

- Project URL
- anon key
- service role key

Doporučení pro první etapu:

- použít Free plán jako vědomý rozpočtový kompromis
- od začátku mít rozumnou exportní nebo zálohovací strategii
- druhý hostovaný projekt zakládat až ve chvíli, kdy přinese skutečný praktický přínos

### 5.3 Důležité rozhodnutí k lokálnímu vývoji

Máš dvě rozumné varianty:

- jednodušší start: lokálně vyvíjíš proti tomuto jednomu hostovanému projektu
- plnější lokální režim: používáš Supabase CLI a lokální Docker stack

Pro první fázi projektu doporučuji jednodušší start. Důvod je pragmatický: nejdřív potřebuješ rozchodit auth, shell aplikace, tabulky a základní tok práce. Lokální emulace celé Supabase platformy je užitečná, ale není to nejlepší první překážka.

Současně platí:

- běžný vývoj klidně proti jednomu hostovanému projektu
- rizikovější import nebo větší migraci nejdřív ověřit po dumpu nad kopií dat nebo lokálně

### 5.4 Co v Supabase nenastavovat ručně jako zdroj pravdy

Dashboard používej na inspekci a jednorázové nastavení providerů, ne jako hlavní způsob návrhu databáze.

Zdroj pravdy musí být v repu:

- SQL migrace
- případné seed skripty
- případná budoucí RLS pravidla

### 5.5 Jak hlídat integritu bez druhého prostředí

V první etapě to řeš hlavně takto:

- před větší změnou databáze udělej dump
- importy rozděl na validaci a potvrzené provedení
- preferuj aditivní změny schématu místo destruktivních zásahů
- když půjde o citlivější zásah, otestuj ho lokálně nad kopií dat

## 6. Google login přes Supabase Auth

Tato sekce není pro první etapu povinná. Je to doporučené budoucí rozšíření.

### 6.1 Co založit v Google Cloud

V Google Cloud založ:

- nový projekt pro OVT aplikaci
- OAuth consent screen
- OAuth client typu Web application

### 6.2 Co na consent screenu nastavit

Potřebuješ minimálně:

- název aplikace
- support e-mail
- vývojářský kontaktní e-mail
- scope `openid`
- scope `userinfo.email`
- scope `userinfo.profile`

Nepřidávej další scope bez důvodu. Jen si tím zkomplikuješ verifikaci.

### 6.3 Co nastavit u OAuth klienta

Autorizované originy a redirecty nastav podle toho, co skutečně používáš.

Do začátku typicky:

- `http://localhost:3000`
- produkční doména aplikace
- Supabase callback URL z dashboardu provideru Google

Pokud budeš používat lokální Supabase přes CLI, přidáš i:

- `http://127.0.0.1:54321/auth/v1/callback`

### 6.4 Na co nezapomenout

- preview URL z Vercelu neber jako hlavní testovací prostředí pro OAuth
- produkční doménu si nastav dřív, než začneš ladit finální login flow
- v aplikaci nepovoluj veřejný signup bez další kontroly

### 6.5 Jak má fungovat autorizace v aplikaci

Google login řeší identitu. Přístup do aplikace musí řešit ještě tvoje vlastní whitelist logika.

Proto je potřeba mít samostatnou tabulku schválených admin e-mailů nebo admin účtů. Přihlášený uživatel bez schválení nesmí do administrace.

## 7. Resend a e-mailová doména

### 7.1 Co založit

V Resend založ účet a přidej vlastní doménu nebo lépe subdoménu pro odesílání.

Praktické doporučení:

- nepoužívat hlavní kořenovou doménu pro první pokus
- použít samostatnou subdoménu typu `mail.tvoje-domena.cz` nebo `notify.tvoje-domena.cz`

Resend to doporučuje i kvůli oddělení reputace odesílání.

Pokud míříš na doménu `ovtbohemians.cz`, dává smysl tento konkrétní model:

- web administrace: `sprava.ovtbohemians.cz`
- odesílací subdoména pro Resend: `mail.ovtbohemians.cz`
- hlavní systémový odesílatel: `sprava@mail.ovtbohemians.cz`
- budoucí adresa pro automatické zpracování odpovědí: například `inbox@mail.ovtbohemians.cz`
- volitelná lidská kontaktní schránka mimo Resend: například `sprava@ovtbohemians.cz`

### 7.2 Co musí být v DNS

Pro ověření odesílání potřebuješ minimálně:

- SPF
- DKIM

DMARC je volitelný, ale pro produkci doporučený.

Bez ověřené domény neřeš ostré rozesílky.

### 7.3 Jaký plán dává smysl

Pro V1 je Resend Free velmi pravděpodobně dostačující, protože:

- objem mailů je nízký
- limit 3000 e-mailů měsíčně a 100 denně je nad očekávanou potřebou
- stačí jedna doména

### 7.4 Co si připravit v aplikaci

Od začátku počítej s tím, že v kódu budeš mít:

- jeden ověřený odesílací e-mail, pro tento projekt ideálně `sprava@mail.ovtbohemians.cz`
- volitelně samostatný `Reply-To`, pokud bude lidská komunikace chodit jinam, například `sprava@ovtbohemians.cz`
- verzi e-mailové šablony uloženou v repu
- log odeslání do databáze

`noreply@...` používej jen pro čistě technické notifikace. Pro výzvy k platbě a připomínky je lepší, když se dá na zprávu normálně odpovědět.

Důležitý praktický detail:

- pokud v Resend ověříš jen `mail.ovtbohemians.cz`, odesílací adresa musí být z této subdomény
- pokud bys chtěl posílat jako `sprava@ovtbohemians.cz`, musí být ověřená přímo kořenová doména `ovtbohemians.cz`

### 7.5 Jak připravit odpovědi a budoucí workflow

Pokud chceš, aby systém časem věděl o příchozích e-mailech, navrhni to už teď odděleně:

- běžné systémové odesílání z `sprava@mail.ovtbohemians.cz`
- automatizační nebo příchozí schránka třeba `inbox@mail.ovtbohemians.cz`
- lidská schránka podle potřeby třeba `sprava@ovtbohemians.cz`

Technicky je dobré počítat s tímto tokem:

- aplikace odešle e-mail a uloží si jeho identifikátor do databáze
- Resend posílá webhooky o doručení, bounce a dalších stavech
- Resend podporuje i příjem e-mailu a webhook event `email.received`
- aplikace nebo Make/n8n může tento event zapsat do databáze a spustit další logiku

To znamená, že do budoucna je reálné například:

- poznat, že přišla odpověď k určité výzvě
- připojit e-mail k členu nebo k ročníku příspěvků
- spustit workflow v Make nebo n8n
- vytvořit úkol nebo interní upozornění pro správce

Pro první etapu stačí připravit jen architekturu:

- evidenci odeslaných e-mailů v databázi
- endpoint pro webhook
- vyhrazenou adresu pro příchozí automatizační poštu

## 8. Vercel

### 8.1 Co založit

Na Vercelu založ projekt importem GitHub repa.

Pro první fázi stačí:

- jeden projekt
- jedna produkční doména
- preview deploymenty můžeš nechat být, ale nejsou součástí povinného workflow první etapy

### 8.2 Co nastavit hned

- lokální `.env.local` a produkční proměnné na Vercelu
- produkční doménu aplikace
- Git integraci

Preview proměnné nemusíš v první etapě aktivně spravovat, pokud preview deploymenty reálně nepoužíváš.

### 8.3 Jak použít cron později

Cron nepotřebuješ v prvním commitu, ale návrh s ním má počítat.

Použití pro tento projekt:

- připomínky neplatičům
- budoucí pravidelná synchronizace plateb
- kontrolní nebo údržbové joby

Pamatuj, že Vercel cron běží nad produkčním HTTP endpointem a čas je v UTC.

Důležité omezení:

- na Vercel Hobby může cron běžet jen jednou denně
- hodinové nebo častější joby na Hobby neprojdou deployem

Proto je Vercel Hobby cron vhodný hlavně pro denní úlohy, ne pro hodinový scheduler.

## 9. Lokální vývojové prostředí

### 9.1 Co mít v notebooku

Minimálně:

- Node.js LTS
- npm
- Git
- VS Code
- GitHub Copilot

Doporučeně navíc:

- Supabase CLI
- Docker Desktop, pokud budeš chtít plný lokální Supabase stack
- Vercel CLI pro pohodlnější práci s env a linkingem projektu

### 9.2 Jaký lokální režim doporučuji

Na úplný začátek:

- aplikace běží lokálně v Next.js
- databáze a auth běží proti jednomu hostovanému Supabase projektu
- e-mail se při běžném vývoji buď neposílá, nebo jde přes testovací branch logiku

Teprve když začneš víc řešit migrace, importy a izolované testování, dává smysl zapojit lokální Supabase přes CLI.

### 9.3 Co mít v `.env.local`

Typicky budeš potřebovat alespoň:

```bash
DATABASE_URL=
ADMIN_EMAILS=
APP_BASE_URL=http://localhost:3000
RESEND_API_KEY=
MAIL_FROM=
MAIL_REPLY_TO=
CRON_SECRET=
```

Pokud začneš používat i Supabase Auth nebo veřejný Supabase klient, přidáš navíc:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Později pravděpodobně přibude:

```bash
FIO_API_TOKEN=
```

Pokud rozjedeš lokální Supabase s Google providerem, přibude i lokální auth secret podle Supabase dokumentace.

### 9.4 Co nikdy neposílat do klienta

Do klientského kódu nesmí:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- jakýkoliv tajný token pro cron nebo bankovní integraci

## 10. Co přesně propojit mezi službami

Finální vazby vypadají takto:

- GitHub repo -> Vercel projekt
- Next.js aplikace -> jeden hostovaný Supabase projekt v první etapě
- Supabase Auth -> Google OAuth klient jako volitelné budoucí rozšíření
- aplikace na Vercelu -> Resend API
- `sprava.ovtbohemians.cz` -> Vercel
- `mail.ovtbohemians.cz` -> DNS záznamy pro Resend
- budoucí inbound adresa typu `inbox@mail.ovtbohemians.cz` -> webhook nebo automatizační workflow

## 11. Co udělat před prvním ostrým nasazením

Před produkcí zkontroluj:

- že je vědomě potvrzené, že první etapa poběží na jednom hostovaném Free projektu jako rozpočtový kompromis
- že před většími zásahy umíš udělat dump a vrátit se k předchozímu stavu
- že admin whitelist obsahuje správné účty
- že e-mailová doména je ověřená a testovaný mail chodí mimo spam
- že je jasné, kde jsou uložené produkční klíče
- že databázové změny jdou přes migrace
- že umíš udělat export dat nebo obnovu ze zálohy
- že je jasné, jestli je nasazení chápáno jako pilot na Free režimu nebo jako dlouhodobější ostrý provoz

## 12. Co nezapomenout, protože to bolí nejčastěji

- neber Supabase Free jako ostrou produkci
- pokud ho přesto použiješ, ber ho jako vědomý kompromis první etapy
- nezaváděj druhé hostované prostředí jen proto, že "se to tak dělá"
- nepočítej s tím, že OAuth bude bez práce fungovat na každé preview URL
- neukládej pravidla ceníků a slev do konstant v kódu
- nezačínej Fio integrací, dokud není hotová ruční platební agenda
- nepouštěj importy bez logu a validačního kroku
- neposílej ostré e-maily bez ověřené domény

## 13. Doporučené první implementační pořadí

Po technickém setupu doporučuji stavět v tomto sledu:

1. skeleton Next.js aplikace + Fluent UI v9
2. jednoduchý admin access gate bez závislosti na Google OAuth
3. základní datový model členů, lodí a ročníků
4. SQL migrace a server-side datový přístup
5. import členů a historických dat z Excelů
6. ročník příspěvků a výpočet částek
7. ruční evidence plateb
8. e-mailové výzvy a připomínky
9. modul podpory činnosti
10. volitelně až později Google OAuth a případně RLS

## 14. První zadání pro Copilot po bootstrapu

Jakmile bude repo připravené, dává smysl Copilotu zadat něco tohoto typu:

"Postav v tomto repozitáři základ interní administrativní aplikace pro OVT podle dokumentů v `zadani/`. Použij Next.js App Router, TypeScript, npm, Fluent UI v9 a server-side přístup k PostgreSQL přes Supabase. V1 je pouze pro administrátory. Nepřidávej member portal, Google OAuth ani Fio integraci do první etapy. Připrav projektový skeleton, jednoduchý admin access gate, první databázové migrace a základ pro členy a ročníky příspěvků." 

To je podstatně lepší start než generický prompt typu "udělej mi SaaS s auth a databází".

## 15. Co dělat, když Free databáze přestane stačit

Pokud nebude stačit Supabase Free a zároveň nebudeš chtít Supabase Pro, rozumné varianty jsou tyto:

1. nechat web na Vercelu a přesunout databázi na jiný PostgreSQL hosting
2. přesunout databázi na vlastní PostgreSQL na VPS
3. udělat jednorázovou migraci dump -> restore
4. v pokročilejší variantě použít logical replication do externího PostgreSQL

To celé dává smysl jen tehdy, pokud aplikace nestojí na přímém browser -> Supabase přístupu jako na neoddělitelné součásti návrhu.

## 16. Doporučená zálohovací a cron strategie

Pro první etapu doporučuji:

- Vercel cron používat jen na malé denní úlohy
- vlastní databázové zálohy dělat mimo hlavní Vercel aplikaci
- zálohy držet off-site
- občas si zkusit obnovu do jiné PostgreSQL instance

Pokud budeš chtít pravidelný dump databáze, vhodnější je externí scheduler nebo separátní runner než hlavní Vercel webová aplikace.