# Ellenőrzési lista a felhasználónak (kézi tesztek, 2026-11-20)

Ezeket a Pages-es buildben vagy a helyi szerveren kell kipróbálni; a kód- és típusellenőrzés már lefutott, de futás közben nem volt tesztelve.
Pipálható lista: húzd ki, ami rendben van; ami nem, azt írd le (melyik lépésnél, mit láttál, a böngésző konzolja).

## Supabase (valódi tár)
- [ ] **Vendég-olvasás inkognitó ablakban:** `localhost:3000` → Network fül, szűrő a Supabase-projektre; 5–10 s után `GET …/void_map_heads?world=eq.fantasy` és `POST …/storage/v1/object/list/void-textures` **200**-zal (401 vagy üres lista = a `shared-public-read.sql` nem érvényesült).
- [ ] **Törlés** (a törlési szabály a `supabase/shared-texture-folders.sql`-ben): egy teszt-textúra törlése az Assets-ben tényleg eltűnik a tárból (a futtatásról nincs megerősítés).
- [ ] **Közzététel és visszatöltés:** egy új textúra, egy matrica és egy állókép közzététele, oldalfrissítés után látszik, vendégként is.
- [ ] **NPC WebP** (a `shared-webp-mime.sql` lefutott): NPC közzététele → a revízió mappájában `diffuse.webp` vagy `diffuse.png` (a kisebb) + `normal.png` + `meta.json` (`definition.diffuseFile`); újratöltés, vendégnézet, módosítás + újraközzététel.

## Szerkesztő
- [ ] **AI mélység** egy valódi textúrán (Assets → új textúra → AI mélység szakasz): az előnézet a helyes irányú reliefet mutatja (ha kifordított: Invertálás), a normal-jelölő, a Mégse gomb, oldalfrissítés után „Modell gyorsítótárban: gyors”.
- [ ] **Frissítés gomb** az Assets fejlécében: üzenetet ad (nincs beállítva / frissítve / bejelentkezés kell).
- [ ] **Sárga sáv:** a közzé nem tett képek listája, kattintásra a piszkozatra ugrik, a × elvet.
- [ ] **Új pálya párbeszéd** (helyszín + pálya), a pályalista helyszín szerinti csoportosítása, a belépési felirat.
- [ ] **Automatikus mentés visszaállítás-sávja:** szerkesztés → oldalfrissítés mentés nélkül → a visszaállítás-sáv.
- [ ] **Megemelt oldalfal** (Textúra, Matrica, fáklya) és a **tető propok** (belső sarok forgatva még nem volt látva).
- [ ] **Sötét fantasy utófeldolgozás** (Debug panel) a hue-szabályokkal, a maszk-nézettel; a teljesítménye.

## Játék
- [ ] **Esemény aktiválása Space-szel** (üzenet, boltablak, ajtó „Zárva”): normál játékban, 1–2 cellányira, a célkereszt az elemen (a CPU-terhelés miatti előző kudarc újrapróbálása).
- [ ] A **jelenet nem tűnik el és nem fagy** a vendég-automatikus betöltés után (az újraépítés csak akkor fut, ha a térkép használ megváltozott megosztott textúrát).
