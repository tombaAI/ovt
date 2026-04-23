# Ukázka formátování Markdown

Toto je ukázkový dokument pro všechny, kdo chtějí psát poznámky ve formátu Markdown.
Markdown je prostý text — píšeš ho ručně, ale zobrazí se hezky naformátovaný.

---

## Nadpisy

# Nadpis první úrovně (H1)
## Nadpis druhé úrovně (H2)
### Nadpis třetí úrovně (H3)
#### Nadpis čtvrté úrovně (H4)

---

## Odstavce a řádkování

Odstavce se oddělují prázdným řádkem.

Takto vypadá druhý odstavec.
Tento řádek je hned za předchozím — bez prázdného řádku se zobrazí jako pokračování téhož odstavce.

---

## Důraz a zvýraznění

**Tučný text** se zapíše dvěma hvězdičkami z každé strany.
*Kurzíva* se zapíše jednou hvězdičkou.
***Tučná kurzíva*** kombinuje obojí.
~~Přeškrtnutý text~~ se zapíše dvěma vlnovkami.

---

## Seznamy

### Nečíslovaný seznam

- První položka
- Druhá položka
- Třetí položka
  - Vnořená položka (odsazená dvěma mezerami)
  - Další vnořená
- Čtvrtá položka

### Číslovaný seznam

1. Příprava materiálu
2. Svolání schůze
3. Zápis usnesení
   1. Usnesení č. 1
   2. Usnesení č. 2
4. Rozeslání zápisu

### Úkolový seznam (checkboxy)

- [x] Zaplacené členské příspěvky
- [x] Aktualizovaný seznam členů
- [ ] Zápis ze schůze výboru
- [ ] Odeslané e-maily o brigádě

---

## Odkazy

[OVT Bohemians](https://ovtbohemians.cz) — odkaz s textem

---

## Kód

Inline kód se píše do `zpětných apostrofů` — hodí se třeba pro čísla, zkratky nebo technické výrazy.

Blok kódu (nebo prostě text, který chceš zobrazit přesně tak, jak je napsaný):

```
Toto je blok kódu.
Zachová mezery i odsazení.
Hodí se třeba pro čísla účtů, instrukce krok za krokem apod.
```

---

## Citace / zvýraznění bloku

> Toto je citace nebo důležitá poznámka.
> Hodí se pro upozornění, citace usnesení nebo výňatky z dokumentů.

> **Pozor:** Usnesení výboru č. 3/2026 zavazuje všechny členy k účasti na brigádě
> do 31. května 2026, jinak bude uplatněna přirážka 500 Kč.

---

## Horizontální oddělovač

Tři pomlčky na samostatném řádku vytvoří oddělovací čáru:

---

## Tabulky

| Člen          | Příspěvek | Zaplaceno | Poznámka        |
|---------------|-----------|-----------|-----------------|
| Jan Novák     | 1 500 Kč  | ✓         |                 |
| Petra Svobodá | 1 000 Kč  | ✓         | sleva výbor     |
| Karel Marek   | 1 500 Kč  | ✗         | upomínka 15. 4. |
| Eva Horáčková | 800 Kč    | ✓         | část roku       |

Zarovnání sloupců lze určit dvojtečkou v oddělovacím řádku:

| Vlevo        |   Na střed   |        Vpravo |
|:-------------|:------------:|--------------:|
| text         |    text      |          text |
| 1 500 Kč     |   leden      |       #000001 |

---

## Kombinace prvků

Markdown lze libovolně kombinovat:

### Zápis z výborové schůze — 15. 4. 2026

**Přítomni:** Novák, Svobodová, Marek, Horáčková
**Omluven:** Procházka

#### Projednávané body

1. **Brigády 2026**
   - Termín první brigády: **10. května 2026**
   - Vedoucí: Jan Novák
   - Potřebný počet: minimálně **8 členů**

2. **Příspěvky**
   - Celkem vybráno: `87 500 Kč` z `95 000 Kč`
   - Zbývá vybrat od **5 členů**
   - Termín pro upomínky: do konce dubna

3. **Různé**
   - [ ] Objednat materiál na opravy mola
   - [x] Aktualizovat seznam lodí v krakorcích

> **Usnesení č. 1/2026:** Výbor schvaluje termín brigády 10. 5. 2026
> a pověřuje Jana Nováka organizací.

---

## Tipy pro psaní

- **Prázdný řádek** = nový odstavec
- **Dva řádky `---`** = oddělení kapitol
- **Hvězdičky** kolem slova = tučně nebo kurzíva
- **Pomlčka na začátku** = odrážka v seznamu
- **Číslo a tečka** = číslovaný seznam
- **`[x]`** = zaškrtnutý úkol, **`[ ]`** = nezaškrtnutý úkol
- **Tabulky** se hodí pro přehledy, ale nemusí být dokonale zarovnané — Markdown je opraví sám
