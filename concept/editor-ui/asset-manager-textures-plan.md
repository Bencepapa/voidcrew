# Új textúra az Asset Managerben (terv, v2)

Döntések (2026-11-17): a név **Assets** (hu: „Assetek”; az „Asset Manager” név a kódban és a beszédben marad); a beépített
textúrák **csak olvashatók**, nem törölhetők, a használat-jelölőik nem szerkeszthetők; a normal és depth generálása
a `C:\dev\js\normalMap` mag portolásával megy; **minden autogenerált csatorna jelölve van**; a wall1–wall3 textúrák
kikerültek (kész), a `floor2` marad.

Cél: a megosztott textúra feltöltése kikerül a „Megosztott pályák” ablakból. Az Asset Managerben egy `+` gombbal új
textúrát lehet létrehozni, a térképeit (diffuse, normal, depth, ...) egyenként feltölteni vagy generáltatni, megadni, hogy
fal, padló és/vagy plafon lehet-e, és a megosztott tárba mentés itt, látható jelzéssel történik.

## 0. Ma (a kódból)

- `src/editor/SharedEditor.tsx`: bejelentkezés után egy PNG tölthető fel a Supabase `void-textures/<világ>/<uuid>-<név>.png`
  helyre. Betöltéskor mindegyik `kind: ["floor","wall"]`, `pixelArt: true`, a címke a fájlnévből jön, a normal és depth a
  semleges lapos `textures/flat/` pár (a régi `wall2` pótlékát ez váltotta). Se plafon, se saját normal/depth, se átnevezés.
- `src/editor/AssetManager.tsx` + `materialMaps.ts`: már tud képet importálni egy anyag csatornáihoz (helyi piszkozat,
  IndexedDB), előnézet a próbaszobában. Az `ASSET-MANAGER.md` már leír piszkozatot + Közzététel gombot és
  fal/padló/plafon címkéket: ezt valósítjuk meg textúrákra.
- Normal a depth-ből: csak offline (`scripts/normalMap.ts`, a fejlesztői szerver texture-watchere). Normal a diffuse-ból:
  csak a matricáknál, futásidőben. **Depth a diffuse-ból: nincs** (csak konstans lapos depth sprite-vágáskor).
- Textúra-hangolás (`textureTuning.json`): helyi fejlesztői fájl, a megosztott textúrákat nem érinti.

## 1. Név és hely

- Név: **Assets** / **Assetek** (a fával egyező szó). A gomb **kis ikon az asset-fa fölött** (nem szöveges gomb a felső
  sávban); felirat/tooltip: „Asset Manager” / „Asset menedzser”.
- A felső sáv később megszűnik, csak pár lebegő ikon marad. Az ajtó/híd/létra egy közös eszköztárba kerül (külön terv).
  Ez a terv ezekhez nem nyúl.

## 2. Új textúra folyamata

1. A könyvtár fejlécében `+ Új textúra`. Létrehoz egy **üres** piszkozat-textúrát (helyi, IndexedDB), kijelöli, a neve
   szerkeszthető mező (alapérték: „Új textúra”).
2. Csatorna-sorok: **Diffuse** (kötelező), **Normal**, **Depth**, **Roughness/Gloss**, **Metalness**, **Emissive**.
   Minden sorban: bélyegkép, `Fájl kiválasztása` / húzás, mód (lásd 4.), `Eltávolítás`.
3. **Használat** jelölőnégyzetek: ☐ Fal ☐ Padló ☐ Plafon (legalább egy). Új textúrán alapból mind a három be, mert a
   legtöbb fal padlóra és plafonra is jó.
4. **Pixel art** kapcsoló (kikapcsolva szűrt), a világ (fantasy / sci-fi).
5. Minden módosítás azonnal látszik a próbaszobában.

## 3. Tárolás a megosztott tárban

A mai lapos fájlok (`<világ>/<uuid>-név.png`) **olvashatók maradnak** (régi azonosítók, lapos normal/depth, fal+padló).
Új textúra mappát kap:

```
void-textures/<világ>/<uuid>/
  meta.json   { "name", "kinds": ["wall","floor","ceiling"], "pixelArt", "rev",
                "maps": { "diffuse": "uploaded", "normal": "auto", "depth": "auto", "gloss": "none" },
                "gen":  { "depth": {...recept...}, "normal": {...} } }
  diffuse.png  normal.png  depth.png  surface.png  emissive.png    (csak a feltöltöttek)
```

- Nincs új Postgres-tábla az első változathoz; a `meta.json` a forrás (az `ASSET-MANAGER.md` Postgres-terve később rá
  fordítható). `rev` minden közzététellel nő.
- Betöltés (`textures()` a SharedEditor.tsx-ben): mappák listázása, `meta.json` olvasása, `TEXTURE_SETS` bejegyzés a valós
  `kind` tömbbel; az `auto` csatornát a kliens generálja (4.), a `none` lapos/semleges.
- Közzététel sorrendje: térképek feltöltése → ellenőrzés (PNG, ≤ 8 MB) → **utoljára** a `meta.json`; amíg nincs
  `meta.json`, a mappa nem látszik a palettán.
- Átnevezés, használat-jelölők = új `meta.json` (a képek érintetlenek). Archiválás: `"archived": true` kiveszi a palettáról,
  a már használó térképek tovább működnek.
- Ütközés: ha a `meta.json` `rev` értéke közben nőtt, a közzététel megáll és kérdez (mint a térképmentés 409-je).
- **Beépített textúrák:** csak olvashatók (kód/git a forrás), a szerkesztőben zárolt jelzéssel, nem törölhetők, a
  használat-jelölőik nem szerkeszthetők és nincs rajtuk Közzététel.

## 4. Csatornák: Auto / Feltöltött / Nincs

Minden csatorna soronként három módban:

- **Feltöltött:** a felhasználó saját képe.
- **Auto:** a kliens generálja a diffuse-ból. **Jelölés (mindenütt, ahol a csatorna látszik):** `AUTO` címke a soron és a
  bélyegképen, halvány kerettel; a textúra összegzésében is ott van, ha bármelyik csatornája generált; az előnézetben is.
  A recept a `meta.json`-ban (`gen`), így reprodukálható; „Felülírás sajátjával” gombbal bármikor feltölthető saját.
- **Nincs:** a csatorna nem kell (tárgyak, papírok, lapos dolgok): nem generálódik, a motor lapos/semleges értéket vesz.

Új textúrán az alapérték: **Auto** depth és normal. A generált csatorna **nem kerül a tárba**, csak a recept (kisebb tár,
a generátor később javulhat); ha a felhasználó azt akarja, hogy a kép pontosan megmaradjon, **„Befagyasztás”** feltölti
a generált csatornát Feltöltöttként.

### Generátor: a `normalMap` mag portolása

`C:\dev\js\normalMap\src\core.js` (404 sor, függőségmentes). Lépések: luma → Kuwahara olajszűrő (több kör) →
Gauss-elmosás → szintek (auto/fekete/fehér/gamma/invert) → elő-elmosás → Sobel → normal (OpenGL Y+, *Flip Y* kapcsoló;
az erősség felbontásfüggetlen). A depth a közbülső eredmény (a diffuse fényességéből), ez ma a motorból hiányzik.

- Beépítés: verziózott modul a buildbe (`src/render/depthNormal.ts`), Web Workerben, kis felbontású élő előnézettel,
  jóváhagyáskor teljes felbontás (a normalMap UI is így dolgozik: ≤ 640 px előnézet).
- **Haladó panel** a csatorna-soron: oilRadius/passes, elmosás, szintek, erősség, Flip Y (ugyanazok a csúszkák, mint a
  normalMap UI-ban) + „Alaphelyzet”. Az automata alapbeállítás elég a legtöbb textúrához.
- Az offline `scripts/normalMap.ts` (dev szerver watcher) marad; később ugyanarra a magra állítható.

## 5. Mentetlen módosítások és Közzététel

- Az Assets ablak fejlécében és az érintett textúra sorában **sárga keret** és pont, ha a helyi piszkozat eltér a megosztott
  állapottól. Sárga sáv: *„Mentetlen módosítások a megosztott könyvtárhoz: 1 új textúra, 2 változott”*
  + **[Közzététel]** és **[Elvetés]**.
- Bejelentkezés nélkül a Közzététel **megnyitja a bejelentkezés ablakot**, siker után folytatja
  (a belépés külön modulba kerül: `sharedAuth.ts`: token, `request`, belépő űrlap).
- Piszkozat bejelentkezés nélkül is szerkeszthető; csak a Közzététel kér belépést.
- Az ablak bezárásakor a meglévő „maradt helyi piszkozat” figyelmeztetés a sárga sávval egyezik.

## 6. A „Megosztott pályák” ablak

A „Megosztott textúra (PNG)” blokk (mező, súgó, gomb) kikerül, helyette egy sor: *„Textúra feltöltése: az Assetekben”*
(link, megnyitja az Asset Managert). A „Lista és textúrák frissítése” gomb marad.

## 7. Építési sorrend

| # | Lépés | Méret | Ki |
| --- | --- | --- | --- |
| 1 | Átnevezés „Assets”-re (en+hu), a gomb kis ikon az asset-fa fölé | kicsi | OpenCode free |
| 2 | `sharedAuth.ts` kiemelése a `SharedEditor.tsx`-ből, viselkedés változatlan | kicsi–közepes | OpenCode free |
| 3 | `depthNormal.ts` + Worker: a `normalMap` mag portolása, tesztek (egy kép → depth + normal), élő előnézet | közepes | Claude |
| 4 | `+ Új textúra`, üres piszkozat, csatorna-sorok (Feltöltött/Auto/Nincs, `AUTO` jelölés, Haladó panel), név, Fal/Padló/Plafon jelölők | nagy | Claude |
| 5 | Tár: mappa + `meta.json`, régi lapos fájlok kompatibilitása, betöltő, beépítettek csak olvashatók | közepes | Claude |
| 6 | Sárga „mentetlen” sáv + Közzététel belépéssel + Elvetés + ütközéskezelés | közepes | Claude |
| 7 | A „Megosztott textúra” blokk eltávolítása a pályák ablakából + hivatkozás | kicsi | OpenCode free |

A 3–6 egymás után, egy ágon (ugyanazt az `AssetManager.tsx`-et érintik).

## 8. Nyitott kérdések

1. Az `AUTO` címke szövege: „AUTO” / „Auto” / „generált”? (Javaslat: **AUTO**, hu-ban is.)
2. A „Befagyasztás” (a generált csatorna feltöltése Feltöltöttként) kell az első változatba, vagy később?
3. A régi lapos megosztott textúrák (fal+padló) átalakíthatók-e mappás formára egy gombbal (plafon jelölő hozzáadásához)?
