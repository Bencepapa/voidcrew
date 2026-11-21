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
- [ ] **Magyar útmutatók:** `docs/twine-utmutato.md` és `docs/parbeszed-es-bolt-szerkeszto.md` átolvasása, az ábrák (`docs/img/*.svg`) olvashatók-e.

## Következő kérések / megjegyzések
- Törlés (Supabase) és automatikus mentés visszaállítása, a bolt/közzététel (H4/H5) még nincs tesztelve.
- Lehetséges utómunka: az Asset Manager bezárási figyelmeztetése csak a textúra-piszkozatokat számolja; a `bolt-ablak.svg` az egyszerű bolt-módra.
