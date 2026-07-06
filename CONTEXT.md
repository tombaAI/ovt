# OVT správa

Interní administrace klubu OVT Bohemians — členové, příspěvky, platby, akce a jejich vyúčtování, lodě, brigády.

## Language

**Náklad akce** (`event_expenses`):
Jedna položka výdaje spojená s akcí — účtenka k proplacení účastníkovi/členovi (`isPaid: true`), nebo faktura k úhradě klubem (`isPaid: false`). Nese `amount` (zapsaná/potvrzená částka) a volitelně přílohu dokladu.
_Avoid_: Výdaj, položka, doklad (doklad = konkrétně příloha, viz níže)

**Doklad**:
Nahraný soubor (PDF/foto) připojený k nákladu akce jako důkaz (účtenka nebo faktura). Jeden náklad má nejvýše jeden aktuální doklad.
_Avoid_: Příloha (používat jen jako synonymum v UI textech, ne jako termín)

**Zjištěná částka** (`analyzedAmount`):
Částka, kterou Gemini přečetl z **aktuálně přiloženého** dokladu při poslední analýze (nový náklad i výměna dokladu). Nezávisí na tom, co si uživatel do `amount` nakonec zapsal/ponechal. Ruční oprava `amount` mimo re-analýzu `analyzedAmount` nemění.
_Avoid_: Detekovaná částka, OCR částka

**Neshoda**:
Stav, kdy se `amount` (zapsaná částka) a `analyzedAmount` (zjištěná částka) po zaokrouhlení na haléře liší — včetně případu, kdy Gemini částku vůbec nepřečetl (`analyzedAmount = null` se považuje za neshodu, ne za "bez dat"). Řeší se opravou `amount`, novou výměnou dokladu, nebo (jen hospodář) potvrzením jako v pořádku — viz Potvrzení neshody.
_Avoid_: Mismatch (jen jako anglický název pole/kódu v API, ne v textu pro uživatele)

**Potvrzení neshody** (`mismatchAcknowledgedAmount`/`mismatchAcknowledgedAnalyzedAmount`):
Hospodářské potvrzení, že AKTUÁLNÍ neshoda je v pořádku (typicky jiná měna dokladu — nikdy nepůjde srovnat na číselnou shodu). Snapshot dvojice `(amount, analyzedAmount)` v okamžiku potvrzení — jakákoli pozdější změna kterékoli hodnoty potvrzení automaticky zneplatní (nejde tedy o "ignorovat tenhle doklad napořád", ale o potvrzení jedné konkrétní situace). Potvrzená neshoda neblokuje odeslání vyúčtování.
_Avoid_: Ignorovat neshodu, schválit neshodu (potvrzení není totéž co schválení nákladu)

**Zamčeno pro účastníky** (`lockForParticipants`):
Akce má vygenerované předpisy (`billingStatus: "prescribed"`) — částky nákladů jsou needitovatelné, protože vstupují do výpočtu předpisů. V tomto stavu smí neshodu u výměny dokladu potvrdit jen hospodář.
_Avoid_: Zamčené náklady (bez upřesnění které ze dvou zamčení)

**Zamčeno pro proplacení** (`lockForReimbursement`):
Tvrdší zámek — blokuje úplně jakékoli přikládání/výměnu dokladů i editaci nákladu, bez výjimky pro hospodáře. Používá se, když se náklady akce už zpracovávají k proplacení.
_Avoid_: Výdajový zámek (v hláškách UI ano, jako termín v dokumentaci raději celý název)

**Hospodář** (`TREASURER_EMAIL`):
Jediná role s právem potvrdit neshodu zjištěné vs. zapsané částky, když je akce zamčená pro účastníky. Mimo zamčený stav neshodu (i výměnu dokladu obecně) může řešit kterýkoli admin.
_Avoid_: Treasurer (v kódu ano jako identifikátor, v textu pro uživatele "hospodář")
