# Backfill `analyzedAmount` existujících nákladů hodnotou `amount`

Kontrola shody zjištěné vs. zapsané částky (`analyzedAmount` vs. `amount`) se plní jen při
Gemini analýze dokladu — u nákladů, které mají doklad přiložený už dnes, žádná analýza
neproběhla a bez zásahu by `analyzedAmount` zůstal `NULL` napořád (kontrola by se na ně
nikdy neuplatnila).

Rozhodnuto: migrace u všech existujících nákladů **s přílohou** (`fileUrl IS NOT NULL`)
nastaví `analyzed_amount = amount`. Toto číslo neodpovídá žádné skutečné analýze dokladu —
je to vědomě nepřesné, ale zajišťuje, že se stará data chovají jako "shoda" (žádný falešný
alert) místo aby zůstala navždy mimo kontrolu. Alternativa (ponechat `NULL` a nechat je
mimo kontrolu, dokud někdo doklad nevymění) byla zamítnuta — u drtivé většiny nákladů se
doklad nikdy nevymění, takže by kontrola v praxi nepokrývala prakticky nic z existující
historie.

Důsledek: `analyzedAmount IS NOT NULL` u starého nákladu neznamená "Gemini toto ověřil" —
znamená to buď skutečnou analýzu (nové/vyměněné doklady od zavedení této funkce), nebo
backfill rovnou ze zapsané částky (starší doklady). Nelze podle samotné hodnoty rozlišit,
které z toho platí.
