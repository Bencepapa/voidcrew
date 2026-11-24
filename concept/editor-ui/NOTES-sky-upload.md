# Égbolt feltöltése (`feature/sky-upload`)

Semmit nem láttam futó alkalmazásban; a tiszta rész (méretszabályok, varratmérés és -javítás, azonosítók, választólista) tesztelt: `npx tsx src/game/skyImage.test.ts`, `src/editor/skyUploadLogic.test.ts`, `src/game/skyMapFormat.test.ts`, `src/game/mapSharedRefs.test.ts`, `src/game/bundledImages.test.ts`, `src/editor/imageDraftLogic.test.ts`.

## Mit vár a játék (a formátum)

Az égbolt egyetlen kép, amelyet a shader (`GameViewport.tsx`, `makeSkyMaterial`) a nézési irányra vetít: `u = atan(z, x) / 2π + 0,5` (vízszintesen 360°-ot körbeér, `RepeatWrapping`), `v = elevation / 90°` (0..1, a horizont 0, a zenit 1). Ebből a követelmények:

| Mi | Érték |
|---|---|
| Arány | **2:1** (szélesség : magasság = 2). 1,95–2,05: rendben; 1,8–1,95 és 2,05–2,2: figyelmeztetés („megnyúlva fog látszani”); azon kívül elutasítva |
| Méret | szélesség **1024–4096** px; ajánlott **2048 × 1024** (a beépített égboltok 1536 × 768-asak) |
| Tájolás | az **alsó él a horizont**, a **legfelső sor a zenit** (függőlegesen felfelé); a kép csak a felső félgömböt fedi (a horizont alatti rész nem kell) |
| Illesztés | a **bal és a jobb szélnek összeérőnek kell lennie** (az ég körbeér); a bal oszlop szomszédja a jobb szélső oszlop |
| Fájl | PNG, JPG vagy WebP feltöltve; a tárban mindig `diffuse.png` lesz (a szerkesztő a böngészőben PNG-vé alakítja; átlátszó pixelek feketére simulnak); legfeljebb 8 MB fájlonként (PNG-ként is) |
| Színek | nincs színkonverzió: a pixelértékek úgy jelennek meg, ahogy a fájlban vannak (sRGB-nek szánt kép is jó) |

A pálya `textures.sky` mezője kétféle lehet: **beépített név** (`public/skies/<név>.png`, mint eddig, kézzel a `public/skies/index.json`-ba is be kell írni) vagy **megosztott égbolt azonosítója**: `<világ>_sky_<uuid>` (pl. `fantasy_sky_0b8c1f6e-…`), ugyanaz az alak, mint a matricáké és állóképeké (`<világ>_<decal|item|portrait|sky>_<uuid>`). Ezért a vendégbetöltés (`mapSharedRefs.ts` → `guestShared.ts`), a csomagolás és a `loadSharedImagesById` külön munka nélkül ismeri.

## Hogyan készíts égboltot egy panorámafotóból

1. Teljes (360° × 180°, equirectangular) panoráma, amely 2:1 arányú (pl. 4096 × 2048): **vágd le a felső felét** (a zenittől a horizontig): ez 360° × 90°, azaz 4:1 (4096 × 1024).
2. **Méretezd át 2:1-re, az arány zárolása nélkül**: pl. 2048 × 1024 (a szélességet felezed). A játék a képet 360° × 90°-ra vetíti, így a pixelek vízszintesen kétszer annyi szöget fednek, mint függőlegesen: ettől lesz torzításmentes az ég.
3. Ha sima (nem 360°-os) széles fotód van: a vízszintes illesztés nem lesz természetes; a „Varrat eltüntetése” gomb el tudja mosni, de az eredmény csak hangulatnak jó (a felhők a szélen tükröződnek).
4. A horizont legyen a kép alsó sorában, a zenit a legfelsőben (felhők, csillagok: ezek a legfelső sorban összefutnak, mert a zenit egy pont).
5. Mentsd PNG-ként (vagy JPG/WebP-ként), és töltsd fel.

## A varrat ellenőrzése és javítása

A szerkesztő a feltöltött képen megméri a **bal és jobb szélső oszlop átlagos színeltérését** (0–255, csatornánként), és összeveti a kép saját, szomszédos oszlopok közötti változásával. A varrat **rendben van**, ha az eltérés legfeljebb `max(6, 2,5 × a kép oszlopról oszlopra való átlagos változása)`; különben „Látszó varrat” jelzés. Az előnézetben két csík van: a teljes panoráma, és alatta „a varrat körül” (a jobb fél, utána a bal fél; a sárga vonal az illesztés helye): a szélnél látszó ugrás itt szúr szemet.

**„Varrat eltüntetése”** (tükrös keverés, `makeSeamless` a `src/game/skyImage.ts`-ben): mindkét szélen a kép szélességének **8%-át** összekeveri a másik szél **tükörképével**: a szélső oszlop 50–50%, majd befelé fokozatosan egyre inkább a saját színe, a sáv belső szélén már teljesen a sajátja. Eredmény: a két szélső oszlop **pontosan azonos**, tehát az illesztés tökéletes; a kép többi része nem változik, a méret ugyanaz. Ára: a két szélső sávban halvány, tükrözött „szellemkép”. Visszavonás: töltsd fel újra az eredeti fájlt (a gomb a piszkozat képét írja át, nem az eredeti fájlt).

## Működés (rövid)

- **Asset manager → Égboltok**: új égbolt-piszkozat (IndexedDB, mint a többi kép), feltöltés, név, mentés, közzététel (`<világ>/sky/<uuid>/r<N>/diffuse.png` + `meta.json`, `type: "sky"`); közzététel előtt a méret-szabályok újra ellenőrizve (hibás méret: kivétel). Közzétett égbolt újra szerkeszthető („Szerkesztés” → új revízió).
- **Pálya beállításai → Égbolt → Kép**: miniatűrös választó (`TexturePicker`): generált csillagos ég, a beépített égboltok, a pálya világának megosztott égboltjai (név szerint). Ha a választott azonosító nincs betöltve, „(az égbolt nincs betöltve: …)” sor jelzi, és a Problems panelen figyelmeztetés van.
- **Debug panel**: az égboltválasztóban a megosztott égboltok is ott vannak.
- **Renderelés**: `skySurface` a beépített nevet `skies/<név>.png`-ként, a megosztott azonosítót a regisztrált (vagy csomagolt) kép URL-jéről tölti; amíg nem érkezett meg, a csillagos ég látszik, utána cserélődik (a víz tükrözése, `decals.setWaterSky`, ugyanúgy frissül).
- **`npm run pull:shared`**: a `sky` típusú képeket is csomagolja (`public/shared-images/<id>.<png|webp>`, veszteségmentes kódoló, a katalógus `files` mezőjében a valódi névvel; a használhatatlan méretű égboltot kihagyja, figyelmeztetéssel). `-- --list`: „Would bundle sky … (2:1 sky panorama)” sorok. A játék a csomagolt fájlt hálózat nélkül tölti be (`bundledImages.ts`).

## Kézi teszt

1. Asset manager → Égboltok → + Új. Tölts fel egy 2048 × 1024-es PNG-t: megjelenik a nagy előnézetben, a jobb oldali panelen a méret, a két csík és a varratjelzés; a név a fájlnévből töltődik.
2. Tölts fel JPG-t és WebP-t is: PNG-ként kerül a piszkozatba, ugyanúgy működik.
3. Tölts fel négyzet alakú képet (pl. 1024 × 1024) → elutasítva („2:1 arányú panorámának kell lennie”); 512 × 256 → „legalább 1024”; 8192 × 4096 → „legfeljebb 4096”; 2048 × 1100 → elfogadva, sárga figyelmeztetéssel.
4. Egy balról jobbra sötétből világosba menő kép: „Látszó varrat”; „Varrat eltüntetése” → zöld jelzés, a két csík közepén nincs ugrás.
5. Közzététel (bejelentkezve): az égbolt a listában marad, a piszkozat eltűnik; frissítés után (Refresh) is ott van, a „Szerkesztés” új piszkozatot ad belőle.
6. Kültéri pálya → Inspector → Kinézet → Égbolt → Kép: a választóban ott a feltöltött égbolt miniatűrrel; kiválasztva és a nézetben körbenézve a horizont alul van, a szél (360°) nem ugrik; a víz tükrözi.
7. Mentés, újratöltés, undo/redo: a választás megmarad; másik világ pályáján az égbolt nem szerepel a listában (csak ha az van kiválasztva).
8. Vendég / inkognitó ablak (nincs bejelentkezés): a játék az égbolt azonosítóját a pálya alapján maga tölti le; közben a csillagos ég látszik.
9. Debug panel → égboltválasztó: a feltöltött égbolt névvel szerepel, váltáskor a jelenet újraépül.
10. Egy pálya egy nem létező `fantasy_sky_<uuid>`-val: Problems panelen „A pálya égboltja … nem ismert megosztott égbolt”, a játék a csillagos eget mutatja.
11. `npm run pull:shared -- --list`: a közzétett égbolt „Would bundle sky …” sorral szerepel (a valódi futás után a `public/shared-images/` alatt a fájl, a `sharedBuiltins.json`-ban a bejegyzés; a játék hálózat nélkül mutatja).
