# Životní cyklus akce

## Dashboard akce
kolik lidí je přihlášených
kolik zaplacených záloh, resp. zaplacené všechny předpisy



---

## 1. Založení akce

Funkce nová akce v OVTIS:
Při zakládání akce zadáme základní informace: 
název, 
typ akce (VODA: kanál, jednodenka, víkendovka, zahraniční; brigáda, hamerák, Jiřetín, valná hromada, schůze výboru, TJ akce),
termín: den, případně hodina od do + pokud je vícedenní, tak do kdy
 termín může být i jen orientační - pak dáme možnost zadat měsíc a rok
vedoucí akce (člen oddílu, který ji organizuje)
místo srazu
místo kam se jede - pokud je to voda, tak z výběru (a může jich být i více)
textový popis
odkaz na přihlášky / formulář

synchronizace do Google kalendáře 
- pokud přidáváme v OVTIS, tak dát možnost sync do Google
- pokud je v Google kalendáři, a není v OVTIS, tak bude možnost importu + doplnit tyhle data přes průvodce

**přihlášky**:
akce bude většinou mít přihlášky (asi budou i akce bez přihlášek)
přihláška může být inciována členem, nečlenem i vedocím akce (příp. jiným adminem)
pokud je člen přihlášeny v systému (=> nutné umět členy přihlásit), tak může do přihlášky dát sebe nebo jakéhokoliv dalšího člena oddílu, příápadně i nečlena oddílu 
hlásit se může i nečlen, pak ale nemůže vybírat ze členů (ani de-facto sebe)

možnost přihlášky souvisí se stavem akce - akce může být vytvořená, ale nejsou otevřené přihlášky. Vedoucí přihlášky zapne, vypne, mohou být omezené časem.

Obsah formuláře pro přihlášku:
pokud není člen, tak jméno, příjmení, email, telefon - povinně hlavního přihlašovatele, volitelně všech (případně poznámka proč ty ostatní telefony a emaily)
u členů tyhle údaje máme.
dále bez ohledu na člen/nečlen:
vedoucí akce konfiguruje přihlášku - budeme mít předpřipravené otázky (= udělat konfigurátor otázek). Ke každé může vedoucí zadat poznámku, proč ten údaj chceme.
- typ lodě: textzové pole
- datum narození (+ info, proč to sbíráme)
- číslo pojištění + pojišťovna
- poznámka
konfigurátor umožní otázce nastavit: text, popis, typ datového pole (text, číslo, datum, ano/ne, výběr z možností), povinné/volitelné, případně i validace (např. pro email). (Nová funkce.)

tím formulářem by měl projít i veoducí akce/admin při přihlašování v IS - ta cesta by měla být stejná, jen se liší autorizace na základě které přihlašuje + ten vedoucí / admin není součástí té přihlášky.

jedna přihláška může obsahovat více osob, členů i nečlenů (současná funkčnost)

počet lidí na akci může být limitován - pokud je dosažen, je možné další přihlášku vyplnit, ale pouze pod čarou, v tu chvíli záloha není vypsána. Dále pokud se změní kapacita akce, nebo někdo odhlásí, vedoucí akce ručně tu přihlášku označí že se vejde "posune nad čáru" - potom se pošle mail s informací o záloze. (Nová funkce.)

časově může být přihláška stejným způsobem limitovaná s tím, že je po termínu, nebude se posíalt předpis, buď ho pošle vedoucí tímto mechanizmem, nebo to ten člověk pak zaplatí v doplatku rovnou celé.


**Bude záloha?** 
Pokud ano, určíme výši zálohy a datum splatnosti. 
Na zálohu se pak generují předpisy plateb a ve vyúčtování se záloha odečítá od doplatku.
Obecně je potřeba chápat, že se může stát, že někdo pošle peníze (zálohu), ale ještě to nebude spárované v systému. Proto je potřeba mít možnost označit zálohu jako „příslib" — potvrdit, že byla odeslána a má se s ní počítat v doplatku, i když ještě není spárovaná. (Nová funkce.)

**Nákladdy akce**
od vytvoření akce je možné evidovat náklady zaplacené.

---

## 2. Pozvánka

Po vytvoření akce nebo i kdykoliv jindy lze rozeslat pozvánku e-mailem — informace o akci, případně odkaz na přihlašovací formulář. Prostě info o akci.
Příjemci jsou členové oddílu (všichni aktivní). Pozvánka není přihláška, jen oznámení. (Nová funkce.)
možnost pro rozeslání přidat seznam emailů, které nejsou členy oddílu.
email je možné poslat jen jednomu členovi, nebo cizímu mailu.


---

## 3. Přihlášky

viz výše.
ten formulář by měl být stejný pro všechny - vedoucí akce, admin, člen přihlášený i nečlen.


---

## 4. Náklady

Náklady lze zadávat průběžně celou dobu — před akcí, po akci. (Základ funguje.)

Každý náklad má: částku v CZK, účel, kategorii dle TJ Bohemians, osobu, která ho zaplatila (beneficient), a způsob, jak se rozpočítá mezi účastníky — buď rovnoměrně na všechny, nebo jen na část, nebo s různými koeficienty (dospělý vs. dítě apod.). => současná funkčnost

K nákladu lze přiložit sken účtenky.

Existují i náklady typu faktura, která není v té chvíli zaplacena, ale bud eji platit bohemka (současná funkčnost)

**Náklady v EUR:** Pro zahraniční akce lze zadat částku v EUR — uvede se i použitý kurz / nebo spíše přesná částka (kterou to odečetlo z účtu) a systém si uloží ekvivalent v korunách, se kterým pak pracuje dál. (Nová funkce.)

k jednomu nákladu je možné zadat i více dokumemtnů - třeba právě k té zahraniční účtence (1 účtenka, 2 výpis z účtu s částkou a kurzem). Ty dokumenty se pak zobrazí v přehledu nákladů a budou k dispozici pro export do PDF ve vyúčtování.

náklad může být i něco, co někdo zaplatil, ale nemá k tomu účtenku. Uděláme možnost zadat do systému "čestné prohlášení", kde se tohle vyplnít (už to tam je jako PoC, dohledej).
Co tam bude zadané:
- náklad bude vždy k akci
- účel platby
- částka c Kč
- osoba, která to zaplatila (beneficient)
- okýnko pro podpis (obecně to bude asi vedoucí akce, ale může to být i ten beneficient - neřešíme kdo to je).
k tomu nákladu se pak samozřejmě řeší, kam to zaplatit - to už je stejná funkčnost jako u jiných dokladů


současná funkčnost:
je matoucí taková ta věc "k zaplacení" a "zaplaceno" - to je potřeba nějak přehledněji rozlišit. 

Udělat jinak:
Náklad a ten současný postup je pouze pro náklady, které někdo zaplatil z vlastní kapsy a čeká na proplacení od TJ. Ten náklad se zadá, označí se beneficient, který to zaplatil, a pak se to odešle k proplacení. To je jedna věc.

Samostatně a odděleně bude faktura: Faktura vystavená na TJ Bohemians k proplacení účetním oddělením.
Bude mít samostatné tlačítko, protože platba na fakturu bude velmi málo četná.

Při běžném zadávání nákladu a rozpoznání se nebdue vůbec řešit faktura (jako to bylo dřív), prostě faktura se pouze nahrává a předem víš, že máš fakturu.


je potřeba umět zadat náklad i neúplný:
třeba vím částku, ale nemám doklad
nebo mám doklad, ale nevím beneficienta
nebo chci jen zadat náklad s názvem, ale nic k tomu zatím

---

## 5. Přehledy před odjezdem

Před akcí si vedoucí může stáhnout tisknutelné přehledy:

**Pivník** — seznam přihlášek s tabulkou pro čárky (evidence konzumace na chatě). (Funguje.)

**Ubytovací přehled** — seznam účastníků s datem narození. Potřebné pro kempy, chaty, pojistné výkazy. (Nová funkce — datum narození se zadá buď při přihlášení, nebo ho doplní admin.)

**Sběrací arch pojištění** — tisknutelný arch se jmény a daty narození všech účastníků, s místem pro podpis. (Nová funkce.)

připravit jako konfigurátor pro definici šablon k tisku.
bude možné vybrat co za sloupce tam bude, včetně sloupce bez obsahu s titulkem (aka pivník).


---

## 6. Vyúčtování

Po akci (nebo i během nebo před ní, pokud jsou náklady jasné) se spočítá, kolik každá přihláška zaplatí.

Výpočet: součet nákladů alokovaných na přihlášku, minus dotace oddílu pro členy, minus uhrazená záloha. Výsledkem je doplatek — nebo přeplatek, pokud záloha byla vyšší než cena. (Základ výpočtu funguje, odečet zálohy je potřeba doplnit.)

Přeplatek: zatím neuvažovat, ale v budoucnu dořešíme co s tím.


**Příslib zálohy:** Stane se, že účastník zálohu poslal, ale platba ještě nebyla zaúčtována v systému. Vedoucí akce může zálohu označit jako „příslib" — potvrdit, že byla odeslána a má se s ní počítat v doplatku, i když ještě není spárovaná. (Nová funkce.)

Vyúčtování se „uzamkne" — vygenerují se předpisy plateb pro každou přihlášku a rozešlou se e-mailem s QR kódem a variabilním symbolem. (Funguje.)

odělit funkčnost uzamčení nákladů a rozeslání předpisů doplatků.

 Lze odemknout, doplnit náklady a znovu uzamknout — pokud se po akci ukáže, že něco chybí.

Je potřeba oddělit vyúčtování z pohledu toho, co mají zaplatit účastníci (tj. příjmy) a z pohledu nákladů, které čekají na proplacení od TJ (výdaje). Může nastat situace, že nemám všechny podklady pro proplacení nákladů z TJ (nemám fakturu, ale znám cenu), ale už známe všechny částky i koeficienty pro rozpočítání na účastníky, potom je možné uzamknout tuto část, rozeslat předpisy a pak teprve doplnit vlastnosti nákladů, které čekají na proplacení od TJ. Tedy že nebude už možné měnit částky, ale bude možné doplňovat vlastnosti nákladů.
Potom v nějakou chvíli dojde k odeslání nákladů k proplacení na Bohemku, tj. že nebudee možné měnit vlastnosti dokladů.
Může se i stát, že nejdříve pošlu náklady na Bohemku, a teprve potom budu řešit doplatky účastníků, kdy u nákladů se třeba může ještě měnit jejich rozdělení na účastníky.
Tedy: bude nutné mít možnost uzamknout část vyúčtování z pohledu příjmů (účastníci), a část z pohledu výdajů (náklady čekající na proplacení od TJ) zvlášť. Tedy určit, které vlastnosti jsou jedním nebo druhým zámkem zamčené, některé budou jakýmkoliv z nich - třeba částka (Nová funkce.)

Proces odeslání na účastníky:
- uzamčení nákladů (z pohledu příjmů)
- tlačítko pro rozeslání všech předpisů doplatků
- samostatnou možnost odeslat jedné přihlášce.
- připomínku platby (za N dní)

storno podmínky: pokud někdo odhlásí účast, 
a byly zálohy:
co s tou zálohou?
A) kolik zálohy se bude vracet (v Kč)
B) co se zbytkem:
1) navázat na konkrétní (fixní) náklad (jeden), tj. ta záloha zlevní ten konkrétní náklad
2) zlevnit rovnoměrně všechny náklady, které se rozpočítávají na účastníky podle koeficientů
3) propadne to oddílu (= zůstává zcela mimo náklady a přijmy akce)


Hospodář musí vyúčtování schválit před odesláním. (Funguje.)
Proplacení faktury - pošle se na TJ jako samostatný mail (ověřit, co z toho už máme)

### Papírové doklady do TJ Bohemians
Náklady akce, které vznikly ve fyzické podobě  se musí také dostat ve fyzické podobě do TJ Bohemians.
Kromě účtenek také generované Čestné prohlášení.
Co s tím v systému:
- 


---

## 7. Párování plateb a uzavření

Příchozí platby se párují s předpisy — automaticky podle variabilního symbolu, nebo ručně adminem. (Základní párování funguje, ruční párování je potřeba dovést do konce.)

Na výdajové straně: náklady platí z vlastní kapsy beneficienti, TJ Bohemians jim je pak proplácí. Systém eviduje, kdy bylo proplacení odesláno.

Akce je uzavřena, když jsou zaplaceny všechny doplatky (nebo storno) a TJ proplatila všem beneficientům jejich náklady. Uzavřená akce dostane stav „Uzavřeno" a v seznamu akcí je jasně označena. (Nová funkce.)

---

## Otevřené otázky

1. Datum narození — ptáme se na formuláři při přihlášení, nebo ho doplňuje admin dodatečně? (Citlivý údaj, ne všichni ho budou chtít sdílet přes web.)
2. Pozvánka — komu? Aktivní členové aktuálního roku, nebo všichni v systému?
3. Záloha — generuje se předpis zálohy automaticky po přihlášení přes formulář, nebo ji admin generuje ručně?
4. EUR kurz — admin ho zadá ručně, nebo se napojíme na kurz ČNB?
5. Proplacení nákladů od TJ — stačí zaznamenat datum proplacení, nebo chceme propojit s konkrétní transakcí z importu financí TJ?


## Další věci
- fotky a videa z akce: více odkazů

- když někdo zaplatí zálohu a pak nejede - co s tím
  1) propadne bez rozpočítání -> zlevní zájezd ostatním rovnoměrně
  2) započítá se na část nákladů (např. doprava) a to maximálně do výše zaplacené zálohy
  3) část zálohy se vrátí, část propadne (např. 50%)

## Dotace na akci

dotace na akci ve fixní výši
pravidla pro počítání na členy:
max 200 na člověkoden
max náklady toho člena
