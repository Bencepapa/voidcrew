# Ellenőrzési lista a felhasználónak (kézi tesztek, 2026-11-20)

Ezeket a Pages-es buildben vagy a helyi szerveren kell kipróbálni; a kód- és típusellenőrzés már lefutott, de futás közben nem volt tesztelve.
Pipálható lista: húzd ki, ami rendben van; ami nem, azt írd le (melyik lépésnél, mit láttál, a böngésző konzolja).

## Supabase (valódi tár)
- [x] **Vendég-olvasás inkognitó ablakban:** `localhost:3000` → Network fül, szűrő a Supabase-projektre; 5–10 s után `GET …/void_map_heads?world=eq.fantasy` és `POST …/storage/v1/object/list/void-textures` **200**-zal (401 vagy üres lista = a `shared-public-read.sql` nem érvényesült).
- [ ] **Törlés** (a törlési szabály a `supabase/shared-texture-folders.sql`-ben): egy teszt-textúra törlése az Assets-ben tényleg eltűnik a tárból (a futtatásról nincs megerősítés).
- [x] **Közzététel és visszatöltés:** egy új textúra, egy matrica és egy állókép közzététele, oldalfrissítés után látszik, vendégként is.
- [ ] **NPC WebP (KÉSŐBB tesztelem, a felhasználó jelezte)** (a `shared-webp-mime.sql` lefutott): NPC közzététele → a revízió mappájában `diffuse.webp` vagy `diffuse.png` (a kisebb) + `normal.png` + `meta.json` (`definition.diffuseFile`); újratöltés, vendégnézet, módosítás + újraközzététel.

## Szerkesztő
- [x] **AI mélység** egy valódi textúrán (Assets → új textúra → AI mélység szakasz): az előnézet a helyes irányú reliefet mutatja (ha kifordított: Invertálás), a normal-jelölő, a Mégse gomb, oldalfrissítés után „Modell gyorsítótárban: gyors”.
- [x] **Frissítés gomb** az Assets fejlécében: üzenetet ad (nincs beállítva / frissítve / bejelentkezés kell).
- [x] **Sárga sáv:** a közzé nem tett képek listája, kattintásra a piszkozatra ugrik, a × elvet.
- [x] **Új pálya párbeszéd** (helyszín + pálya), a pályalista helyszín szerinti csoportosítása, a belépési felirat.
- [ ] **Automatikus mentés visszaállítás-sávja:** szerkesztés → oldalfrissítés mentés nélkül → a visszaállítás-sáv.
- [x] **Megemelt oldalfal** (Textúra, Matrica, fáklya) és a **tető propok** (belső sarok forgatva még nem volt látva).
- [x] **Sötét fantasy utófeldolgozás** (Debug panel) a hue-szabályokkal, a maszk-nézettel; a teljesítménye.

## Játék
- [x] **Esemény aktiválása Space-szel** (üzenet, boltablak, ajtó „Zárva”): normál játékban, 1–2 cellányira, a célkereszt az elemen (a CPU-terhelés miatti előző kudarc újrapróbálása).
- [x] **Beszélgetés (H2):** Assets → Párbeszédek → minta importja + tesztablak; NPC-eszköz `smith1` (Inspector „Beszélgetés”: `void-fantasy`, `Start Smith`); játékban 1,8 egységen belül Space/kattintás: megfordul, a világ megáll, 1–9/fel-le+Enter/Esc.
- [x] **Hátizsák és kezek (H3):** `I` nyit/zár; húzás hátizsák ↔ kéz ↔ kéz, kattintás-kattintás, nyilak+Enter; kétkezes fegyver (számszeríj, puskák) mindkét kezet foglalja; a `[n]` gomb a jobb kéz fegyverét süti; tele hátizsák → a többlet a rács alatt; futás vége: zsákmány eladása a bázison.
- [ ] **Bolt (H4):** a „Smith buy” / „Buy/Sell” választás a bolt-ablakot nyitja; vétel húzással, eladás a boltra húzással, Shift+kattintás gyorsmozgatás, ár és kredit-előnézet, Esc → vissza a párbeszédbe. Új mentésen 0 kredit: a teszthez emeld a `meta.credits` értékét.
- [ ] **Kiadás (H5):** Dialogues panel „Közzététel”, vendég-nézetben betöltődik; `npm run pull:shared` utáni diff átnézése, majd `npm run build`.
- [x] **AI mélység állapotsor** (keskeny panelben is látszik, progress bar letöltéskor).
- [ ] A **jelenet nem tűnik el és nem fagy** a vendég-automatikus betöltés után (az újraépítés csak akkor fut, ha a térkép használ megváltozott megosztott textúrát).

## Újabb funkciók (2026-11-21, még nem próbáltad ki)
- [ ] **Irányítás:** W/S előre-hátra, A/D oldalra lépés (strafe), Q/E fordulás; nincs alap egérnézet, a bal gomb + húzás kitekint. Fantasy és sci-fi nézetben is; boltablak/párbeszéd közben a kamera nem mozog.
- [ ] **Bolt nem állítja le a világot:** NPC-vel beszélgetés → bolt megnyitása: az NPC és a kamera megáll (ezt kell újra próbálni, a javítás csak a kamera-kitekintést találta meg).
- [ ] **Esemény kijelölése + Delete:** esemény kijelölése a térképen (sárga keret), Delete törli, Esc/kattintás máshova kiveszi a kijelölést.
- [ ] **Egyszerű bolt:** NPC `shop` interakcióval: portré + köszöntő szöveg + „Vásárlás” gomb, a boltablak a vásárlásra nyílik. A twine-os változat: `@shop` parancs a párbeszédben.
- [ ] **Kezek = használat:** a két kéz doboza gombként viselkedik: kattintás = használ (ital megivása, fegyver támadása); külön fegyver-sor nincs; az inventory-ban nincsenek avatárok; tárgy leírása megjelenik; az „Értéke” felirat; rendezés csak húzással.
- [ ] **Hátizsák-csiszolás:** halom szétosztása, kezenkénti várakozás (cooldown) használat után, a hátizsák mentése és visszatöltése frissítés után.
- [ ] **Bolt-szerkesztő (Assets → Boltok):** új bolt létrehozása, tételek és árak, helyi piszkozat, közzététel; a játékban az `@shop` ezt nyitja. `npm run pull:shared` utáni diff.
- [ ] **Felvehető tárgyak értéke:** a szerkesztőben tett tárgyak értéke kategóriánként (hulladék 4, tech 15, készlet 10, értéktárgy 40, adat 30), a bázison eladva ennyit ér.
- [ ] **Tető-autotile** (a részletes próbalista: `concept/editor-ui/NOTES-roof-autotile.md`, „Testing by hand”): Tető (automata) a fában, festés/törlés/Shift+kattintás, kijelölt elem leválasztása, a **textúra a jobb oldali panelen** az eszköz kiválasztásakor (kő/cserép a pöttyös helyett).
- [ ] **Átjárók (kapu, lépcső, töltőkép):** a részletes lista a `concept/editor-ui/NOTES-level-links.md`-ben (10 pont). Gyors próba: két kész tesztpálya, `linktest-utca` (Linkteszt – Utca) és `linktest-pince`: az utca keleti kapuja a pincébe visz (a „Leave … for …?” kérdés, Enter = megy, Esc = marad, nem kérdez újra, amíg le nem lépsz a celláról), a pince nyugati kapuja vissza; az utca lépcsője lefelé, a pince csigalépcsője felfelé (kameramozgás + fade); töltőkép: Assets-ben közzétett állókép a Térkép panelen, a kapun külön is megadható.
- [ ] **Kijárat/lépcső kezelése:** a Kijárat a Közlekedés csoportban van; Select-tel kijelölt kapu/lépcső a 3D nézetben keretet kap, Delete törli.
- [ ] **Közös textúra-kezelés (Tárgyak, felvehető tárgyak, matricák, NPC-k):** depth/normál feltöltés, Auto, AI depth/normál; a 12 pontos lista: `concept/editor-ui/NOTES-texture-unify.md`.
- [ ] **NPC méretcsúszka** (Assets → NPC-k): beépített típus (goblin) kijelölve → Méret csúszka, 3D előnézet élőben; „Mentés a projektbe” (dev szerver) → `src/game/actorSizes.json`; játékban a kisebb goblin sprite-ja, a lövés és a célzózóna egyezik; 1,5× robot még átfér a folyosón. Közzétett NPC: „Magasság a térképen” csúszka + mérőábra. Részletek: a jelentés hand-teszt listája (7 pont).
- [ ] **Ajtónkénti textúra:** ajtó kijelölve → Inspector „Kinézet”: ajtólap és keret külön állítható, „az ajtótípusé” visszaállít; mentés/újratöltés/undo; lift- és feliratos ajtón a felirat az új lapon; megosztott textúra felülírásként; hibás id a Problems panelen figyelmeztetés.
- [ ] **Nincs fekete sík** átlátszó textúrájú fal (kapu, rács, ablakszerű kivágás) és emelt padló oldalfala mögött; a sima falaknál nincs fényszivárgás a varratoknál/sarkoknál; ablakok és fejlécsávok a régiek. Ha az emelt padló oldalán még fekete sík van, írd le, melyik fal (a javítás a risereket vette ki).
- [ ] **Történet-engine (még nem kapcsolt a UI-hoz):** csak tesztek futnak (`concept/story-example/`, `src/game/story/`); kézzel még nincs mit kipróbálni, a UI-bekötés után kerül ide a lista.
- [ ] **Tesztsztori (játszható próbatörténet, törlése: `src/story/TESZTSZTORI-REMOVE.md`, részletek: `src/story/README.md`):** nyisd meg a `localhost:3000/?world=fantasy&map=tesztsztori` címet (csak így kapcsol be a történet; a térkép a szerkesztő listájában is ott van, váltás után frissíts). Város: Borbás kovács (4,3) → „Kérek egy jó kardot”, a délnyugati pincében 3 fagyérc (1,8) (1,9) (2,9), vissza hozzá: átadás → rúnás kard a hátizsákban + 20 kredit; Lana (7,2) → „Valami baj van?”, a gyűrű a pince déli zugában (5,10), visszavitel +40 kr (a 2. fejezetben is); Varga: a térdelő (9,2) „Megkíméled” vagy a délkeleti trónteremben (9,8) megölöd → a fejezet véget ér, a napló a 2. fejezet szövegét hozza. Kapu (1,1) a labirintusba: zarándok az északkeleti zsákutcában (10,1), kapitány a kijáratnál (8,9) (hajó → 3. fejezet váz / alvilág → történet vége), a kapuk átlépése `level_exit`. Debug panel → Story: fejezet, változók (`labyrinth_route`, `heroism`), küldetések, effekt-napló, ugrás fejezetre. Más térképen (`?map=fantasy`) semmi nem változik.
- [ ] **Kerítések és blokkok** (`feature/fence-blocks`; a részletes próbalista: `concept/editor-ui/NOTES-fence-blocks.md`, „Kézi teszt”): a fában a „Kerítések és blokkok” csoport (blokk, kerítés a szélen, kerítés középen) a Tető alatt; átlátszó textúrával a mögötte lévő jelenet és a padló látszik; a szél/közép kerítés és a blokk megállítja a csapatot, az ellenfeleket és az AI útkeresést; szerkesztő módban a cellák padlóján jelölés van; textúraválasztó miniatűrökkel az Inspectorban.
- [ ] **Megosztott fájlok gyorsítótára (service worker, `feature/shared-sw-cache`; a részletek: a `concept/supabase-egress-audit.md` „Service worker cache” szakasza):** dev szerveren (`localhost:3000/voidcrew/`, Supabase-os `.env.local`-lal) töltsd be az oldalt kétszer; DevTools → Application → Service Workers: a `sw.js` fut, Cache Storage → `void-shared-v1` tele van (`r<N>/diffuse.png`, `meta.json`...); a 2. betöltésnél a Network fülön a tár `…/r<N>/…` fájljai „(ServiceWorker)” méretűek, a `list` POST-ok és a `void_map_heads` viszont továbbra is mennek a hálózatra; a Vite HMR (szerkesztés mentése) és a játék működése nem változik. Debug panel → „Megosztott fájlok gyorsítótára”: állapot és fájlszám/MB, „Megosztott gyorsítótár törlése” kiüríti, a kapcsoló kikapcsolva megszünteti a regisztrációt (újratöltés után nincs worker); `?sw=off` ugyanígy. Csomagolt játékban (`npm run pack`) nincs `sw.js` és nincs Supabase-hívás.
- [ ] **Működtethető elemek** (`feature/operable-props`; a részletes próbalista: `concept/editor-ui/NOTES-operable-props.md`, „Kézi teszt”): a fában a „Működtethető” csoport (kar, gomb, nyomólap, csapdacella, nyílvető lőrés, varázsjel); kar/gomb a falra, Inspector → „Cél összekötése” → kattintás egy ajtóra; játékban kattintás/Használ a karra → az ajtó nyílik/zárul, a kar áttűnik; nyomólap: amíg állsz rajta, nyitva; csapdacella/falcsapda sebzi a csapatot; zárt ajtó kulccsal (tárgy → „Legyen belőle kulcs” + az ajtó zárkulcsa).
- [ ] **Magyar útmutatók:** `docs/twine-utmutato.md` és `docs/parbeszed-es-bolt-szerkeszto.md` átolvasása, az ábrák (`docs/img/*.svg`) olvashatók-e.

## Csomag (bundle): a valódi `npm run pull:shared` után (veszteségmentes PNG/WebP, `feature/bundle-webp`)
- [ ] **Előbb `npm run pull:shared -- --list`**, aztán a valódi futás. A futás végén kiírt táblázatban nézd meg: fájlok száma, WebP-k száma, bájt fajtánként, „PNG-opt” és „saved”; az összeg legyen nagyságrendileg a vártnál (nem a 67 MB-nál több).
- [ ] **`git status` / `git diff --stat` és a `public/` mérete** a commit előtt (`du`/Explorer): a csomag mérete elfogadható-e. **Csak egyszer commitold**, a formátum végleges állapotában: a git minden bináris változatot örökre megőriz.
- [ ] **A játék betölt** (`npm run dev`, vendég/inkognitó, `?shared=none` is): a csomagolt textúrák, matricák, felvehető tárgyak, állóképek és NPC-k megjelennek, a konzolban nincs 404 / kép-dekódolási hiba.
- [ ] **A textúrák ugyanúgy néznek ki** (veszteségmentes, pixelre azonos): 5–6 darab összevetve a szerkesztővel / a régi nézettel: közelről a diffuse, egy kivágott (átlátszó) szél, egy relief fal, egy normal-térképes fal a fejlámpa fényében, egy NPC.
- [ ] **Nincs hálózati kérés a csomagolt azonosítókra:** Network fül, szűrő a Supabase-projektre: a csomagolt id-k (`…_shared_…`) fájljai a saját helyi szerverről jönnek (`/textures/…`, `/shared-images/…`, `/shared-actors/…`), a Supabase-ra nem megy kép-kérés; a csomagolt textúráknál nincs „Auto” származtatás (nincs extra diffuse-letöltés, nincs CPU-csúcs).
- [ ] **A kiterjesztés igaz:** `public/textures/<id>/` mappában a `diffuse.webp` valóban WebP (a `sharedBuiltins.json` `files` mezője megegyezik a mappa tartalmával); a böngészőben a `.webp` fájlok `image/webp` típussal jönnek (Pages és a csomagolt `server.ps1`; a `start.sh` Python-szervere régi Pythonnal más típust adhat, de a kép betölt).
- [ ] **Másik böngésző / eszköz** (Safari 14+, mobil, a Switch-es böngészőmotor): a WebP-s textúrák betöltenek-e.

## Következő kérések / megjegyzések
- Törlés (Supabase) és automatikus mentés visszaállítása, a bolt/közzététel (H4/H5) még nincs tesztelve.
- Lehetséges utómunka: az Asset Manager bezárási figyelmeztetése csak a textúra-piszkozatokat számolja; a `bolt-ablak.svg` az egyszerű bolt-módra.
