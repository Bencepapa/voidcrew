# Void Crew – eszközök és asset-pipeline

Összefoglaló arról, hogyan kerül egy AI-val generált kép a játékba, milyen
scriptek és fejlesztői eszközök vannak, és új elemnél melyik fájlt kell
szerkeszteni.

## Gyors áttekintés

| Mit akarok | Parancs / eszköz | Mit kell még szerkeszteni |
| --- | --- | --- |
| Fal, padló, plafon, ajtó textúra | `npm run texture:process` | `TEXTURE_SETS` + `TextureSetId` a `src/components/GameViewport.tsx`-ben, a pálya `textures` blokkja |
| Ablak (1 panel) | `npm run texture:process -- --key ff00ff` | ugyanaz, mint fent; a pályán `textures.window` |
| Széles ablak (3 részes csík) | `npm run texture:window-strip` | `<név>_left/_mid/_right` a `TEXTURE_SETS`-ben |
| Ajtókeret (kivágott nyílás) | `npm run texture:process -- --key ff00ff --trim` | `TEXTURE_SETS`, a pályán `textures.doorFrame` |
| Decal (lövésnyom, felirat…) | `npm run decals:import` / `decals:text` | automatikusan bekerül a `public/decals/index.json`-ba |
| Prop (láda, ágy…) | `npm run texture:process` (oldalanként vagy nézetenként) | `PROP_TYPES` a `src/game/props.ts`-ben, a pályán `props` |
| Szereplő (robot, NPC) | `npm run actors:sheet` + `?editor=actors` | `ACTOR_TYPES` a `src/game/actors.ts`-ben, igazítás: `src/actors/<név>.json`, a pályán `actors` |
| Új pálya / szint | – | új `src/maps/<id>.json` (automatikusan betöltődik) |

## Fejlesztői szerver és URL-ek

```bash
npm run dev
```

- Játék: `http://localhost:3000/voidcrew/`
- Adott szinten indítás: `http://localhost:3000/voidcrew/?map=deck0-crew` (a `src/maps/` fájlneve kiterjesztés nélkül)
- Szereplő-szerkesztő: `http://localhost:3000/voidcrew/?editor=actors`
- Típusellenőrzés: `npm run lint`

A `public/textures/` alatti fájlok mentésekor a futó játék újratölti a
textúrákat (pl. GIMP-ben szerkesztett mélységtérkép azonnal látszik).

### Debug panel (a játék jobb oldalán, keskeny ablakban a ☰ menüben)

- Grid movement: rácsos vagy szabad mozgás
- Decals: decalok ki/be
- Textúra-készletek, faltípus (flat / convex / concave / relief), relief- és anyagcsúszkák
- **Geometry view**: `textured` / `faces only` (lapok irányuk szerint színezve) / `wireframe`

### Konzol-segédek (csak fejlesztői módban, a böngésző konzoljában)

| Parancs | Mit csinál |
| --- | --- |
| `__voidcrewTeleport(x, y, "N")` | a csapat áthelyezése egy cellába (opcionális 4. paraméter: magasság, pl. híd) |
| `__voidcrewPos()` | a csapat cellája és a pálya id-je |
| `__voidcrewActors()` | a szereplők állapota (cella, irány, járőrcél) |
| `__voidcrewTouch("lift")` | interaktív decal megérintése (pl. lift gomb) |
| `voidcrew.set({ ambientIntensity: 0.2 })` | Debug-beállítás módosítása |
| `await voidcrew.capture("név")` | képernyőkép mentése a `concept/gen/captures/` mappába |
| `__voidcrewPose` / `__voidcrewInput` | szabad mozgás pózának, bemenetének vizsgálata |

## A közös képgeneráló pipeline (ChatGPT)

Minden asset ugyanabból a 2–3 lépésből áll. Stílusreferenciának mindig
csatolj egy kész textúrát ugyanarról a szintről (pl. `public/textures/medwall1/diffuse.png`),
és ha van, a szint koncepcióképét (`concept/`).

1. **Albedo** – tiszta színkép, fény és árnyék nélkül:
   > STEP 1 - CLEAN ALBEDO. … Front orthographic view, no perspective. Albedo only: no lighting, no shadows, no ambient occlusion, no highlights. Square image.

   Kivágandó részek (ablaknyílás, ajtónyílás, szereplő háttere) legyenek
   **tiszta magenta `#FF00FF`**.
2. **Geometria (opcionális)** – ugyanaz a kép festés, kopás, matrica nélkül, egyszínű szürkével. Sokszor kihagyható.
3. **Mélységtérkép** – pixelpontosan ugyanaz a kép néhány lapos szürke szinttel:
   > STEP 3 - DEPTH / HEIGHT MAP … Preserve its EXACT geometry, layout, size and framing, pixel-aligned with it. Ignore all paint … Only a few flat grey levels: main surface mid grey, raised parts lighter, recessed seams darker. Hard edges, no lighting, no shading, no gradients, no outlines.

   A magenta részek maradjanak magentán.

A nyers képek helye: `concept/gen/<téma>/` (pl. `concept/gen/medical/`,
`concept/gen/crew/`, `concept/gen/props/`, `concept/gen/actors/`). Ezek a
forrásfájlok; a játék a `public/` alatti, feldolgozott változatot használja.

## Textúrák (fal, padló, plafon, ajtó)

```bash
npm run texture:process -- --diffuse concept/gen/crew/crew_wall_1_albedo.png --depth concept/gen/crew/crew_wall_3_depth.png --out public/textures/crewwall1
```

Kimenet: `public/textures/<név>/diffuse.png`, `depth.png`, `normal.png`
(256 px széles, pixel-art palettára kvantálva, a mélység néhány szintre
bontva). Hasznos kapcsolók (teljes lista: `npm run texture:process`):

- `--key ff00ff` – a magenta háttér átlátszó lesz (ablak, ajtókeret, decal)
- `--trim` – levágás az átlátszatlan részre (ajtókeret)
- `--emissive-panel` – világító panel maszk (plafonlámpa)
- `--flatten-paint` – a festett csíkokat ne emelje ki a relief (akkor, ha a mélységtérkép nem elég tiszta)
- `--size`, `--colors`, `--levels` – méret, palettaméret, mélységszintek

Ha a mélységtérkép el van csúszva az albedóhoz képest, előbb igazítani kell
(befoglaló téglalap alapján átméretezni), különben a relief nem illik a képre.

**Bekötés:**

1. `src/components/GameViewport.tsx`: vedd fel a nevet a `TextureSetId`
   típusba és egy bejegyzést a `TEXTURE_SETS`-be (`diffuse`, `normal`,
   `depth`, `pixelArt: true`, világító plafonnál `emissive`).
2. A pálya JSON-ban (`src/maps/<id>.json`) a `textures` blokk:
   ```json
   "textures": {
     "wall": "crewwall1", "floor": "medfloor1", "ceiling": "medceil1",
     "door": "meddoor1", "liftDoor": "medliftdoor1",
     "doorFrame": "meddoorframe1", "window": "medwindow1"
   }
   ```
   Cellánkénti eltérés: `layers.wallTexture` / `floorTexture` / `ceilingTexture` (karakterrács + legend).

**Széles ablak:** 3:1-es csík három nyílással, a két osztóval 1/3-nál és 2/3-nál:

```bash
npm run texture:window-strip -- --diffuse strip.png --depth strip_depth.png --name medwindow1
```

Ebből `medwindow1_left`, `_mid`, `_right` lesz (mindhármat fel kell venni a
`TEXTURE_SETS`-be, az egypaneles `medwindow1` mellé).

## Decalok

- AI-lapról (rácsban, magenta háttéren): `npm run decals:import -- --sheet sheet.png --grid 3x3 --names a,b,-,c --sizes 16,64,-,48` (opcionálisan `--depth`)
- Felirat a pixel-fontból: `npm run decals:text -- --text "ENGINE ROOM" --name text_engine_room`
- Lift gombok: `npm run decals:lift-buttons` (a kombinációk a `scripts/make-lift-buttons.ts` végén)

A scriptek maguk írják a `public/decals/index.json`-t. Elhelyezés a pályán:

```json
{ "decal": "text_medical", "x": 5, "y": 1, "surface": "S", "px": 60, "py": 40 }
```

`surface`: fal iránya (`N`/`E`/`S`/`W`), `floor` vagy `ceiling`; `px`/`py` a felület 256 px-es rácsában.
`"action": "lift"` a lift gombja.

## Propok (láda, ágy…)

Két fajta van, mindkettő a `src/game/props.ts` `PROP_TYPES` listájában:

**Doboz** (`kind: "box"`) – egy oldal- és egy tetőtextúra:

```ts
crate1: { kind: "box", size: [0.5, 0.4, 0.5], side: "crate1", top: "crate1_top" },
```

**Nézetekből** (`kind: "views"`) – három ortografikus nézet (elölről, a +x
vég felől, felülről), mindegyik magenta háttéren, saját mélységtérképpel:

```bash
npm run texture:process -- --diffuse medbed1_front.png --depth medbed1_front_depth.png --out public/textures/medbed1_front --key ff00ff --trim
```

(ugyanígy `_side` és `_top`). Aztán a `PROP_TYPES`-ban a méret és a dobozok,
az elölnézetből kimérve (x hossz, y magasság, z mélység, a padló közepéhez
képest):

```ts
medbed1: {
  kind: "views", views: "medbed1", size: [0.9, 0.37, 0.4], blocks: true,
  parts: [{ min: [-0.45, 0, -0.2], max: [-0.387, 0.37, 0.2] }, …],
},
```

`blocks: true` – rácsos mozgással nem lehet belépni a cellájába.
A textúra-készleteket itt is fel kell venni a `TEXTURE_SETS`-be. Pályán:

```json
"props": [{ "prop": "medbed1", "x": 2, "y": 5, "at": "S", "rotation": 90 }]
```

`at`: égtáj, sarok (`NE`…) vagy `center`; `rotation`: fok, felülről nézve óramutató szerint.

## Szereplők (robot, NPC)

1. **Spritelap generálása**: 5 oszlop (nézőszög) × sorok (póz), egyforma
   cellák, magenta háttér, a talp mindenhol azonos vonalon.
   - Oszlopok: elöl, 45° (a kép bal oldala felé fordul), bal profil, 135° hátulról balra, hátulról. A jobb oldali nézeteket a játék tükrözi.
   - Sorok (a `robot1`-nél): álló, bal láb elöl, jobb láb elöl.
   - Mellé ugyanilyen elrendezésű **mélységlap**.
   - Javítás: csak a hibás cellákat kell kicserélni ugyanarra a helyre.
2. **Feldolgozás** (a képek: `concept/gen/actors/`):
   ```bash
   npm run actors:sheet -- --diffuse concept/gen/actors/robot1_sheet_2.png --depth concept/gen/actors/robot1_sheet_2_depth.png --name robot1 --width 192 --height 256
   ```
   Cellánként megkeresi a figurát (a rácsvonalakat kihagyja), egységes
   méretre skálázza, talpra igazítja, eltünteti a magenta szegélyt, és normal
   mapet készít. Kimenet: `public/actors/<név>/diffuse.png`, `normal.png`.
3. **Igazítás a szerkesztőben** – `?editor=actors`:
   - bal oldalt a lap (kattintás vagy W/A/S/D a kockák között),
   - középen a kocka nagyítva, talp- és középvonallal, halvány „szellem” képpel (álló póz / előző / következő járásfázis); nyilak: 1 px, Shift + nyíl: 5 px,
   - jobb oldalt előnézet: járás, körbeforgatás, vagy mindkettő,
   - **Save** → `src/actors/<név>.json` (a futó játék azonnal átveszi), **Download JSON** → letöltés, **Reload sheet** → újratöltés feldolgozás után.
4. **Típus** a `src/game/actors.ts` `ACTOR_TYPES` listájában:
   ```ts
   robot1: {
     name: "A combat robot", sheet: "robot1", cols: 5, rows: 3,
     cellAspect: 0.75, height: 0.82, moveMs: 900, waitMs: 1800,
     idleRow: 0, walkRows: [1, 0, 2, 0],
   },
   ```
   `height`: falmagasságban; `walkRows`: egy lépés alatti fázisok sorrendje.
5. **Pályán**:
   ```json
   "actors": [{ "actor": "robot1", "x": 9, "y": 1, "facing": "W", "patrol": [[9, 1], [5, 1]] }]
   ```
   A járőrpontok között oda-vissza jár.

Az igazító JSON (`src/actors/<név>.json`) cellánként `[dx, dy]` eltolást tárol
a lap pixeleiben (`cell` = cellaméret). Újravágás más cellamérettel: az
eltolásokat arányosan át kell számolni; kicserélt cellák eltolását nullázni.

## Pályák (`src/maps/<id>.json`)

A fájlok automatikusan betöltődnek; `id` = fájlnév. A formátum leírása a
`src/game/mapFormat.ts` elején és a README „Maps” részében van. Fontosabb mezők:

| Mező | Jelentés |
| --- | --- |
| `deck` | szint száma (kisebb = feljebb) |
| `layout` | `W` fal, `.` padló, `D` ajtó |
| `layers.floor` / `ceiling` | cellánkénti magasság (0,25-ös lépések) |
| `textures`, `labelColor` | a szint textúrái, feliratszín |
| `lightColor`, `autoLights` | lámpaszín (`"#ffcf87"`); `false`: nincs generált hangulatfény |
| `lights` | plafonlámpák cellái |
| `doors` | lift/sima ajtó, irány, felirat (`label`, `labelVertical`) |
| `lifts` | liftfülke, gomb fala, célpálya (`to`) |
| `windows`, `ladders`, `bridges` | ablak, létra, híd |
| `props`, `actors`, `decals` | lásd fent |

Két szint összekötése liftel: mindkét pályán legyen egy `lifts` bejegyzés,
ami a másikra mutat (`"to": "deck1-medical"`), a fülke előtt egy `kind: "lift"`
ajtó, és a fülkében egy `lift_btn_<szint>_<up|down>` decal `"action": "lift"`-tel.
