# Codex handover: voidcrew (2026-11-18)

Ezt a fájlt olvasd el először. A felhasználó magyarul ír (néha angolul), a válaszok magyarul, tömören. Cél: a következő feature-ök
megépítése a szerkesztőben és a motorban, a felhasználó utasítására, kis, ellenőrizhető lépésekben.

## 1. A projekt

React 19 + three.js + TypeScript + Vite, első személyű rács-alapú RPG-motor két világgal (sci-fi „Void Crew”, fantasy „Void Fantasy”)
és egy beépített térkép-szerkesztővel. Repo: `C:\dev\js\voidcrew` (Windows; ugyanaz, mint `C:\dev\js\VoidCrew`), GitHub: `Bencepapa/voidcrew`,
ág: `main`. Vite `base` = `/voidcrew/`. A felhasználó saját dev szervere a **3000**-es porton fut a `main` mappából: ne indíts ott,
használj saját portot (pl. 5000+) ideiglenes vite configgal (saját `cacheDir`), amit utána töröld.

Fő helyek: `src/App.tsx` (szerkesztő állapot), `src/components/GameViewport.tsx` (óriási: render, picking, szerkesztő-egér),
`src/editor/*` (Inspector, AssetTree, AssetManager, FloatToolbar, MapDialog, ...), `src/game/*` (adat: térkép, propok, aktorok, tárgyak),
`src/render/*` (relief, textúrák, fények), `src/i18n/{en,hu}/*.ts` (minden felületi szöveg mindkét nyelven), `concept/**` (tervek, jegyzetek).

## 2. Munkamódszer és tilalmak

- **Push csak a felhasználó kifejezett kérésére.** Commit és merge helyben mehet. A commit üzenet végére: `Co-Authored-By: <a te modelled> <noreply@...>` (a korábbiak Claude Sonnet 5.5-tel mentek; használd a sajátodat).
- Új munkához **külön git worktree** a `main`-ről: `git worktree add ..\voidcrew-<név> -b feature/<név> main`, majd a `node_modules` junction:
  `cmd /c "mklink /J node_modules ..\VoidCrew\node_modules"` (PowerShellben `& "$env:SystemRoot\System32\cmd.exe" /c "..."`). Kész munka után a `main`-be merge (a felhasználó kéri, vagy megerősíti).
- **`npx tsc --noEmit` tiszta legyen** minden commit előtt. Nincs általános tesztkészlet; a tiszta függvényekre van pár `npx tsx *.test.ts`.
- **Ne commitold:** `concept/editor-ui/out/*`, `concept/editor-ui/unify-kind-selectors-brief.md`, `concept/fantasy/*.webp` (a felhasználó saját, követetlen fájljai), és a `node_modules` junctiont.
- Verifikálj a böngészőben, ahol látható a változás, és **őszintén írd le, mit nem tudtál ellenőrizni**. Képernyőkép nem mindig megy (a böngészőpanel rejtve lehet): DOM/kód-ellenőrzés a tartalék.
- Shell: Git Bash apostrofos útvonalnál elromlik (`unexpected EOF`): tegyél a szkripteket fájlba (`.mjs`), vagy használj PowerShellt.
- Minden új szöveg i18n en + hu (meglévő terület-fájlok). Ne törölj tömegesen i18n kulcsot.
- Kerüld a refaktort: kicsi, helyi változtatások. A `GameViewport.tsx` hatalmas, csak a szükséges ponton nyúlj bele.
- Supabase (megosztott pályák/textúrák): a bucket `void-textures` nyilvános, az append-only `r<rev>` mappás tárolás él, a törlés SQL-policy-t igényel (`supabase/shared-texture-folders.sql`; a felhasználó futtatja a Dashboardon). Soha ne tárolj jelszót.

## 3. Mi van kész (összefoglaló, részletek a `concept/editor-ui/NOTES-*.md`-ben)

Szerkesztő: asset-fa (csoportok, keresés, szem/zár), Kijelölés eszköz (Shift+húzás: magasság), lebegő eszközsáv + Fájl menü + jobb felső
nézet/súgó/hibakereső csoport (nincs felső sáv), Assets (új textúra csatornánként Feltöltött/Auto/Nincs, IndexedDB piszkozat, mappás
Supabase tár, Közzététel, törlés, hangolás a `meta.json`-ban), normalMap-mag portja (`src/render/depthNormal*.ts`),
Pályabeállítások (render-attribútumok kategóriákban, alapból összecsukva), új pálya párbeszéd (helyszín + pálya, `deriveMapId`),
helyszín szerinti lista, belépési felirat, automatikus mentés a böngészőbe (`mapDrafts.ts`), megjegyzett Supabase-bejelentkezés,
megemelt talaj oldalfala mint fal (per-face textúra `faceTextures`, matrica, fali prop), tető propok (`roof_*`, `roofMesh.ts`),
kerítés/boltív propok, hibrid sima relief ajtókhoz/keretekhez (a térkép `reliefMode: smooth` esetén), felülnézet (O; görgő nagyítás,
Ctrl+görgő döntés, középső gomb pásztázás, Q/E forgatás).

## 4. A következő feature-ök (a felhasználó kérte; fontossági sorrendben)

### A. Felülnézeti „kurzor-fejlámpa" (kicsi, kezdd ezzel)
A felhasználó észrevette, hogy felülnézetben a fejlámpa a parti (az arrow a minimapon) szeme fölött van, és a jobb gombbal körbenézve
(jobbra-balra) a helyzete változik. Ötlete: **felülnézetben a fejlámpa kövesse a kurzort** (egy pontfény a kurzor alatti padló/felület fölött,
gombnyomás nélkül is), hogy bevilágítsa azt, amit éppen szerkeszt; **L-lel ki-be kapcsolható** (a szerkesztőben az L ma az `editLamp`-ot
váltja, `App.tsx`; a lámpa a `GameViewport.tsx`-ben ~7217 és ~7297 `pointLight`).
- Felülnézetben (`topdown.on`) a `pointLight` pozíciója: a kurzor alatti találat (`levelPoint` / `editTargetAt` a padló vagy a felület
  magasságán, ~0,5–1 egységgel fölötte, a mennyezet alatt tartva); ha nincs találat, az utolsó érvényes pont vagy a nézet közepe.
- Intenzitás/hatótáv: a szerkesztő sötét tesztpályáin is jól olvasható legyen, de ne égesse ki a textúrát; ha kell, külön csúszka a Debug > Fények alatt.
- Első személyű nézetben marad a mai viselkedés. A jobb gomb húzása felülnézetben **ne forgassa a parti nézetét** (vagy pásztázzon), mert ez zavaró.
- Ellenőrzés: felülnézet, sötét pálya, kurzor mozgatása, L ki/be, váltás első személyűre és vissza.

### B. A propok, tárgyak és 3D objektumok kövessék a térkép `reliefMode`-ját (közepes)
Ma: a falak és (az újabb) ajtók/keretek követik (`steps` vagy `smooth`), a felszedhető tárgyak mindig lépcsősek, a propok jellegük szerint.
Cél: egy térképi beállítás vezérelje az egész jelenetet egységesen. Sima módban az átlátszó kivágásúak (tárgyak, `panel` propok) a **hibrid**
útvonalon épüljenek (`createSmoothReliefGeometry` + `smoothHoles`, `reliefMesh.ts`), a kisebb elemek kisebb rácson (az átlátszatlan
ajtólap 8192 háromszöge túl sok: ~32 cella elég). Alapérték marad `steps`. Nézd meg a `NOTES-hybrid-door-relief.md`-t. Verifikáld a
fantasy térképen (tárgyak, fáklya, kerítés, boltív) mindkét módban.

### C. Az Assets v3: tárgy, matrica, prop, NPC és ajtó létrehozása (nagy; lépésenként)
Terv: `concept/editor-ui/asset-manager-content-plan.md` (és a textúra-terv `asset-manager-textures-plan.md`). Sorrend: közös `type` a `meta.json`-ban;
tárgy és matrica (egyszerű); prop (panel/billboard/cross); **ajtó-típus** (lap + keret + mozgás: csúszó, oldalra kifordulós, felfelé húzódó
rács) az **„Ajtó + keret" nézettel** (nyitás/zárás animáció, mindkét oldalról); NPC sprite-sheet vágó a böngészőben. A textúrák
átlátszóságának forrása: alfa csatorna / színkulcs (alap magenta, állítható) / nincs: ez a textúra-panelben már megvan, a többi típusra kiterjesztendő.

### D. Lassú jelenet-felépítés: a magasságtérképek lazy betöltése (közepes, mérés előbb)
Egy új pálya 15,6 s alatt épült fel; ebből a geometria <1 s, a 195 magasságtérkép-betöltés (+4325 textúra) a várakozás (`height map load (wait)`).
Mérd meg másodszori betöltésnél is. Javítások: a látótávolságon belüli falak térképei először, a többi háttérben; előtöltés; kisebb/tömörebb formátum.
Lásd a `GameViewport.tsx` ~1832 időzítő-táblát.

### E. RPG-szabályrendszer beemelése (hosszú táv, terv kész)
`concept/rpg-ruleset-integration-plan.md`: az AD&D-motor (`github.com/Bencepapa/rpg_ruleset_editor`) külső csomagként; a játék generál egy
manifestet (aktorok, tárgyak, effektek, textúrák), az RPG-adat string-azonosítókkal hivatkozik rájuk, validálás a manifest ellen. Először a manifest-export.

### F. Kisebb hibák és takarítás
- `shiftAll` / `allPositions` (`src/editor/mapEdits.ts`) nem kezeli a `chanceWalls`-t (É/Ny bővítésnél nem mozdulnak).
- A megemelt oldalfal magassága `min(alsó cella plafon, felső cella padló)`: ha a talaj plafonja alacsony, csak egy panelnyi; érdemes figyelmeztetni vagy automatikusan emelni.
- A fejléc-sávok (alacsonyabb plafon) per-face textúrája kód szerint kész, de böngészőben nem próbált; az `windows` lista (üveg) csak fal-cellákon működik.
- Felesleges i18n kulcsok (`editorBar.clearAll`, `app.clear*`, `app.newId`, `app.name`, `app.size`, `app.copyId`), maradék `EditorBar.tsx` típus-fájl.
- Tető: relief nélküli (lapos háromszögek); a 45° csak 1-es falmagasságnál pontos; belső sarok forgatva nem volt látva.
- Későbbi: többes kijelölés (mozgatás/tulajdonság/törlés), térképváltó kijárat átmenetekkel (lépcső / köd), esélyfal mint álfal (Ctrl/Shift+kattintás), decal árok falára (ma már riser-faceként megoldott).
- Ellenőrizetlen a felhasználó oldalán: a belépési felirat kinézete, a térkép-párbeszéd kinézete, az automatikus mentés visszaállítás-sávja, a valódi Supabase törlés, az ablak csillagos ege, a játék napló-színei.

## 5. Hasznos tudnivalók

- A hibrid ajtó-relief és a falvarrat jegyzetei: `concept/editor-ui/NOTES-hybrid-door-relief.md`, `NOTES-wall-seam-join.md` (a varrat rendben van: a kék csíkok a normál-nézet árnyékolásai; a kísérleti „weld" patch nincs beépítve).
- Világ-hozzárendelés: `src/game/worlds.ts` (`FANTASY_ASSETS`, `assetInWorld`).
- Sprite-sheet pipeline: `SPRITE_SHEET.md`; textúra-feldolgozás: `scripts/process-texture.ts`.
- A felhasználó tokenjei korlátosak: kicsi, célzott lépések, ne indíts hosszú, sok mellékes munkát.
