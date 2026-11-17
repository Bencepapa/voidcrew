# Assets: új tárgy, NPC, matrica, prop és ajtó létrehozása (terv v3, 2026-11-17)

A `asset-manager-textures-plan.md` (textúrák) kiterjesztése. Ugyanaz a szerkezet marad: helyi piszkozat, sárga „mentetlen” sáv,
**Közzététel** belépéssel (`sharedAuth.ts`), mappás tár `meta.json`-nal. Új: a tartalom **típusa** is a `meta.json`-ban.

## 1. Közös modell

```
void-textures/<világ>/<típus>/<uuid>/
  meta.json   { "type": "texture|item|decal|prop|actor|door", "name", "rev", "archived", ...típus-mezők }
  diffuse.png normal.png depth.png surface.png emissive.png ...   (a típus csatornái)
```

- A csatornák ugyanúgy **Feltöltött / Auto / Nincs** módúak (Auto: a normalMap-mag, lásd a textúra-terv 4. pontját).
- **Átlátszó szín** (diffuse-ban): alapérték magenta (`#ff00ff`), de textúránként állítható (van, ahol fehér) vagy „nincs”;
  a `meta.json`-ban `transparentColor`. A feldolgozás ebből készít átlátszó pixelt és lyukat a mélységtérképben.
- Betöltéskor a típus szerint kerül a megfelelő katalógusba (`TEXTURE_SETS`, `ITEM_TYPES`, `PROP_TYPES`, `ACTOR_TYPES`, ajtótípusok,
  matrica-jegyzék). A beépített bejegyzések csak olvashatók (zárolt jelzés), a feltöltöttek szerkeszthetők.
- A fa és az Asset Manager ugyanazokból a katalógusokból épül, a feltöltött elem **felhasználói** jelzést kap (mint az AUTO).

## 2. Típusok

**Textúra** (kész a tervben): fal / padló / plafon jelölők, pixel art, csatornák.

**Tárgy (item):** név, kategória (a mai `ITEM_TYPES` kategóriái), `diffuse` kötelező (a normal/depth Auto vagy Nincs), opcionális
saját fény (`glow`), a lerakott sprite magassága. A tárgy játékbeli hatása/statjai **nem itt** vannak: a RPG-szabálymotor
tárgya hivatkozik erre az azonosítóra (lásd `concept/rpg-ruleset-integration-plan.md`); az Assets csak a megjelenést és az azonosítót adja.

**Matrica (decal):** diffuse (+normal/depth), alap méret, felület (fal / padló / plafon), felcserélhető átlátszó szín.

**Prop:** a mai fajták közül az első változatban az **egy textúrás** fajták: `panel` (egy függőleges kivágás, relief),
`billboard`, `cross`. Mezők: méret, magasság a padlótól (`elevation`), blokkol-e (`blocks`), falra szerelt-e (`wall`), relief mélység.
A `box`, `views`, `cabin` (több nézetes) és 3D-modell prop később.

**NPC / sprite-sheet:** a böngészőben vágás: a kép feltöltése, **oszlop × sor** megadása, a sorok szerepe (idle, séta A/B, támadás,
találat, elesés, halott), élő előnézet animálva, a hátoldali/oldalsó nézetek jelölése. Ma ezt a `npm run actors:sheet` parancs csinálja
(`SPRITE_SHEET.md`); a böngészős változat ugyanazt a vágási logikát futtatja. A harci statok az RPG-motorban élnek, az Assets a
megjelenést és az azonosítót adja (sheet, méret, hangok).

**Ajtó:** új típus (lásd 3.).

## 3. Ajtó-típus (`DoorKind`)

Az ajtó két textúrából és egy mozgásból áll:
- **Lap** (ajtólap): textúra-készlet (pl. `fantasygate1` rács, `door1` csúszó panel).
- **Keret**: textúra-készlet (pl. `fantasydoorframe1` boltív, `doorframe1`), saját **szűkebb keret** is lehet.
- **Mozgás:** csúszó (falba), **oldalra kifordulós** (zsanéros, nyitás iránya + szög), felfelé húzódó (rács), kétszárnyú (később).
- Nyílás mérete (szélesség × magasság), zárhatóság, hangok.

A térképen az ajtó a típusát tárolja (`DoorSpec.type`); ma a térkép szintű `textures.door` / `textures.doorFrame` dönt, ez marad
az alapértelmezés, ha nincs típus.

**Különleges nézet az Asset Managerben:** egy „Ajtó + keret” előnézet, ahol a lap a keretben látszik, nyitható/zárható animációval
(a mozgás szerint), mindkét oldalról nézhető. Az egyedi lap- vagy keret-textúra külön is megtekinthető (mint ma).

## 4. Egy textúra, több használat

Az ajtólap (rács) és a keret (boltív) **ne kelljen újra feltölteni propként**: ugyanaz a textúra-készlet több szerepben él.
- Azonnal, kód nélkül az adatmodellen: a `panel` prop fajta már ezt tudja („egy függőleges relief kivágás, az átlátszó pixelek kihagyva”).
  Felvehető `fence1` (`fantasygate1`) és `arch1` (`fantasydoorframe1`) prop a `PROP_TYPES`-ba, a meglévő fájlokkal.
- Hosszabb távon az Asset Managerben a textúrán **„Használat”** jelölők: Fal / Padló / Plafon / Ajtólap / Ajtókeret / Prop.
  A jelölők a `meta.json` `kinds` tömbjéből jönnek (ma: `kind`), és a fában minden szerepben megjelenik az elem.

## 5. Építési sorrend

1. A textúra-terv 3–6. lépése (generátor, `+ Új textúra`, mappás tár, Közzététel) és az **átlátszó szín** beállítás.
2. A tárolás típus-általánosítása (`type` a `meta.json`-ban, betöltők típusonként).
3. Tárgy és matrica létrehozása (egyszerű: egy kép + néhány mező).
4. Prop létrehozása (panel / billboard / cross), a „Használat” jelölők, `fence1` / `arch1` felvétele.
5. Ajtó-típus, az „Ajtó + keret” nézet, az oldalra kifordulós ajtó mozgása (render + szerkesztő + `DoorSpec.type`).
6. NPC sprite-sheet vágó (a legnagyobb: előnézet, sorok szerepe, validálás).
7. Manifest-ellenőrzés az RPG-motor felé (minden hivatkozott azonosító létezik-e).

## 6. Nyitott kérdések

- Ajtó-típusnál a keret és a lap mérete/illesztése: a keret `holeBounds` nyílásához igazodik-e a lap automatikusan?
- A feltöltött elemek megosztottsága: világonként közös (ma így van a textúráknál), vagy térképenként?
- Az NPC-nél a hangok és a sebzés-animáció időzítése hova kerül (Assets vagy RPG-adat)?
