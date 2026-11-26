# VoidCrew teljesítmény és bővíthetőség terve

Állapot: javaslat, 2026-11-26. A dokumentum megvalósítási sorrendet és ellenőrizhető célokat rögzít; önmagában nem jelent implementációt.

## Cél és kiindulópont

A játék sok átjárható térképet, NPC-t, fényt, füstöt, 3D propot, hangot, zenét és képet fog kezelni. A történet több Twee-fájlból áll majd. A szerkesztő keresőt, súgót és bővülő fordításokat kap. A cél a kiszámítható betöltés és memóriahasználat, valamint hogy egy új funkció kevés, jól meghatározott modul módosításával beépíthető legyen.

A viewport szétválasztása lezárható: a megmaradt scene setup és React-koordináció további darabolása önmagában nem prioritás. A következő munka az állapotok, tartalomfüggőségek és alrendszerek közötti szerződések rendezése.

Kapcsolódó tervek:

- [Kódtérkép](../CODEMAP.md)
- [Viewport szétválasztás](gameviewport-split.md)
- [RPG ruleset integráció](rpg-ruleset-integration-plan.md)
- [Szerkesztői kereső](editor-ui/global-editor-search-plan.md)
- [Asset manager és tartalom](editor-ui/asset-manager-content-plan.md)
- [Tokenmérések](token-ledger.md)

## 1. Meglévő RPG-motor integrálása

A korábbi integrációs terv a `github.com/Bencepapa/rpg_ruleset_editor` projekt `src/rpg-core/` magját jelöli meg külső csomagként. Ez a tervezett harci, varázslat- és tárgyszabályok kiindulópontja. Nem készítünk mellette párhuzamos szabálymotort.

A VoidCrew-ban az `npm run rpg:manifest` és a `scripts/export-rpg-manifest.mjs` már létezik: aktor-, tárgy-, effekt- és textúraazonosítókat exportál. A jelenlegi `package.json` nem tartalmaz RPG-motor-függőséget. A külső projekt aktuális API-ját, csomagolhatóságát és tesztlefedettségét az integráció első lépésében külön kell ellenőrizni; a régi terv API-nevei nem tekintendők ellenőrzött mai szerződésnek.

### Felelősségek

| Terület | Tulajdonos |
| --- | --- |
| Kockadobás, támadás, sebzés, mentődobás, státusz, varázslat, tárgystatisztika | Külső RPG-mag és ruleset |
| Mozgás, térkép, célpontok térbeli elérhetősége, játékosbemenet | VoidCrew |
| Sprite, modell, fény, hang, animáció és felület | VoidCrew megjelenítési réteg |
| Küldetések, párbeszédek, történeti feltételek | Story runtime |
| Azonosítók és parancsok/események megfeleltetése | Vékony VoidCrew RPG-adapter |

A fantasy és sci-fi közös motort, külön verziózott rulesetet használjon. Először ellenőrizni kell, hogy a mag sémája támogatja-e a sci-fi egyszerűbb szabályait.

### Integrációs szerződés

- A mag publikus API-ján át érhető el; nincs játékból importáló motor és nincs belső motorfájlokra építő adapter.
- A kiadott motorverzió/revízió rögzített. A motor, ruleset és mentésséma verziója külön adat.
- A szabályadat és a megjelenítési adat külön tulajdonost kap: egy tárgy sebzése nem él két katalógusban.
- Egy művelet állapotváltozását egyszer alkalmazzuk. Az események megjelenítést és történeti reakciót indítanak, nem számolják újra a sebzést.
- A véletlen és az idő vezérelhetősége szükséges a reprodukálható tesztekhez. Ha ezt a mag nem tudja, ott kell bővíteni.
- A valós idejű mozgás és a szabálymotor kör-, akció- vagy cooldownmodelljének kapcsolatát az adapter előtt tisztázni kell.
- Az RPG-szerkesztő UI-ja külön, igény szerint betölthető rész legyen; a játékosnak ne kelljen a teljes szerkesztő alkalmazást letöltenie.

Első vertikális próba: egy fantasy ellenfél, egy fegyver, egy varázslat, egy státuszhatás, loot és mentés/visszatöltés. A régi és új harci útvonal egy szereplőn ne működjön egyszerre. Elfogadás: rögzített véletlennel azonos eredmény; nincs dupla sebzés; hiányzó assethivatkozást jelez a validátor; a sci-fi működés változatlan, amíg külön át nem állítjuk.

## 2. Stabil azonosítók és tartós világállapot

Az `actors.ts` jelenleg térképbeli tömbindexből képez aktorazonosítót; a propkezelés és több szerkesztői hivatkozás is indexet használ. A sok térképes történet előtt tartós azonosítókat kell bevezetni.

- Külön `assetId` a típushoz, `entityId` a pályán elhelyezett példányhoz, `mapId` a térképhez, `passageId` a történetrészhez.
- Az entity-azonosító egyszer jön létre és mentésre kerül. A régi fájlok migrációja után sem újragenerálható minden parse-nál.
- Belső gyors tömbindex megmaradhat, de tartós hivatkozás nem támaszkodhat rá.
- Másolás új azonosítókat ad; mozgatás megtartja őket. A másolt csoport belső hivatkozásait át kell kötni, a külsőket előre rögzített szabály kezeli.
- A térképdefiníció különül el a játékállapottól: elhelyezés és alapadat az előbbiben, HP, kifosztottság, ajtóállapot és történeti változás az utóbbiban.
- Térképváltáskor a dinamikus állapot fennmarad. A nem aktív térképek alapból ne futtassanak teljes szimulációt; szükséges időbeli hatásaikat visszatéréskor vagy külön kampányszabály alapján dolgozzuk fel.
- Mentés tartalmazza a séma-, ruleset- és tartalomverziókat, valamint az RNG-állapotot, ha a mag használ ilyet. Tartalomfrissítéshez migráció vagy egyértelmű kompatibilitási hiba kell.

Elfogadás: középre beszúrt/törölt NPC nem köti át más szereplőre a küldetést; oda-vissza térképváltás megőrzi az állapotot; copy/move/undo és régi mentés migrációja tesztelt.

## 3. Igény szerinti betöltés és tartalomkatalógus

A `game/map.ts` eager importtal beolvassa és parse-olja a beépített térképeket. Az `editor/mapStore.ts` a nyers térképszövegeket is eager módon importálja. A `story/load.ts` eager Twee-importot használ; az `App.tsx` több nagy editorpanelt közvetlenül importál.

### Térképek és szerkesztő

- Induláskor kis manifest: azonosító, címkulcs, világ, revízió, átjárók, függőségek és opcionális előnézet.
- Teljes térkép és nyers szerkesztői adat megnyitáskor töltődik be.
- Az aktív térkép kötelező, a kapcsolódó térképek korlátozottan előtölthetők. Nem töltjük be rekurzívan az egész összekötött világot.
- A térkép elérése közös aszinkron szolgáltatáson át történik; a közvetlen `MAPS[id]` fogyasztók fokozatosan migrálnak.
- Térképváltás állapotai: betöltés, validálás, jelenetépítés, kész/hiba. Sikertelen váltásnál az előző érvényes állapot megmarad, újrapróbálkozás lehetséges.
- A nagy szerkesztőpanelek első megnyitáskor töltődnek be. A játékos indulási útvonalát külön mérjük a szerkesztőétől.

### Twee és fordítás

- A kiadás előfeldolgozza a Twee-forrásokat: parse, stabil passage-azonosítók, keresztfájl-hivatkozások és assetek ellenőrzése.
- A teljes kampány validálása után kampányrészekre bontott futásidejű adat készülhet. Egy globális kis index megmondja, melyik passage hol található.
- Fejlesztéskor a szerkesztett forrásrészek újrafordíthatók; a játékosnak nem kell minden forrást újraparse-olnia.
- Szövegazonosító független a megjelenített fordítástól. A szöveg átírása nem módosít történeti hivatkozást.
- UI- és történetfordítás külön csomagok; kulcsok és interpolációs paraméterek egyezését automatikus ellenőrzés biztosítja.

Elfogadás: a kezdőtérképhez nem tartozó térképek nem parse-olódnak induláskor; a játék editor nélkül indul; a történet csomaghatáron át is navigál; hiányzó csomag érthető hibát ad.

## 4. Assetek és memória

A `render/viewport/sceneCache.ts` textúrákat, depthrácsokat és reliefgeometriákat újrahasznosít, a bake-cache már darabszámkorlátos. A többi cache-re külön memóriakeretet és erőforrás-tulajdonlást kell kialakítani.

- Assetkulcs: stabil azonosító + tartalomrevízió + előállítási paraméterek.
- Aktív használók referenciái védik az erőforrást; a már szabad assetek méretkorlátos LRU-cache-ben maradhatnak.
- Külön költségmérés a hálózati/böngészős tárhelyre, CPU-adatra és GPU-erőforrásra. A GPU-méret becslés, a kép lemezmérete nem helyettesíti.
- Egyszerre futó letöltések és CPU-igényes előállítások korlátozottak. Közös kérés több fogyasztót kiszolgál; egy fogyasztó lemondása nem szakítja meg a többiek betöltését.
- Elavult aszinkron munka eredménye nem kerülhet az új jelenetbe. A későn elkészült, már nem használt erőforrás felszabadul.
- Revízióváltás célzottan érvényteleníti a függő erőforrásokat, nem minden assetet.
- Nagy képekhez és textúrákhoz felhasználási cél szerinti méretváltozatok, előnézetek és importkori költségjelzés.
- Csomagoláskor a tényleges függőségeket gyűjtjük össze; az állóképek és töltőképek is assethivatkozások.

Elfogadás: ismételt térképbejárás után a megtartott cache a kereten belül marad; nincs használat közben felszabadított textúra; a megosztott asset csak egyszer töltődik le azonos revízióval.

## 5. Hang és zene

Az `audio/engine.ts` a mintákat már igény szerint tölti be, Web Audio útvonalon. A `howls` gyűjteményhez életciklus- és cache-szabály kell a nagy hangkönyvtárhoz.

- Rövid térbeli effektek: a meglévő Web Audio és akusztikai feldolgozás megtartása.
- Hosszú háttérzene: külön lejátszási útvonal, szükség szerint HTML5/streaming, crossfade és külön hangerőbusz. Nem váltjuk át automatikusan a térbeli hangokat erre.
- Globális és kategóriánkénti egyidejű hangkeret. A prioritás figyelembe veszi a játékjelentőséget, távolságot és hallhatóságot.
- Inaktív hangok buffer-cache-e korlátos; az aktív lejátszás védett. Saját blob URL-ek felszabadítása is része az életciklusnak.
- Betöltési hibánál kontrollált újrapróbálás; a hibás revízió ne indítson kérészáport.

Elfogadás: sok emitter mellett betartott hangkeret; térképváltás és zeneváltás után nincs ottmaradt lejátszás; hangtalan/autoplay-blokkolt indulás is működik.

## 6. Célzott szerkesztési változások

Az `editor/mapStore.ts` minden edit során teljes másolatot készít, tetőt és kerítést újraértékel, parse-ol és JSON-t hasonlít össze. A `liveEdits.ts` további listák eltérését vizsgálja. Nagy térképen egy kis módosítás költségét csökkenteni kell.

- A szerkesztési parancs eredménye változásleírást ad: érintett entity-k, cellák és területek, például geometria, világítás, megjelenés vagy történet.
- Elsőként lámpaparaméter és propmozgatás kap célzott útvonalat; a jelenlegi teljes feldolgozás megmarad tartaléknak.
- Egy tranzakció egy undo-lépés. Húzás közben gyors előnézet, drága véglegesítés összevonva.
- A változásleírásból következik a cache-érvénytelenítés, bake, keresőindex-frissítés és UI-értesítés.
- Később változásalapú undo és időszakos teljes checkpoint válthatja a nagy teljes snapshotokat. Ez csak mérhető memóriaelőny esetén indokolt.

Elfogadás: célzott és teljes feldolgozás azonos eredményt ad; lámpaszín nem épít új falgeometriát; mozgatás, copy/cut/paste, undo és redo atomikus marad.

## 7. Feature-regisztráció, kereső és kisebb fejlesztési effort

A kereső meglévő stabil célpontjaihoz igazodva legyen egyértelmű, hol kell új eszközt vagy beállítást regisztrálni.

- Közös metadata ott, ahol valóban közös: stabil célpont, cím- és súgókulcs, kategória, világ, szinonimák és megnyitó.
- Egyszerű mezőknél ugyaninnen jöhet típus, határok és alapérték. Összetett UI nem kényszerül általános űrlapmotorba.
- A kereső assetmetadata-adatot indexel, nem tölti be a teljes képet, hangot vagy 3D modellt.
- Statikus súgóindex előállítható buildkor; dinamikus assetek célzottan frissülnek. Worker akkor kell, ha az indexépítés méréssel kimutathatóan blokkolja a felületet.
- Minden alrendszerhez rövid szerződés: belépési pont, állapottulajdonos, események, cleanup, releváns tesztek. A CODEMAP ezekhez irányít.
- Új feature briefje nevezze meg a releváns modulokat és elfogadási példákat. Ne kelljen minden feladathoz az egész projektet újrafelfedezni.
- Kisebb modellre jól körülírt regisztráció, fordítás és adatbővítés bízható; állapotmigráció és életciklus-változtatás külön felülvizsgálatot kapjon.

Elfogadás: új egyszerű beállítás egyértelmű helyen regisztrálható; kereső, súgó és fordítás hiányait ellenőrzések jelzik; megnyitás önmagában nem módosít térképet.

## 8. Renderelés és szimuláció mérések alapján

A már meglévő LOD, láthatósági szűrés, fénypool és workerben futó bake maradjon az alap. Nem vezetünk be általános ECS-t vagy teljes motorcserét pusztán a tervezett tartalommennyiség miatt.

Mérendő jelöltek:

- Ismétlődő statikus propok instancingje, kisebb térbeli csoportokban; stabil entity-picking és szerkeszthetőség megtartásával.
- Cellánkénti térbeli index a közelben lévő NPC-khez, interakciókhoz és célpontokhoz, ahol ma ismételt teljes listabejárás a költség.
- NPC-döntések és vizuális interpoláció eltérő frissítési üteme. Képernyőn kívüliség önmagában nem állíthat le történetileg fontos szimulációt.
- Füst és részecskék emitterenkénti/globális kerete, távoli részletességcsökkentés.
- Relief-előállítás workerbe vagy előre generált assetbe helyezése, ha a CPU-mérés ezt indokolja; a three.js erőforrások létrehozása kontrollált átadási ponton marad.
- React értesítések szűkítése: a nagy frekvenciájú szimulációs változás csak a szükséges felületet frissítse. Új store bevezetését profilozás előzze meg.

## 9. Mérési és ellenőrzési kapu

Rögzített tesztpályák: sok NPC; sok fény; sok füst; sok ismétlődő prop; nagy szerkeszthető térkép; több összekötött térkép. Azonos gép, böngésző, beállítás, seed és útvonal mellett hideg és ismételt futások.

Metrikák: indulás és térképváltás ideje, főszálas megakadások, medián/p95/p99 képkockaidő, draw call, háromszögszám, CPU/GPU-memóriabecslés, cache-méret, aktív hangok, szerkesztési tranzakció ideje. Tíz oda-vissza térképváltás külön memória- és cleanup-próba.

Az első mérés adja az alapértékeket. Az elfogadható célokat a támogatott gyengébb gépre külön rögzítsük; előzetesen nem ígérünk FPS- vagy százalékos gyorsulást.

Agentmérés: azonos feladat, modell, effort és ellenőrzési követelmény, több váltakozó futás. Token mellett sikeresség, javítókörök és teljes idő is szerepeljen. A ledger mostani 13,5%-os átlagos tokenelőnye egyetlen feladat három-három futása; a free modell egy tiszta tsc-s futása nem teljes funkcionális validáció.

Kódváltoztatásnál `npm run check`, viewport-változásnál smoke és célzott böngészős próba. A smoke önmagában nem ellenőrzi a harci szabályokat, hangot vagy a vizuális azonosságot. A sandboxos `uv_os_get_passwd ENOMEM` tesztindítási hiba külön környezeti probléma; megfelelően engedélyezett futtatási környezetben ellenőrizendő, nem a projekt tesztjeinek kihagyásával.

## 10. Javasolt ütemezés

| Szakasz | Konkrét eredmény | Függőség |
| --- | --- | --- |
| A | Teljesítményalapmérés és a külső RPG-mag API/csomag auditja | Jelenlegi működő verzió |
| B | Stabil példányazonosítók, mentésséma és migráció | Azonosító-tulajdonlás rögzítése |
| C | Egy fantasy harc teljes RPG-adapteres próbája | A és a szükséges B-rész |
| D | Térképmanifest, aszinkron loader, editor lazy betöltés | B, betöltési életciklus |
| E | Asset- és hangcache-keretek, zeneútvonal | A; D-vel közös erőforrás-szerződés |
| F | Célzott edit-tranzakciók és értesítések | B, visszaellenőrizhető teljes útvonal |
| G | Kereső-regisztráció, súgó és fordítás-ellenőrzések | Meglévő keresőterv; önállóan indítható |
| H | Kampány-előfeldolgozás, csomagok és tartalomvalidálás | B és D |
| I | Méréssel indokolt render/szimuláció optimalizálások | A eredményei |

Minden szakasz kis, visszaellenőrizhető változtatásokból álljon. Az RPG-integráció részletes szabálydöntéseinek elsődleges helye a meglévő RPG-terv, a keresőé a keresőterv; ez a dokumentum a közös függőségeket és sorrendet fogja össze.

## Technikai háttér

- [Vite glob import és lazy betöltés](https://vite.dev/guide/features)
- [Three.js textúramemória](https://threejs.org/manual/pages/textures.html)
- [Three.js sok objektum optimalizálása](https://threejs.org/manual/pages/optimize-lots-of-objects.html)
- [Howler nagy hangfájlok és unload](https://github.com/goldfire/howler.js)
