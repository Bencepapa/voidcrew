# Token-napló (ügynök-feladatok fogyasztása)

Cél: lássuk, melyik munka mennyibe kerül, javul-e a fogyasztás a `GameViewport.tsx` szétszedése után, és megoldható-e ugyanaz kisebb modellel vagy kisebb erőfokozattal (effort). **Minden befejezett ügynök-feladat után egy sor.** A számok a befejezéskor kapott összesítésből vagy a Codex "tokens used" sorából jönnek; Claude és Codex számai **nem** hasonlíthatók össze közvetlenül (más modell, más tokenizáló, más gyorsítótár-számolás), csak az egy rendszeren belüli arányok.

| Dátum | Feladat | Ki | Modell | Effort | Token | Eszközhívás | Perc | Eredmény | Megjegyzés |
|---|---|---|---|---|---:|---:|---:|---|---|
| 11-24 | Tárgy eldobása | Claude | sonnet | high | 331 325 | 162 | 17 | kész | |
| 11-25 | Tűz-, méreg-, előhívó csapdák | Claude | sonnet | high | 445 937 | 45* | 6* | kész | *újraindítás után; limit miatt kétszer indult |
| 11-24 | Zárható ládák, kulcsok | Claude | sonnet | high | 268 602 | 138 | 11 | kész | |
| 11-25 | Hangelemek | Claude | sonnet | high | 518 185 | 284 | 32 | kész | sok mérés |
| 11-25 | Színvilág (LUT) | Claude | sonnet | high | 306 015 | 178 | 18 | kész | |
| 11-25 | Hang-finomítás | Claude | sonnet | high | 437 225 | 349 | 41 | kész | sok mérés |
| 11-25 | Hang-zónák | Claude | sonnet | high | 473 533 | 31* | 7* | kész | *újraindítás után; a főmappába tévedt egyszer |
| 11-25 | Kódtérkép, szabályok | Codex | (alap) | (alap) | 75 382 | n/a | n/a | kész | |
| 11-25 | Teszt-futtató | Codex | (alap) | (alap) | 84 644 | n/a | n/a | kész | |
| 11-25 | Füstpróba | Codex | (alap) | (alap) | 101 537 | n/a | n/a | kész | |
| 11-25 | Nézet szétszedése, 1. lépés | Codex | (alap) | (alap) | n/a | n/a | n/a | kész | token nem mentve |
| 11-25 | Nézet szétszedése, 2. lépés | Codex | (alap) | (alap) | n/a | n/a | n/a | kész | token nem mentve |
| 11-25 | Nézet szétszedése, 3. lépés | Codex | (alap) | (alap) | 105 716 | n/a | n/a | kész | |
| 11-25 | Fű és búza textúrák (3 készlet, generátor) | Codex | (alap) | (alap) | 74 847 | n/a | n/a | kész | seamless, tesztelt |

## Mérési terv (kicsi, hogy maga a mérés ne legyen drága)

1. **Szétszedés előtt-után**: ugyanaz a kis mérőfeladat (például: "új Debug csúszka a ködhöz i18n-nel és teszttel") egy ügynökkel, kétszer: a szétszedés előtti commiton (`1131987`) és a mostanin, azonos modellel és erőfokozattal; mérjük a tokent, az eszközhívásokat és hogy zöld-e az `npm run check`.
2. **Modell és effort**: ugyanaz a mérőfeladat sonnet/high, sonnet/medium, sonnet/low, haiku mellett (vagy Codex kis erőfokozattal); a mérce: zöld-e a `npm run check`, és hány token/eszközhívás.
3. Eredmény a fenti táblázatba, a "Megjegyzés" oszlopban a mérőfeladat nevével.

## Szabályok a fogyasztás csökkentésére (2026-11-25-től)

- Alapértelmezett ügynök-erőfokozat: **medium** (high csak indokolt, nagy és kockázatos feladatra); mechanikus munka (áthelyezés, generálás, dokumentáció): **Codex** vagy kis erőfokozat.
- Kis, jól körülhatárolt feladatok; a brief tartalmazza a releváns fájlokat, hogy az ügynök ne fedezze fel újra az egész kódbázist.
- Nincs nagy Drive-dokumentum beolvasás/beillesztés és böngészős képernyőkép, ha egy szöveges ellenőrzés is megteszi.