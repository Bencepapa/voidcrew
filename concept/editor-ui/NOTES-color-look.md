# Színvilág (colour look / LUT) — 2026-11-25

Branch `feature/color-look`. Egy színkorrekciós utófeldolgozó pass, ami egy színvilágba tereli a textúrákat (mint egy filmes
színszűrő: hideg-misztikus, meleg-filmes...). A look a **pályával mentődik**, és átmásolható másik pályára. Alapból nincs: egy
pálya (és egy világ) look nélkül pontosan úgy néz ki és úgy renderel, mint előtte.

## Fájlok
| Fájl | Mi van benne |
| --- | --- |
| `src/render/colorGrade.ts` | Tiszta (React/three nélkül): `ColorGrade` (11 vezérlő), határok (`GRADE_LIMITS`), `IDENTITY_GRADE`, a presetek (`LOOK_PRESETS`: id + en/hu név + grade), `gradeColor` (egy szín), `buildLut(grade, size = 32, strength = 1)`, `swatchesCss` (az előtte/utána csík). |
| `src/game/look.ts` | Tiszta: `LookSpec`, `cleanLook`, `resolveLook` (pálya vagy világ-alap), `compactLook` / `withPreset` / `withGradeValue` / ... (a szerkesztő műveletei), `lookToText` / `parseLookText` (vágólap), `createLookResolver` (memo a viewportnak). |
| `src/render/colorLookShader.ts` | A GLSL: `sampler3D` keresés + `uStrength` keverés + apró zaj (dither). |
| `src/render/colorLookPass.ts` | `createColorLookPass()`: ShaderPass + a LUT textúra (újraépítés legfeljebb 100 ms-onként, az előző `dispose`), az erősség élő uniform. |
| `src/editor/inspector/LookFields.tsx` | A „Színvilág" blokk a pálya beállításaiban (Megjelenés), `MapFields.tsx` végén. |
| `src/i18n/{en,hu}/look.ts` | A feliratok (a presetek nevei a `colorGrade.ts`-ben vannak, nem az i18n-ben). |
| Tesztek | `src/render/colorGrade.test.ts`, `src/game/look.test.ts`, `src/game/lookMapFormat.test.ts` (`npx tsx <fájl>`). |

Megosztott fájlokban csak kis módosítások: `GameViewport.tsx` (a `renderPost` / `renderGeometryView` és a `post` objektum),
`mapFormat.ts` (`MapFile.look`, `look: cleanLook(...)`, `structureKey`-ből kizárva), `types.ts` (`GameMap.look`), `worlds.ts`
(`WorldDef.defaultLook`), `postSettings.ts` (`postLookOff`), `EditorBar.tsx` (`MapLook.look`), `App.tsx` (`mapLook` + `look`),
`MapFields.tsx`, `DebugPanel.tsx`, `mapEdits.ts` (`blankMap` a `like` look-ját másolja), `i18n/index.ts`, `releaseNotes.ts`,
`verification-checklist.md`.

## Adatformátum (additív)
```json
"look": { "preset": "cold-mystic", "strength": 0.8, "grade": { "contrast": 1.2, "shadowHue": 240 } }
```
- `preset`: `none` | `cold-mystic` | `warm-film` | `grey-overcast` | `vivid-tale` | `cinder`. A kiindulás; ismeretlen id elmarad.
- `grade`: a kézzel változtatott értékek (részleges), **felülírják a preset értékeit**. Kulcsok és határok:
  `temperature` −1..1 (kék..sárga), `tint` −1..1 (zöld..bíbor), `exposure` −2..2 EV, `contrast` 0,5..1,5, `saturation` 0..2,
  `shadows` / `highlights` −1..1, `shadowHue` / `highlightHue` 0..360°, `shadowAmount` / `highlightAmount` 0..1.
- `strength` 0..1 (alap 1): a look és az eredeti kép keveréke.
- `parseMap` megtisztítja (`cleanLook`): érvénytelen preset elmarad, a számok a határokba szorítva, az ismeretlen mezők kidobva; ha
  semmi nem marad, nincs look (`undefined`). A szerkesztő csak a presettől eltérő értékeket tárolja (`compactLook`); `strength: 1` nem tárolódik.
- A pálya `look`-ja **egészében** felülírja a világ `defaultLook`-ját (nincs mezőnkénti öröklés). `{ "preset": "none" }` = kifejezett
  kikapcsolás (a világ alapját is). A „A világ alapja" a listában = nincs `look` mező a fájlban.
- **Világ-alap:** `WorldDef.defaultLook?: LookSpec` a `src/game/worlds.ts`-ben; jelenleg egyik világnak sincs (a teszt ellenőrzi). Feloldás:
  `resolveLook(map.look, WORLDS[map.world].defaultLook)` → `{ grade, strength } | null` (null: nincs, 0 erősség, vagy a grade semmit nem változtat).
- **A `look` nincs a `structureKey`-ben**, ezért változtatása nem építi újra a jelenetet (a teszt ellenőrzi).
- **Másolás/beillesztés:** `lookToText` JSON-t ír: `{ "voidcrewLook": 1, "preset", "strength", "grade": <a teljes hatásos grade> }` (a teljes grade azért
  van benne, hogy később a presetek változása se változtassa a jelentését). `parseLookText` elfogad még puszta look-objektumot és egy
  pálya `{ "look": ... }` részletét; minden mást elutasít (üres / nem JSON / nem look), és ilyenkor semmi nem változik.

## A render pipeline sorrendje
`RenderPass` → `OutputPass` (tone mapping + sRGB) → **LUT pass (színvilág)** → `DarkFantasy` pass → képernyő.
- A LUT display-referred (sRGB) értékeken dolgozik, ezért az OutputPass UTÁN fut; a DarkFantasy előtt, így a kettő együtt használható.
- A composer akkor jön létre és fut, ha `postDark || look aktív` (a look aktív: van feloldott look, és nincs bekapcsolva a `postLookOff`). A pass-ok `enabled`
  jelzője dönt, melyik fut; az utolsó engedélyezett megy a képernyőre (az `EffectComposer` kezeli). Ha egyik sem aktív, a régi, közvetlen
  `renderer.render` út változatlan (nincs extra render célpont, nincs teljesítménycsökkenés). Csak a „textúrázott" nézetben.
- A LUT 32³-os, **félfloat RGBA `Data3DTexture`** (`LinearFilter`, `ClampToEdge`; WebGL 2-ben szűrhető kiterjesztés nélkül, és nincs 8 bites lépcső a táblában).
  A shader a félszövegel-korrekciót használja: `uvw = rgb * (size-1)/size + 0.5/size`. A `ShaderMaterial` WebGL 2-ben GLSL ES 3.00-ként fordul
  (a three beteszi a `sampler3D` precíziót), ezért a `texture(tLut, uvw)` működik külön `glslVersion` nélkül.
- Grade-változásnál a LUT újraépül (a CPU-n, 32 768 elem, pár ms), legfeljebb 100 ms-onként (húzás közben is követi), az előző textúra `dispose`-olódik;
  az erősség élő uniform, LUT-újraépítés nélkül. A `post` objektummal együtt szűnik meg (`dispose`).
- **Sávosodás:** a composer félfloat célpontot használ, így a közbenső lépésekben nincs 8 bites sáv; a végső vászon 8 bites, ezért a shader
  kb. egy 8 bites lépésnyi (±0,5/255) interleaved-gradient zajt ad a végére (`uDither`). Ez szándékos, látszódnia nem szabad.

## Mit számol a grade
Sorrend: fehéregyensúly (hőmérséklet, árnyalat) és expozíció lineáris fényben (a fehéregyensúly megtartja a fényerőt) → kontraszt (közép-szürke körül) →
árnyék/fény eltolás → split toning (az árnyék-/fényszín színezete a fényerő szerint súlyozva) → telítettség. Minden lépés kimarad, ha a vezérlője nyugalmi
helyzetben van, így az identitás grade **pontosan** az eredetit adja (a teszt ellenőrzi). Az értékek mindig [0,1]-ben maradnak.
Presetek: `cold-mystic`, `warm-film` (teal/orange), `grey-overcast`, `vivid-tale`, `cinder` (pernye), `none` (identitás). A pontos számok a `colorGrade.ts`-ben;
a hangolásuk a szem dolga (a kollégával), a határokon belül maradnak.

## Szerkesztő UI
Pályabeállítások → Megjelenés → „Színvilág" blokk: lista (A világ alapja / Semleges / a presetek), erősség-csúszka, előtte/utána színcsík (8 tipikus szín a grade-del és anélkül),
„Haladó" (a 11 csúszka három csoportban, dupla kattintás a címkén = a preset értéke), „Visszaállítás" (a kézi változtatások törlése), „Look másolása" / „Look beillesztése" (a vágólap;
ha a böngésző nem engedi, `window.prompt` kéri a szöveget), és a „Színvilág ki (csak megjelenítés)" jelölő. Ugyanezt a kapcsolót (`postLookOff` a `ViewportSettings`-ben) kapcsolja a
Debug panel „Színvilág" szakaszának „Színvilág kikapcsolása" jelölője. A kapcsoló nem mentődik a pályával.

## A „sötét fantasy" pass-szal való viszony (javaslat; a döntést NEM hajtottam végre)
A DarkFantasy (`NOTES-dark-fantasy-post.md`) változatlan, a két pass független és együtt használható (a LUT fut előbb).

**Mit fed le a grade a DarkFantasy-ból:**
- *Telítettség*: a grade `saturation` globálisan (a DarkFantasy `uSaturation` csak a „kulcs" színeken, a többit a kékesszürke felé halványítja).
- *Kontraszt*: a grade `contrast` (a DarkFantasy fix `pow(color, 1.12)`-je egy gamma-szerű kontraszt).
- *Árnyékok színezése*: a `shadowHue` + `shadowAmount` (a DarkFantasy semleges kékesszürke árnyéka a „többi szín" halványítása).
- *Hangulati meleg/hideg hajlam*: `temperature` / `tint` / `highlightHue` (a DarkFantasy meleg/hideg szabályai ezt csak hue-ra szűrve teszik).

**Ami csak a DarkFantasy-nál marad:**
- A *hue-szabályok* (tűz/mélykék/megtartott zöld/tartalék): hue-ra szűrt, térben szelektív átszínezés; egy LUT ezt is tudná (a 3D tábla tetszőleges színleképezés), de a UI-ja
  (szabály-szerkesztő, maszk-nézet) a DarkFantasy sajátja.
- Az *árnyék-összenyomás védelemmel* (a perceptuális érték, a megtartott színek részletvédelme): nem egyszerű per-szín leképezés a grade-ben.
- A *vignetta*: térbeli (a kép szélétől függ), nem színleképezés, tehát LUT-ba nem fér.

**Javaslat, mi vihető át később a grade-be, és mi maradjon kísérlet:**
- Átvihető, ha a kolléga igényli: a *vignetta* egy önálló, kicsi `vignette` (0..1) mező a `LookSpec`-ben a LUT shaderben (egy sor GLSL, a LUT-ot nem érinti); az *árnyék-összenyomás* egyszerű
  formája (a `shadows` negatív értéke és egy „black point" vezérlő a grade-ben) — védelem nélkül, a LUT-ban. Ezekkel a legtöbb „sötét" hangulat a look-ból, UI-ban is elérhető volna.
- Kísérlet maradjon: a hue-szabályok és a védett árnyék-összenyomás (a DarkFantasy), amíg nem látszik, hogy a hangulatok kellenek-e ennyire szelektíven; ha igen, egy „hue-szabály" lista külön
  LUT-réteg lehetne a mentett look-ban. A DarkFantasy beállításai továbbra sem mentődnek a pályába.

## Korlátok és szándékos rövidítések
- **Nincs .cube / PNG LUT-fájl import**, nincs feltöltés az Asset managerbe, nincs közös look-könyvtár a megosztott tárban: a look a pályában él és vágólapon másolható.
- A világ `defaultLook` mezője kész és tesztelt, de nincs szerkesztő UI hozzá, és egyik világnak sincs értéke (a `worlds.ts`-ben kézzel adható meg).
- A szerkesztő „ki" kapcsolója a Pályabeállításokban (Megjelenés) van, nem az eszköztáron; a Debug panel mellett is megvan, és mindkettő ugyanazt kapcsolja.
- A vágólap-gombok a böngésző vágólap-API-ját használják (`navigator.clipboard`); elutasításkor `window.prompt` a tartalék.
- A pálya betöltésekor az átmeneti (fade) fekete lap a vászon fölötti DOM-elem, a look nem érinti.
- Csak a „textúrázott" nézetben fut (a debug nézetekben — lapok, drótváz, normálok, mélység — nincs look), mint a DarkFantasy.

## Kockázatok
- **Sávosodás / zaj:** a vászon 8 bites; a LUT félfloat és a dither enyhíti, de erős kontraszt/telítettség-változtatás sima égbolt-átmeneteken így is lehet lépcsős. Ha mégis zavaró, a dither
  amplitúdója (`uDither`) emelhető. Az apró zaj mozgó kamerán nem villog (képernyő-koordinátához kötött), de állóképen mintázat lehet — nincs mérve.
- **Teljesítmény:** look mellett a jelenet egy félfloat célpontba (MSAA, ha be van kapcsolva) rajzol + két extra képernyőméretű pass (output, LUT): gyenge GPU-n/mobilon mérendő.
  Look nélkül a régi út fut. A LUT-építés CPU-költsége elhanyagolható, de nagyon gyors csúszkahúzásnál 100 ms-onként újra fut.
- **Nincs mérve futó játékban:** a mobil / kis felbontás, a `lodScale`/`pixelRatioCap` kölcsönhatás és hogy a vászon sRGB-kezelése minden böngészőben azonos-e.
- **A presetek hangolatlanok:** a számokat szemre választottam egyetlen tesztpályán (tesztsztori); a kolléga szerint kell finomítani.
- **A `HalfFloatType` 3D textúra** WebGL 2-t feltételez (a játék amúgy is azt használja); WebGL 1 tartalék nincs.
- A böngészőben a szerkesztői útvonalat próbáltam ki (hangulat-választás, egy haladó csúszka húzása, ki/be, a DarkFantasy együtt), és a játék módban is látszott a look. Nem próbáltam: a vágólap-gombokat, az erősség-csúszka húzását, mentés + újratöltést, mobil nézetet.
