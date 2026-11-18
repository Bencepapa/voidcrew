# Dark fantasy post-process (kísérlet, 2026-11-18)

Branch `feature/dark-fantasy-post`. Opcionális, alapból KI: Debug panel > „Sötét fantasy hangulat (kísérlet)".

## Mi ez
Egy színes utófeldolgozó pass (`src/render/darkFantasyShader.ts`, a felhasználó által beillesztett GLSL portja): összenyomott árnyékok
(perceptuális fényértékkel, hogy a kék részletei megmaradjanak), négy adatvezérelt hue-szabály (meleg/tűz, hideg/mélykék, megtartott
zöld/türkiz, egy tartalék hely), a nem illeszkedő színek halványítása a kékesszürke semleges felé, kiemelt telítettség, kontraszt,
vignetta. A szabályok a Debug panelből állíthatók, és van egy szabály-maszk debug nézet is.

### 2026-11-19: szabályok, árnyék-összenyomás, maszk
- Az árnyék-összenyomás már nem a nyers luminanciát használja: `max(lumOf, 0.6 * max(r,g,b))`. A meleg mellett a hideg és a
  megtartott szabályok is védelmet kapnak (a régi `warm * 0.8` helyett minden Keep/Shift találat véd).
- A három beégetett család (meleg 0-55°, hideg 205-263°, zöld 104-163°) helyett 4 szabály van (`postRules`): `on`, forrás hue
  közép + fél-szélesség (lágy széllel), legkisebb telítettség, mód (`keep` / `shift` célárnyalat + sat/value szorzó / `fade` a
  semleges felé). Alapból: meleg 22,5° ±22,5° (0-45°, tűzszín; a sárgászöld NEM esik bele), hideg 240° ±35° (205-275°, mélykék),
  zöld/türkiz 140° ±50° (90-190°, megtartás), a 4. hely kikapcsolva. A szabályokon kívüli színek `postOthers` módja: `fade` 0,5.
- A Debug panel szabályonként: be/ki, forrás-szín választó (a hue-t származtatja), szélesség, legkisebb telítettség, mód,
  célszín, sat/value szorzó. A hat globális csúszka megmaradt, új a „Maszk megjelenítése" (Ki / Szabályok: 1 piros, 2 kék,
  3 zöld, 4 sárga, egyéb szürke) és a „Vissza az alapértékekre" gomb (a kapcsolót bekapcsolva hagyja).
- A beállítások továbbra is a `ViewportSettings`-ben élnek (`postRules`, `postOthers`, `postMask`), a post-process alapból KI,
  és csak a textúrázott nézetben fut.

## Bekötés
`GameViewport.tsx`: `renderPost()` — `EffectComposer` (félfloat célpont, MSAA ha az élsimítás be van kapcsolva) → `RenderPass` →
`OutputPass` (tone mapping + sRGB) → `ShaderPass` (a színes pass LEGUTOLJÁRA, a képernyőre; a shader display-referred bemenetet vár).
Csak a „textúrázott" nézetben fut (`geometryView === "textured"` és `postDark`); a többi debug-nézet (lapok, drótváz, normálok,
mélység) a normál úton renderel. A beállítások (`postDark`, `postDarkness`, `postWarm`, `postCold`, `postSaturation`, `postPalette`,
`postVignette`, `postRules`, `postOthers`, `postMask`) a `ViewportSettings`-ben élnek (a típusok/alapértékek a
`src/render/postSettings.ts`-ben), futás közben a Debug panelből állíthatók; nem mentődnek a térképbe. A `postMask` csak debug nézet:
a szabályok találatait lapos színekkel festi (1 piros, 2 kék, 3 zöld, 4 sárga, egyéb szürke).

## Tapasztalat
- Egy hiba: a three `ShaderMaterial` előtagja már definiál `luminance`-t, ezért a shader függvényét `lumOf`-ra kellett nevezni.
- A dungeon-on (meleg fáklyafény, vörösesbarna kő) az alapértékekkel (`uDarkness 0.7`, `uWarmBoost 1.8`, `uPalette 0.9`) erősen vörös/fekete a kép:
  a kő színe is a „meleg" családba esik, így tűzszínt kap. A hidegkék akkor látszik, ha van kékes felület/fény. Hangolandó: `uPalette` (kisebb = több
  eredeti szín), `uWarmBoost`, `uDarkness`.
- A kép szerint a legtöbbet a **fények módosítása** adna (kisebb ambient, hideg kék ambient, szűkebb fáklya-hatósugár), a shader csak erősít.
- A szabályokkal a kőzet melegje továbbra is tűzszínt kap (a meleg szabály szándékosan 0-45°); a sárgászöld viszont már nem esik a
  melegbe, hanem a „Többi szín" `fade` módja halványítja. A hidegkék (pl. a boltív) a perceptuális árnyék-összenyomás és a hideg
  szabály védelme miatt látható marad.
- Nincs mérve: a teljesítmény (extra render célpont + MSAA + 8 vec4 uniform), a mobil/kis felbontás, és az átlátszó/mélységi nézetek.
- Nem ellenőrizve: külön magenta / sárgászöld próbakép (a betöltött dungeonban nincs ilyen nagy felület), a Keep szabály valódi
  zöld/türkiz tárgyon, a `sat`/`value` szorzók szélső értékei, és hogy a beállítások térkép-mentése nem viszi-e magával a
  szabályokat (a render-look mentés a `DEFAULT_SETTINGS`-hez hasonlít).
- Nincs megoldva: a `snapshot`/`bench` fejlesztői segédek a composer méretét nem állítják (csak fejlesztői használat).

## Ellenőrzés (2026-11-19)
- `npx tsc --noEmit` tiszta.
- Ideiglenes Vite config a 5200-as porton; a Debug panel „Sötét fantasy hangulat" szekciójában bekapcsolva a shader lefordult
  (nincs shader compile hiba a konzolon), a maszk nézet a meleg felületeket pirosra, a hideg boltívet kékre, a nem illeszkedő
  részeket szürkére festette; a „Vissza az alapértékekre" gomb visszaállította a csúszkákat/szabályokat. Kép: a sötétkék
  boltív a bekapcsolt utófeldolgozással is látható maradt.
- A `luminance` név nem ütközik: a shader továbbra is `lumOf`.

## Ötletek (nincs megépítve)
Szemantikus színmaszk (útvonal, kapcsolók, szereplők külön targetből), szelektív bloom (fáklyák, mágikus tárgyak), színkvantálás
(festményszerű lépcsőzés). Fények: hideg mélykék ambient, szűkebb fáklya-sugár a világ szintjén (a fantasy világ beállításaiban).
