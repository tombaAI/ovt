# Zadání realizace: Rekonciliace přijatých plateb V1

Datum: 2026-04-10  
Verze: 1.0  
Stav: finální zadání pro realizaci (bez změn v této seanci)

---

## 1. Cíl a kontext

Cílem je zavést jednotný, auditovatelný a provozně použitelný proces zpracování přijatých plateb tak, aby bylo možné:

1. importovat bankovní platby opakovatelně a bez duplicit,
2. zadávat hotovostní platby dvěma praktickými způsoby,
3. párovat platby na předmět platby (dnes typicky předpis příspěvku),
4. podporovat split jedné platby na více osob/předpisů (rodinné platby),
5. kdykoli dohledat historii všech přijatých plateb v jednom souhrnném pohledu,
6. postupně nahradit stávající přechodovou tabulku plateb.

Poznámka ke scope: V1 řeší pouze přijaté platby. Odchozí platby z banky jsou mimo scope a budou řešeny později, přičemž opakovatelný import umožní rozšíření bez změny základního přístupu.

---

## 2. Ujišťovací odpověď

Ano, bankovní i hotovostní platby budou dohledatelné v jednom společném ledgeru plateb.  
Tento ledger bude zdroj pro stránku historie plateb, kde bude vidět vše v jednotném seznamu s filtrem podle zdroje (banka/hotovost), stavu párování a období.

Požadavek je závazný:

1. žádná přijatá platba nesmí „zmizet“,
2. každá platba musí mít stav zpracování,
3. každá změna stavu musí být auditovatelná,
4. stránka historie musí umět zobrazit celou cestu platby od zdroje po párování.

---

## 3. Rozsah V1

### 3.1 In scope

1. Příchozí bankovní platby z Fio synchronizace.
2. Příchozí bankovní platby z importovaných souborů přes profil (včetně Air Bank).
3. Hotovostní platby, obě varianty zadání:
1. rychlý příjem s poznámkou,
2. přímé zadání nad konkrétním závazkem.
4. Párování plateb na předmět platby.
5. Split a re-split plateb.
6. Odpárování s potvrzením.
7. Ignorace bez mazání.
8. Jednotná historie plateb v jednom přehledu.
9. Přechodová práce se stávajícími legacy payments:
1. prokazatelně nahrazené smazat,
2. ostatní ponechat jako hotovostní připravené k rekonciliaci.

### 3.2 Out of scope

1. Odchozí platby a jejich účetní workflow.
2. Pokročilé pravidlové automaty typu bank rules editor.
3. Finální automatické párování bez lidské validace u nejednoznačných případů.

---

## 4. Základní doménový model (koncept)

### 4.1 Zdroje plateb

1. Bankovní zdroj: importovaná transakce.
2. Hotovostní zdroj: ručně zadaná platba.

### 4.2 Jednotný platební ledger

Každá přijatá platba je jeden záznam v jednotném ledgeru se společnými poli:

1. source_type: bank_tx nebo cash,
2. source_reference: identifikátor zdroje,
3. paid_at,
4. amount,
5. currency,
6. payer_identifiers (VS, účet protistrany, jméno, zpráva),
7. reconciliation_status,
8. note,
9. audit metadata.

### 4.3 Předmět platby

V1 používá polymorfní přístup:

1. charge_type,
2. charge_id.

Konkrétně ve V1:

1. charge_type = contribution,
2. charge_id = konkrétní řádek příspěvkového předpisu.

Tento model je připraven na budoucí service/material bez přepisu párovací logiky.

---

## 5. Uživatelské role a oprávnění

1. Admin: plná práce s párováním, split, ignore, import profily, import běhy.
2. Super admin (volitelné V1.1): může provádět zásahy do uzavřených období.

Pravidlo bezpečnosti:

1. mazání zdrojových bankovních transakcí je zakázané,
2. rušení existujícího párování vždy s potvrzením,
3. každá změna je v auditní historii.

---

## 6. Uživatelské scénáře

### 6.1 Bankovní import a párování

1. Admin spustí import/sync.
2. Nové transakce se objeví jako unmatched.
3. Systém navrhne suggested match tam, kde je vysoká jistota.
4. Admin potvrzuje, případně splituje nebo ignoruje.

### 6.2 Rychlý příjem hotovosti

1. Admin na schůzi přijme hotovost.
2. Otevře rychlý formulář "Přijmout hotovost".
3. Vyplní částku, datum, poznámku (např. "Kukla příspěvky za 25 a 26").
4. Uloží bez okamžitého cílového párování.
5. Záznam svítí v rekonciliaci stejně jako nepárovaná bankovní položka.

### 6.3 Přímá hotovost nad závazkem

1. Admin je na detailu konkrétního závazku.
2. Zvolí "Přijmout hotovost na tento závazek".
3. Vyplní částku, datum, poznámku.
4. Záznam se vytvoří rovnou navázaný na daný závazek.
5. U jednoduchého 1:1 případu jde rovnou do confirmed.

### 6.4 Rodinná platba (split)

1. Přišla jedna platba za více osob.
2. Admin klikne "Rozdělit".
3. Zadá dílčí řádky částek na jednotlivé závazky.
4. Systém kontroluje součet částí proti celku.
5. Po potvrzení je celá platba ve stavu confirmed, ale po více alokačních řádcích.

### 6.5 Re-párování a re-split

1. Admin otevře již napárovanou položku.
2. Zvolí změnit párování.
3. Systém zobrazí potvrzovací dialog, protože jde o změnu historie.
4. Po potvrzení se vrací stav na unmatched a řeší se znovu.

---

## 7. Stavový model

Stavy položky v ledgeru:

1. unmatched,
2. suggested,
3. split_draft,
4. confirmed,
5. ignored.

Přechody:

1. import -> unmatched,
2. matcher -> suggested,
3. suggested -> confirmed,
4. unmatched -> split_draft -> confirmed,
5. unmatched nebo suggested -> ignored,
6. confirmed nebo ignored -> unmatched pouze po potvrzení.

Pravidla potvrzení:

1. Párování nepotřebuje potvrzení.
2. Odpárování nebo změna již potvrzeného párování potvrzení vyžaduje.

---

## 8. Pravidla párování

### 8.1 Auto matching

1. Primární klíč je VS.
2. Doplňkové indicie: částka, datum, rok předpisu, protistrana, text zprávy.
3. Bez VS musí systém umět navrhnout kandidáty, ale ne auto-confirmovat v nejednoznačných případech.

### 8.2 Heuristiky pro split

1. Částka přesahuje typickou individuální platbu.
2. Text obsahuje více osob nebo spojky.
3. Existují odpovídající závazky pro více osob ve stejném období.

### 8.3 Konflikty

1. Jeden bankovní zdroj nesmí být potvrzen dvakrát proti stejnému účelu bez explicitního zásahu.
2. Pokud je více kandidátů se stejným skóre, položka zůstane suggested nebo unmatched.

---

## 9. Import profily pro více bank

### 9.1 Obecné požadavky

1. Import přes profil je jediný podporovaný kanál pro opakované file importy.
2. Profil musí obsahovat mapování sloupců a transformace.
3. Import musí být idempotentní (upsert).
4. Každý běh importu musí mít historii.

### 9.2 Unikátní klíč transakce

1. Pokud existuje jednoznačný sloupec, použije se přímo.
2. Pokud neexistuje, profil musí umět definovat kombinaci sloupců pro kompozitní klíč.
3. Systém musí explicitně varovat, když je klíč slabý.

### 9.3 Air Bank profil

Air Bank ukázka potvrzuje:

1. delimiter je ;,
2. datum je dd/MM/yyyy,
3. částka je s desetinnou čárkou,
4. referenční číslo je vhodný kandidát unikátního klíče,
5. import se v tomto use-case filtruje na Směr úhrady = Příchozí.

Hotový návrh profilu je připraven v artefaktu:

1. workdata/reconciliation/2026-04-10/airbank_import_profile_v1.json

---

## 10. Historie plateb v jednom souhrnu

### 10.1 Cíl stránky

Jedna stránka, kde je vidět:

1. bankovní i hotovostní přijaté platby,
2. stav párování,
3. vazba na předmět platby,
4. audit změn.

### 10.2 Minimální filtry

1. období od/do,
2. source_type (bank/cash),
3. reconciliation_status,
4. člen / plátce,
5. charge_type,
6. částka od/do,
7. has_vs ano/ne,
8. pouze konfliktní položky.

### 10.3 Minimální sloupce

1. datum,
2. částka,
3. zdroj,
4. VS,
5. plátce,
6. zpráva/poznámka,
7. stav párování,
8. alokační souhrn,
9. poslední změna a uživatel.

### 10.4 Drill-down

Po rozkliknutí položky:

1. detail zdroje,
2. historie stavů,
3. alokační řádky,
4. akce: párovat, rozdělit, ignorovat, odpárovat.

---

## 11. Legacy payments přechod

Platí schválené pravidlo:

1. Prokazatelně nahrazené bankovními importy smazat.
2. Ostatní ponechat jako hotovostní připravené k rekonciliaci.

V této seanci je připraven podklad:

1. strict delete kandidáti,
2. keep as cash kandidáti,
3. cleanup summary.

Důležité provozní pravidlo:

1. Mazat až po snapshotu a po schválení výsledku.

---

## 12. UX požadavky

### 12.1 Dvojí hotovostní vstup

Musí existovat současně:

1. Quick cash intake (rychlé zadání),
2. Direct cash on obligation (přímo nad závazkem).

### 12.2 Potvrzovací UX

1. Odpárování: vždy modal s přehledem dopadů.
2. Změna splitu u confirmed: vždy modal.
3. Párování a split potvrzení (dokončení) bez extra potvrzení, pokud nejde o rušení historie.

### 12.3 Viditelnost stavu

Každý řádek má viditelný badge stavu:

1. unmatched,
2. suggested,
3. split_draft,
4. confirmed,
5. ignored.

---

## 13. Audit a dohledatelnost

Každá relevantní akce musí mít audit stopu:

1. import transakce,
2. změna stavu,
3. vytvoření/smazání alokačního řádku,
4. split,
5. ignore,
6. undo.

Audit záznam musí obsahovat:

1. kdo,
2. kdy,
3. co se měnilo,
4. before/after.

---

## 14. Nefunkční požadavky

1. Idempotentní import.
2. Deterministické párovací skóre.
3. Žádná ztráta dat při opakovaném importu.
4. Stránka historie použitelna na více tisíc položkách.
5. Každá destruktivní akce potvrzena.

---

## 15. Akceptační kritéria V1

1. Systém umí importovat příchozí bankovní platby z API i file profilu.
2. Systém umí zadat hotovost rychle i přímo nad závazkem.
3. Všechny přijaté platby jsou viditelné v jednom společném přehledu.
4. Lze platbu napárovat, rozdělit, změnit, odpárovat a ignorovat.
5. Odpárování a změna historie vyžadují potvrzení.
6. Lze zobrazit historii změn každé položky.
7. Legacy payments jsou rozděleny na strict delete a keep as cash dle schváleného pravidla.

---

## 16. Realizační etapy

### Etapa A: Stabilizace importu a ledgeru

1. sjednotit příchozí platby do jednoho ledger konceptu,
2. napojit Fio sync,
3. přidat file import přes profil,
4. připravit Air Bank profil jako referenci.

### Etapa B: Rekonciliace workflow

1. stavy,
2. párování,
3. split/re-split,
4. ignore,
5. potvrzovací flow.

### Etapa C: Historie a provoz

1. souhrnná stránka historie,
2. auditní detail,
3. uzávěrkový report.

### Etapa D: Legacy cleanup

1. snapshot,
2. strict delete,
3. keep as cash,
4. kontrolní report po zásahu.

---

## 17. Rizika a mitigace

1. Riziko: chybějící VS u historických dat.  
Mitigace: fallback heuristiky + manuální workflow.
2. Riziko: falešně pozitivní auto-match.  
Mitigace: auto-confirm jen u jednoznačných případů.
3. Riziko: ztráta kontextu při splitu.  
Mitigace: striktní invariant součtu a audit line-level změn.
4. Riziko: agresivní cleanup legacy payments.  
Mitigace: strict pravidla + snapshot + dry-run.

---

## 18. Ukázkové scénáře

### Scénář A: Jednoznačná bankovní platba

1. Import přivede bankovní transakci 1000 CZK, VS odpovídá jednomu členu.
2. Systém navrhne confirmed nebo suggested dle pravidel.
3. Admin potvrdí.
4. Položka je v historii jako confirmed s vazbou na předpis.

### Scénář B: Rodinná platba 3000 CZK

1. Import přivede platbu 3000 CZK s textem obsahujícím více jmen.
2. Systém ji označí jako split candidate.
3. Admin rozdělí 1500 + 800 + 700.
4. Položka přejde na confirmed s třemi řádky.

### Scénář C: Rychlá hotovost

1. Admin přijme hotově 2500 CZK a zapíše poznámku "Kukla příspěvky za 25 a 26".
2. Položka je unmatched v historii.
3. Později ji admin rozdělí mezi dva závazky a potvrdí.

### Scénář D: Oprava chybného párování

1. Confirmed položka je při revizi špatně napárovaná.
2. Admin zvolí odpárovat.
3. Systém vyžádá potvrzení.
4. Položka se vrátí na unmatched a znovu se napáruje správně.

---

## 19. Definice hotových artefaktů pro realizaci

Pro vývoj jsou připravené podklady:

1. business a architekturní analýza,
2. AirBank profil,
3. klasifikace legacy payments,
4. seznam kandidátů pro cleanup,
5. uzávěrkové podklady.

Tento dokument je hlavní implementační zadání. Další artefakty jsou podpůrné.

---

## 20. Závěrečné rozhodnutí pro V1

Platí tyto závazné volby:

1. Polymorfní přístup pro předmět platby je ve V1 schválen.
2. Hotovost bude zadávatelná oběma způsoby (rychle i nad závazkem).
3. Import z dalších bank je součást V1 přes profilový mechanismus.
4. Legacy payments se čistí pravidlem strict-delete vs keep-as-cash.
5. V1 řeší pouze přijaté platby.
