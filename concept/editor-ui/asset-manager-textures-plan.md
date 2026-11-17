# Új textúra az Asset Managerben (terv)

Cél: a megosztott textúra feltöltése kikerül a „Megosztott pályák” ablakból. Az Asset Managerben (új nevet kap, lásd 1.)
egy `+` gombbal új textúrát lehet létrehozni, a térképeit (diffuse, normal, depth, ...) egyenként feltölteni, megadni, hogy fal,
padló és/vagy plafon lehet-e, és a megosztott tárba mentés itt, látható jelzéssel történik.

## Ma (a kódból)

- `src/editor/SharedEditor.tsx`: bejelentkezés után egy PNG feltölthető a Supabase `void-textures/<világ>/<uuid>-<név>.png`
  helyre. Betöltéskor mindegyik `kind: ["floor","wall"]`, a normal és depth a `wall2`-é (kölcsönzött), `pixelArt: true`,
  a címke a fájlnévből jön. Se plafon, se saját normal/depth, se átnevezés.
- `src/editor/AssetManager.tsx` + `materialMaps.ts`: már tud képet importálni egy anyag csatornáihoz (helyi piszkozat,
  IndexedDB), előnézet a próbaszobában. A tervezet (`ASSET-MANAGER.md`, „Egy munkamenet”, „Tartalom és mentés”) már leír
  piszkozatot + Közzététel gombot és fal/padló/plafon címkéket: ezt valósítjuk meg textúrákra.
- Textúra-hangolás (`textureTuning.json`): csak helyi fejlesztői fájl, a megosztott textúrákat nem érinti.

## 1. Új név az Asset Managernek

Javaslat: **Műhely** (angolul *Workshop*): textúrát, NPC-t, propot, matricát készítesz és szerkesztesz benne, nem csak
„kezelsz” valamit. Alternatívák: *Könyvtár / Library* (inkább böngészés), *Asset-stúdió / Asset Studio* (jó, de idegen).
Csak a kiírt szöveg változik (`assetManager.title`, a gomb és a bezárás címkéje en+hu), a kódnevek maradnak.

## 2. Új textúra folyamata

1. A bal könyvtár fejlécében `+ Új textúra` gomb. Létrehoz egy **üres** piszkozat-textúrát (helyi, IndexedDB, mint az import),
   azonnal kijelöli, a neve szerkeszthető mező (alapérték: „Új textúra”).
2. Az üres textúrának csatorna-sorai vannak: **Diffuse** (kötelező), **Normal**, **Depth**, **Roughness/Gloss**,
   **Metalness**, **Emissive**. Mindegyik soron `Fájl kiválasztása` / húzás, bélyegkép, `Eltávolítás`. A hiányzó
   normal/depth/stb. **generálható** a diffuse-ból (a már meglévő előnézeti generátor: lapos depth, Sobel-normal), és a sor
   jelzi: *feltöltött* vagy *generált*. A generált csatorna csak akkor kerül feltöltésre, ha a kapcsoló rajta van.
3. **Használat** jelölőnégyzetek: ☐ Fal ☐ Padló ☐ Plafon (legalább egy kötelező; új textúrán alapból mind a három be,
   mert a legtöbb fal padlóra és plafonra is jó). A meglévő beépített textúrákra ugyanezek a jelölők megjelennek, az
   alapértékük a mai `kind` mezőjük (a `TextureSetPaths.kind` tömb), így a tárolt adat nem változik, csak szerkeszthetővé válik.
4. Egyéb tulajdonságok: *pixel art* kapcsoló (kikapcsolva szűrt), a `world` (fantasy / sci-fi), `normal erősség` marad az
   Asset Manager már meglévő csúszkáin.
5. A szobában azonnal látszik, minden módosítás frissít (a meglévő próbaszoba).

## 3. Tárolás a megosztott tárban

A mai lapos fájlok (`<világ>/<uuid>-név.png`) **olvashatók maradnak** (régi azonosítók, normal/depth a wall2-ből, fal+padló).
Új textúra mappát kap:

```
void-textures/<világ>/<uuid>/
  meta.json        { "name": "...", "kinds": ["wall","floor","ceiling"], "pixelArt": true, "rev": 3, "maps": ["diffuse","normal","depth"] }
  diffuse.png  normal.png  depth.png  surface.png  emissive.png
```

- `meta.json` a *forrása* a névnek és a használatnak, így nincs szükség új Postgres-táblára az első változathoz (az
  `ASSET-MANAGER.md` Postgres-tervezete későbbi lépés marad; a `meta.json` ráfordítható). `rev` minden közzététellel nő.
- A `textures()` betöltő (SharedEditor.tsx) kibővül: listázza a mappákat, beolvassa a `meta.json`-t, és a
  `TEXTURE_SETS`-be a valós `kind` tömbbel, a saját normal/depth útvonallal regisztrálja (ha hiányzik a térkép: a mai
  wall2-fallback).
- Közzététel sorrendje: térképek feltöltése → ellenőrzés (méret, PNG, 8 MB) → **utoljára** a `meta.json`; amíg nincs
  `meta.json`, a mappa nem jelenik meg a palettán (megszakadt feltöltés nem hagy fél textúrát).
- Név változtatása, használat jelölők módosítása = új `meta.json` (a képek érintetlenek). Törlés/archiválás: a `meta.json`
  `"archived": true` mezője kiveszi a palettáról; a már használó térképek tovább működnek.
- Ütközés: ha a `meta.json` `rev` értéke közben nőtt, a közzététel megáll és kérdez (mint a térképmentés 409-je).

## 4. Mentetlen módosítások jelzése és Közzététel

- A Műhely fejlécében és az érintett textúra sorában **sárga keret** és pont, ha helyi piszkozat eltér a megosztott
  állapottól. A szerkesztő felületén sárga sáv: *„Mentetlen módosítások a megosztott könyvtárhoz: 1 új textúra, 2 változott”*
  + **[Közzététel]** gomb (mellette **[Elvetés]**).
- A Közzététel, ha nincs bejelentkezve, **megnyitja a bejelentkezés ablakot**, siker után folytatja a közzétételt
  (a bejelentkezést külön modulba kell emelni a `SharedEditor.tsx`-ből: `sharedAuth.ts`: token, `request`, belépés).
- Kilépéskor a Műhelyből a meglévő „maradt helyi piszkozat” figyelmeztetés marad, a sárga sávval egyezően.
- Csak a bejelentkezett szerkesztő publikálhat; a nem bejelentkezett felhasználó is szerkeszthet piszkozatot
  (a `+` és a feltöltés helyi, a Közzététel kér belépést).

## 5. A „Megosztott pályák” ablak

A „Megosztott textúra (PNG)” blokk (mező, súgó, gomb) **kikerül**, helyette egy sor: *„Textúra feltöltése: a Műhelyben”*
(link, ami megnyitja). A „Lista és textúrák frissítése” gomb marad (a textúralista frissítése változatlanul szükséges
más szerkesztők munkájához); a szövege „Lista és textúrák frissítése” maradhat.

## 6. Lépések (építési sorrend)

| # | Lépés | Méret | Ki |
| --- | --- | --- | --- |
| 1 | Átnevezés (en+hu szövegek) | kicsi | OpenCode free |
| 2 | `sharedAuth.ts` kiemelése (token, `request`, belépő űrlap) a `SharedEditor.tsx`-ből, viselkedés változatlan | kicsi–közepes | OpenCode free |
| 3 | `+ Új textúra`, üres piszkozat, csatorna-sorok (feltöltés, generálás), név, Fal/Padló/Plafon jelölők, a beépítettekre is | nagy | Claude |
| 4 | Tár: mappa + `meta.json` írás/olvasás, régi lapos fájlok kompatibilitása, `textures()` betöltő | közepes | Claude |
| 5 | Sárga „mentetlen” sáv + Közzététel belépéssel + Elvetés, ütközéskezelés | közepes | Claude |
| 6 | A „Megosztott textúra” blokk eltávolítása a pályák ablakából + hivatkozás | kicsi | OpenCode free |

A 3–5 egy ágon, egymás után (ugyanazt az `AssetManager.tsx`-et érintik).

## 7. Nyitott kérdések

1. Név: **Műhely / Workshop** jó, vagy más?
2. A generált (nem feltöltött) normal/depth feltöltődjön a tárba, vagy mindig a kliens generálja le betöltéskor?
   (Javaslat: csak a feltöltött csatornák kerülnek fel; a hiányzót a kliens generálja. Így kisebb a tár és a generátor javulhat.)
3. Beépített textúrák (wall1, wall2, ...) használat-jelölői: **a kódban kell maradniuk** (git), vagy a megosztott tárba is
   kerülhetnek felülírásként? (Javaslat: csak a megosztott textúrákra szerkeszthető; a beépítetteknél csak olvasható, mert
   a git-es fájl a forrás.)
