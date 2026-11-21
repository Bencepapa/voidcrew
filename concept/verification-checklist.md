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

## Következő kérések / megjegyzések
- Tető propok: autotile kell hozzájuk (később).
- Bolt-ablak nyitva: a világ nem állt meg (javítás: feature/shoppause).
- Esemény kijelölése a térképen + Delete (feature/evtsel).
- Törlés (Supabase) és automatikus mentés visszaállítása, a bolt/közzététel (H4/H5) még nincs tesztelve.
