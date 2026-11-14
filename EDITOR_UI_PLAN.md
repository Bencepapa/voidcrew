# Szerkesztő UI – átdolgozott terv

Alap: *3D Grid-Based Level Editor – UI/UX Tervdokumentáció* (PDF). Ez a
változat azt illeszti a valódi editorhoz (`src/editor/`, `EDITOR.md`): mit
tartunk meg, mit alakítunk át, mit hagyunk el, és milyen sorrendben építjük.

## 1. Röviden

- **Megtartjuk:** a felső fájl/eszköz/nézet sáv, a bal oldali kereshető
  asset-fa, a jobb oldali kontextusfüggő Inspector, az alsó állapotsor,
  a Select-alapú kijelölés (az Alt-os megfogás helyett), a rétegenkénti szem ikon, a debug leválasztása.
- **Átalakítjuk:** a tervben az eszköz és az asset egy dolog, a valóságban
  nem az (ige vs. főnév); a gizmo helyett elemfajtánkénti fogantyúk; a napló
  nem tűnhet el nyomtalanul (az editor ide írja a hibaüzeneteit); a minimap
  nagyítása már megvan, a terv kis minimapjával együtt kell élnie.
- **Elhagyjuk / későre tesszük:** univerzális 3 tengelyes forgató gizmo
  (csak a 3D propoknak van értelme, és ott is csak egy gyűrű), 3D „Topdown”
  kamera (a nagyított 2D térkép adja ugyanazt olcsóbban).
- **Új, a tervben nem szereplő igény:** objektumok megjelenítése a 2D
  térképen; kijelölt elem körvonala minden elemfajtára; az 5 másodperces
  „gyors előnézet → teljes újraépítés” állapot jelzése (megvan a mechanika,
  a visszajelzés hiányzik).

## 2. A terv értékelése pontról pontra

| A terv ötlete | Ítélet | Miért / mit változtatunk |
| --- | --- | --- |
| 4 zónás elrendezés (felső sáv, bal, jobb, alsó) | **Marad** | Ma egyetlen tolakodó gombrács van a jobb oldalon, a panelek a gombsorba ágyazva nyílnak (az ajtó panelje 15+ mezős). |
| Felső sáv: New / Load / Save / Download / Shared / Undo / Redo / Exit | **Marad** | Ma ezek a „Dig/Fill, Height…” gombok között vannak. Plusz: a mentetlen állapot jelzése (ma a `Save •`). |
| Kereső + kategóriafa a bal oldalon, miniatűrökkel | **Marad, átszervezve** | Lásd 5. Az asset-készlet már létezik (`PROP_TYPES`, `ACTOR_TYPES`, `ITEM_TYPES`, textúrák, decal-manifest), az Asset Manager ugyanezt mutatja. |
| Szem ikon rétegenként | **Marad, bővítve** | Ma csak NPC / részecske / prop / decal / item rejthető, és csak ha az adott eszköz aktív. Bővül: fények, ajtók, markerek. |
| Eszközök = a fa kategóriái | **Módosul** | Az ásás, magasság, festés, kijelölés *műveletek*, nem lerakható elemek; marad külön eszközsor. A fa elemére kattintás a „Lerak” eszközt aktiválja az elem fajtájával (mint Blenderben/Unityben). |
| Jobb oldali Inspector kijelölés szerint | **Marad, ez a legnagyobb nyereség** | Az `EditorBar`-ban már vannak a kijelölt elem adatai (`PropInfo`, `LightInfo`, …), csak a gombsorba ágyazva. Lásd 6. |
| „Map Settings” mint az Inspector alapnézete | **Marad** | A mai **Map** eszköz panelje (méret, új/mentés másként, fénysűrűség, relief, akcentus) + a debug panel MAP ATTRIBUTES / TEXTURE DEFAULTS / VARIATION & MOOD blokkjai. |
| Alsó, kétsoros állapotsor | **Marad, bővítve** | 3 sor értelmes: eszköz+kijelölés, üzenet, gyorsgombok. Itt jelenik meg a napló utolsó sora. Lásd 9. |
| Globális megfogás (Alt/Space) | **Elmarad: a Select az alapeszköz** | Lásd 7. A módosítók a szabványt követik. |
| 3D transzformációs gizmo | **Módosul** | Elemfajtánkénti fogantyúk. Lásd 8. |
| Körvonal a tárgyak körül | **Marad, minden elemfajtára** | Ma csak a célcella és a kijelölt fény/tárgy kap keretet. Lásd 8. |
| FPS / Topdown váltó | **Későbbre** | A nagyított minimap + objektumikonok kiváltja. Lásd 10. |
| Textured / Faces / Polygons gombok a felső sávban | **Marad, bővítve** | A viewportban már van: textured, faces, wireframe, **normals, depth** + kapcsolók (normal map, metal, glow, AO). A sávban a nézetváltó, a kapcsolók a Debugban. |
| Debug gomb a sáv jobb szélén | **Marad** | Graphics, Stats, Play & Testing, nézetek és kapcsolók ide. |
| Játéklog eltüntetése az editorból | **Módosul** | A log az editor hibaüzeneteit hordozza („Editor: can't fill in the cell the party stands in”). Állapotsor + előzményfiók. |

## 3. Mit csinál valójában a szerkesztő (igények)

Három különböző munkamenet van, mást kérnek a felülettől:

1. **Építés** (alaprajz): szobák, falsorok, magasságok, textúrák – nagy
   területeken, gyorsan. Eszköz: nagyított minimap + blokkjelölés
   (megvan), gyors lapos előnézet a 3D-ben (megvan).
2. **Berendezés** (3D-ben): propok, decalok, itemek, NPC-k, fények, részecskék
   – pontos helyen, forgatással, magassággal. Eszköz: 3D nézet + fa +
   Inspector. Itt fáj most a leginkább a kategóriaváltás.
3. **Logika** (mi mikor van ott): esély, linkek (`with` / `without`), NPC
   „until alert”, ajtózár/kód, terminálok, triggerek, exit/restricted/start.
   Eszköz: Inspector mezők + a 2D térkép (jelölők, útvonalak).

Meglévő mechanizmusok, amelyekre építünk: húzás+Ctrl másolat, Shift+húzás
(ajtó másik cellába), Ctrl+C/V, nyilak (nudge), PgUp/PgDn (magasság), R /
Shift+R (forgatás), Delete, Z/Y, Ctrl+S, Tab (be/ki), egérgörgő (forgatás),
Shift+kattintás (pontfény, járőrpont), Hide/Show réteg, Clear all, Asset
Manager, prop- és NPC-szerkesztő, a Map eszköz panelje, a zárt/chance mezők.

## 4. Elrendezés – két mód + mobil

Bármikor ugyanaz a felső sáv és az állapotsor; a középső rész módja a
nagyítás gombbal (⤢, vagy `M`) vált.

```
┌ Felső sáv ───────────────────────────────────────────────────────────────┐
│ New Load Save* Download Shared │ Select Dig Height Paint Place▾ Door.. │ │
│ Undo Redo Exit │            Textured/Faces/Wire/Normals/Depth │ Debug ?  │
├──────────────┬──────────────────────────────────────┬──────────────────┤
│ Minimap (kis)│                                      │ Inspector        │
│ ─────────────│            3D nézet                  │  (kijelölés vagy │
│ Asset-fa     │                                      │   Map Settings)  │
│ (keresés,    │                                      │                  │
│  szem ikonok)│                                      │                  │
├──────────────┴──────────────────────────────────────┴──────────────────┤
│ Eszköz · kijelölt elem · cella │ üzenet (log utolsó sora ▲) │ gyorsgombok │
└────────────────────────────────────────────────────────────────────────┘
        B) Berendezés mód (alap)

┌──────────────────────┬───────────────────────┬─────────────────────────┐
│ NAGY minimap         │ 3D nézet (keskenyebb) │ Inspector (keskeny)     │
│ húzás = blokk        │ gyors lapos előnézet  │                         │
│ ─────────────────────│                       │                         │
│ Blokk-sáv: Dig, Fill,│                       │                         │
│ ▲▼ padló/plafon,     │                       │                         │
│ Paint, ✕             │                       │                         │
└──────────────────────┴───────────────────────┴─────────────────────────┘
        A) Építés mód (a ⤢ gomb; megvan, a bal 40%)
```

- **Építés módban a fa elbújik** (szélességet kapna a térkép). Az Építés
  módban lerakni kívánt elemekhez a felső sáv „Place ▾” menüje marad.
- A **log** egyik módban sincs oszlopként; az állapotsor üzenetmezője és a
  felbukkanó előzménylista veszi át (200 sor, színkódolás később).
- **Szélesség:** 1024 px-en a B) mód három oszlopa szűk. Az Inspector és a fa
  összecsukható (a minimap-nagyításhoz hasonlóan), az összecsukott állapot
  megmarad.

## 5. Bal panel – asset-fa

Elv: a fa a **Lerak** eszköz palettája. Elemre kattintás = az elem fajtájának
Lerak-eszköze, ez az elem fegyverben. Kattintás a nézetben letesz egyet.

```
▾ Map Settings            (az Inspectort a térképre váltja)
▾ Textúrák          👁
    Fal · Padló · Plafon  (3 fül – a festés felületenként választ)
    + „Default” (a térkép saját textúrája)
▾ Propok            👁    3D · Billboard · Pillér/Chamfer
▾ Decalok           👁
▾ Itemek            👁
▾ NPC-k             👁
▾ Fények            👁    Mennyezeti · Pont · Effektek
▾ Részecskék        👁    Füst · Tűz · Gőz-fúvóka · Szikra (előbeállítások)
```

- **Ami nem asset, az az eszköztárban marad:** Dig/Fill, Height, Ladder,
  Bridge, Door (a fajtái a fában is megjelenhetnek), Chance wall, Start,
  Exit, Restricted. Ezeknek nincs „kép”, csak viselkedésük.
- **Keresés** a névben és a fajtában; „csak az aktív kategóriában” kapcsoló.
  Világ szerinti szűrés (sci-fi / fantasy) a meglévő `assetInWorld` szerint.
- **Miniatűrök:** a meglévő diffuse/portré képek (az Asset Manager már
  ugyanazokat használja); NPC-nél az idle-kocka.
- **Szem ikon:** réteg elrejtése a nézetből (a térkép megtartja). Bővítés:
  fények, ajtók, markerek (exit/restricted/start), részecske-jelölők.
- **Dupla kattintás** egy elemen: megnyílik az Asset Manager az elemre
  (textúra-finomhangolás, mapok, szemek) – nem kell külön gomb.
- A fa a ma 5 külön palettát (decal-, prop-, NPC-, item-gombsor, textúrasor)
  váltja ki; a kód már külön adatot ad mindegyikhez.

## 6. Jobb panel – Inspector

Kijelöléskor az adott elem mezői, egyébként a **Map Settings**. A mai
panelek mezői (az `EditorBar`-ból), fajtánként:

| Fajta | Mezők |
| --- | --- |
| Prop | típus, forgatás, magasság, léptéke, textúra, „Stack on top”, esély, linkek |
| Decal | felület, pozíció (px), forgatás, művelet (`terminal:<id>`, `lift`, `power`) |
| Item | típus, darabszám, magasság, esély, linkek |
| NPC | típus, irány (N/E/S/W), esély, „until alert” (dormant/fooled/arrive + gyakoriság/max), linkek, útvonal (törlés) |
| Fény | szín (Hue), erősség, hatótáv, pont/mennyezeti, magasság, bulb látszik, effekt, esély, linkek |
| Részecske | mennyiség, buborékméret, magasság, szín, esély, linkek, **Blow** (sebesség, irány, dőlés) |
| Ajtó | fajta, hely a járaton (Place + Back/Middle/Front), Flip, felirat, zár (kulcs, Hack, Code, Locked esély, Says), esély, linkek |
| Exit | név |
| Chance wall | esély, azonosító, with/without linkek |
| Start | irány (kattintásra 90°) |
| **Map Settings** | név, méret (+N/−N …), Map-választó, New / Save as, fénysűrűség, relief, akcentus; **MAP ATTRIBUTES** (anyag, AO, ambient, falmagasság), **LIGHTS**, **TEXTURE DEFAULTS**, **VARIATION & MOOD**, „Save to map” (render blokk) |

- A **közös mezők** (Chance, Linkek) egy „Logika” csoportban, mindenhol ugyanott
  – így tanulható.
- A tervbeli „Color / Intensity / Scale / Position” a Map Settings alatt
  tévedés volt: ezek elemmezők, a Map Settings mezői fent vannak.
- **Egyszerű / haladó:** a ritka mezők (zár-kód, wake, blow) összecsukott
  „Haladó” csoportban; a mai gombsor tele van velük.
- **Számmezők: húzható és átírható is (`NumberField`).** Egy közös komponens
  minden számértékre; a viselkedés a szokásos 3D-szerkesztőké (Blender,
  Unity, Godot):
  - *kattintás* (mozdulat nélkül) átírható szövegmezőt nyit; Enter
    elfogadja, Esc visszaállítja;
  - *vízszintes húzás* a mezőn állítja az értéket; 3 px alatt még kattintás;
  - *Shift + húzás* finom, *Ctrl + húzás* durva (vagy lépésre illeszkedő);
  - *↑ / ↓* és az egérgörgő (fókuszban) egy lépést ad;
  - *dupla kattintás a címkén* az alapértékre állít;
  - *egy húzás egy undo lépés* (az `applyEdit` összevonó kulcsával, mint ma
    a csúszkák).

| Érték | Megjelenés |
| --- | --- |
| Zárt tartomány (Chance 0–100 %, Intensity, Range, Amount, Relief, Normal force) | **Csúszkamező**: a szám mögött vékony kitöltősáv, húzásra állítható, kattintásra átírható |
| Nyílt / nagy tartomány (Height, Rotation, Scale, pozíció, Place) | **Csak húzható szám**, sáv nélkül |
| Fix lista (Type, Texture, Direction, Effect) | legördülő |
| Igen / nem | jelölőnégyzet |
| Szín (Hue) | színminta + színválasztó |

Mértékegység a mezőben (°, %, ×, cell), tartomány és lépésköz paraméter.
A csúszkamező ugyanaz a komponens `min`/`max`-szal. A Codex mockupjain a
mezők még sima szövegdobozok; a következő körben a csúszkamezőt is meg
kell rajzolni.
- **Több elem kijelölése** (később): közös mezők (esély, magasság) együtt
  állíthatók; nélküle a blokkjelölés a 2D térképen elég.

## 7. Kijelölés és módosítók – a szabványt követjük (döntés)

Döntés: a **Select az alapeszköz**, a módosítók és gyorsbillentyűk a
megszokott szerkesztőket követik (3ds Max, Unity, Blender, Tiled), nem saját
találmányok. Ezzel az Alt-os „globális megfogás” szükségtelen: a Select
eszköz eleve bármit megfog, a kategóriavédelem csak a Lerak / Dig / Height
eszközökben marad (ott a kattintás letesz vagy szerkeszt, nem választ).

- **Select (Q), az alapértelmezett:** kattintás kijelöl (a legközelebbi elem a
  kurzor alatt: NPC > item > prop > decal > fény > felület), húzás elmozdítja,
  Delete töröl. Az Inspector követi.
- **Egy kijelölés:** ma kilenc külön `useState` (`selectedProp`,
  `selectedDecal`, …) van. Egy `selection` állapotra (és később több elemre)
  cseréljük.
- **Érintőképernyőn** nincs módosító: Select-gomb, hosszú nyomás = Ctrl+kattintás.

**Billentyűk és egérmódosítók (javaslat; a mai kiosztást felülírja, ahol eltér)**

| Mit | Billentyű | Szabvány | Ma |
| --- | --- | --- | --- |
| Kijelölés | kattintás | mind | (eszközfüggő) |
| Hozzáadás / kivétel a kijelöléshez | Ctrl+kattintás | 3ds Max, Unity | – |
| Kivétel a kijelölésből | Alt+kattintás | 3ds Max | – |
| Összes / fordított kijelölés | Ctrl+A / Ctrl+I | 3ds Max | – |
| Kijelölés zárolása | Space | 3ds Max | – |
| Klónozás húzással | Shift+húzás | 3ds Max | Ctrl+húzás |
| Duplikálás helyben | Ctrl+D | Unity, Tiled | – |
| Másolás / kivágás / beillesztés | Ctrl+C / X / V | mind | Ctrl+C / V |
| Törlés | Delete | mind | Delete |
| Visszavonás / újra | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) | mind | Z / Y |
| Mentés / Mentés másként | Ctrl+S / Ctrl+Shift+S | mind | Ctrl+S |
| Eszközök | Q Select · W Mozgat · E Forgat · B Lerak (stamp) · D Dig/Fill · H Height · T Textúra | 3ds Max / Unity (QWER), Tiled (B) | – |
| Forgatás 90° / finom | E / Shift+E (kijelölve) | Unity (E) | R / Shift+R |
| Rács-illesztés ki/be | S | 3ds Max | – |
| Fókusz a kijelöltre | F | Unity, Blender | – |
| Nagyított minimap | M | – | gomb |
| Szerkesztő be/ki | Tab | – | Tab |
| Pan | középső gomb vagy Space+húzás (2D térkép) | Tiled | – |
| Nagyítás | görgő (2D térkép: Ctrl+görgő) | Tiled | – |

- **Az Alt egyetlen jelentést kap** (kivétel a kijelölésből, 3ds Max), így
  nem ütközik a böngésző menüjével sem.
- **Ajtó húzása:** nincs külön módosító: a húzás a járat mentén csúsztat, és
  a cella szélén túl a szomszéd (alkalmas) cellába viszi; a Shift ezért
  felszabadul klónozásra.
- **Áttérés:** egy ideig a régi billentyűk is működnek (Z/Y, R, Ctrl+húzás),
  a súgóban „régi” jelöléssel; a következő kiadásban kikerülnek.

## 8. Körvonal és fogantyúk (a gizmo helyett)

A térben a rács és a megkötések miatt az elemeknek kevés szabadságfoka van,
ezért **elemfajtánkénti fogantyú** értelmes, nem univerzális gizmo:

| Elem | Szabadságfok a játékban | Körvonal | Fogantyú |
| --- | --- | --- | --- |
| **3D prop** | cella + horgony/offset, **csak függőleges tengely körüli forgatás**, magasság, lépték | a `size` szerinti, forgatott doboz | **egy gyűrű** (forgatás 15°/90°-os lépéssel), fel-le nyíl (magasság), húzás a padlón |
| Fali prop | oldal + magasság | a fal síkján keret | húzás a falon, fel-le nyíl |
| **Decal** | felület, px, forgatás a felületen | a felületi téglalap | sarok-fogantyú (forgatás), húzás a felületen |
| Item | cella, offset, magasság | kis doboz | húzás, fel-le nyíl |
| **NPC** | cella, irány (4), útvonal | talp-gyűrű | **irány-nyilak** (N/E/S/W), útvonalpontok húzhatók, Shift+kattintás új pont |
| Fény | cella, pozíció, hatótáv, szín | égő jelölő + hatótáv-gömb (drótváz) | magasság-nyíl, hatótáv-fogantyú |
| Részecske | cella, pozíció, fúvás iránya/dőlése | jelölő | **fúvás-nyíl** csúcsa húzható (irány + dőlés) |
| Ajtó | cella, hely a járaton, irány | a sík kerete | **csúszka-nyíl** a járat mentén, Flip gomb |
| Exit / Restricted / Start / Chance wall | cella | a padló fényes sávja, Start: nyíl | kattintásra állítható |
| Létra / híd | cella + oldal / tengely | élvonal / sáv | — |

- **Körvonal minden kijelölt (és fakó a rámutatott) elemre**, a kategória
  színével, ugyanaz a szín a 2D térképen és a fában. A meglévő
  `editBox`/`selectBox` vonalas mechanizmusra épül.
- **Forgató gizmo:** csak 3D propnál, egyetlen gyűrű. A többi elemnek nincs
  értelme (a motor nem tud más tengelyeket).
- A húzás a mai **drag-and-drop** (grab offset, ceiling lamps, door
  slide) marad; a fogantyúk ugyanazt a kódot hívják.

## 9. Állapotsor és üzenetek

- **1. sor:** aktív eszköz · kijelölt elem (típus + cella) · hover cella/oldal
  (ma a minimap fölötti „Click: dig / fill (right) the FLOOR”).
- **2. sor:** az eszköz gyorsgombjai (kontextusfüggő, nem fix).
- **Üzenetmező:** a legutóbbi log-sor (hibák színezve); ▲ az előzményt nyitja
  (200 sor). A későbbi színkódolás (gyógyítás/sebzés) a játéklognál marad.
- **Állapotjelzők:** `Save •` (mentetlen), „előnézet… újraépül 5 s” (a gyors
  lapos előnézet alatt, ma nincs jelezve), FPS.

## 10. Minimap és a „topdown”

- **Megvan:** nagyítás (⤢), blokkjelölés húzással, Dig/Fill/Height/Paint a
  blokkra, 5 másodperces gyors előnézet.
- **Kell:** objektumikonok a térképen (propok, fények, NPC-k, item,
  részecske, ajtó, exit, start, restricted), kattintásra kijelölés, húzásra
  áthelyezés cellák között, NPC-útvonal rajzolása; réteg-szem ikonok itt is.
  Így az olcsó „Topdown” megvan, 3D-s felülnézet-kamera nélkül.
- **Nagy pályák:** pan és zoom (kerék / csípés) – ma a térkép mindig teljes
  méretben fér ki; 32×32 fölött nem lesz elég.
- **3D Topdown (döntés: kell, kísérlet fut).** Texturázáshoz és nagyobb
  terület átlátásához, akár falakon át: a plafon el, a kamera fent, a
  görgő zoomol, WASD / nyilak / középső gomb mozog, a tárgyak megfoghatók és
  áthelyezhetők (a tárgyak és az eszközök ugyanúgy működnek, mert a kijelölés
  sugárkövetéssel megy). Első változat megvan (`O` billentyű vagy a
  nézet bal alsó gombja; `GameViewport.tsx`): perspektív kamera lefelé
  nézve (Ctrl+görgő: dőlés, Q/E: forgatás), plafon és látótávolsági
  vágás ki, a falak sötét áttetsző „sapkák”. Mérni kell: teljes térképnél
  a háromszög- és rajzhívás-szám, és a falak olvashatósága felülről.
- **Padlótextúra a minimapon:** a cellák a padló textúrájával (minta-kitöltés,
  olcsó) és fölötte a magasság-árnyalat; így a minimap is használható
  festésre. A falak textúrája és a bevilágítás csak a 3D-ben (top-down)
  látszik rendesen.

## 11. Fájlműveletek és Debug

- **Felső sáv balra:** New, Load (map-választó), Save (dev: lemezre; máshol
  letöltés), Download, Shared Maps (a bejelentkezés és a feltöltés modális
  ablakban). A **Save as…** a Map Settings alján.
- **Debug (jobb szélen, lenyíló fiók):** Graphics (preset, felbontás, fények…),
  nézetek és **kapcsolók** (normal map, metal, glow, AO), Stats, Play &
  Testing (noclip, halhatatlan, …), „Save to map”. A nézetváltó (Textured /
  Faces / Wire / Normals / Depth) a felső sávba is kerül.
- **Szerkesztés közbeni sebesség:** az editor elindulásakor a Graphics
  alapból az olcsóbb beállítást ajánlhatja (pl. kikapcsolt AA, kevesebb
  pooled fény) – a vég-nézet a „Textured” teljes beállítással van.

## 12. Mobil

- Alsó eszköztár (ma is ott van), az Inspector **alsó lap** (a kijelölésre
  nyílik), az asset-fa **fiók**, a térkép teljes képernyős nagyítás.
- Select-gomb + hosszú nyomás = Alt; nincs billentyű-függés.
- Blokkjelölés a nagy térképen ujjal (két ujj: pan/zoom).

## 13. Sorrend (építési lépések)

Ami kész: tool-onkénti drag-and-drop, Ctrl+C/V, nagyított minimap +
blokkműveletek, gyors előnézet + 5 mp-es teljes újraépítés, Asset Manager,
nézetek és kapcsolók a viewportban.

| # | Lépés | Függ | Méret | Nyereség |
| --- | --- | --- | --- | --- |
| 0 | **i18n alap:** `t()`, magyar/angol lista, nyelvváltó (15. pont) | – | kicsi (a váz), nagy (a szövegek átemelése, fokozatosan) | magyarul értő szerkesztők |
| 1 | **Elrendezés-váz:** felső sáv, állapotsor üzenetmezővel, Debug-fiók, log elbújik; a gombrács a felső sávba | – | közepes | a munkaterület és a rend azonnal |
| 2 | **Inspector + `NumberField`:** a panelek (`EditorBar`) kiemelése, kijelölés szerinti váltás, Map Settings, húzható/átírható számmezők | 1 | nagy | a legnagyobb ergonómiai nyereség |
| 3 | **Egy `selection` állapot + Select eszköz + Alt** | 2 | közepes–nagy | vége a kategóriaváltásnak |
| 4 | **Körvonalak minden elemre** + hover | 3 | közepes | olvasható kijelölés |
| 5 | **Fogantyúk** (yaw-gyűrű, magasságnyíl, irány-nyilak, fúvás-nyíl, ajtó-csúszka) | 3, 4 | nagy (fajtánként kicsi) | pontos finomhangolás |
| 6 | **Asset-fa:** keresés, szem ikonok, dupla kattintás → Asset Manager | 1 | közepes | a palettasorok kiváltása |
| 7 | **2D objektumikonok**, áthelyezés, pan/zoom nagy pályákra | 3 | közepes | felülnézeti szerkesztés |
| 8 | Mobil (alsó lap, fiók) | 2, 6 | közepes | tablet/telefon |
| 9 | Több elem kijelölése, 3D topdown | 3, 7 | – | ha kell |

Az 1–3 lépés egymás után a kulcs; a 4–6 párhuzamosítható (külön fájlok).

### Kapu minden lépés után (döntés)

Mielőtt a következő lépésnek nekikezdünk, az éppen elkészült szerkesztői
funkciókat **a sci-fi világban is** megnézzük (Debug › World, vagy egy
hajó-térkép), nem csak a fantasyban. Az editor saját stílusú és nem a játék
UI-jára épül, ezért a felület nem szokott gondot okozni – a **háttér** viszont
más (világos, szürke-zöld fém a fantasy barna-narancs kövei helyett), és ez a
félig átlátszó ikonokat, a körvonalakat és a feliratokat érinti.

Ellenőrzőlista (lépésenként, képernyőképekkel a `concept/editor-ui/checks/<lépés>/`
mappába):

- [ ] **Ikonok jól látszanak** világos és sötét háttér előtt is (kontraszt, a
      félig átlátszó panel mögött is), az aktív állapot felismerhető.
- [ ] **Szövegek olvashatók** mindkét világban és **mindkét nyelven** (a
      magyar szöveg hosszabb: nem csúszik ki, nem tördelődik rondán).
- [ ] **Körvonalak és jelölések** (kijelölés, hover, fogantyúk, blokkjelölés,
      a top-down sapkák) elkülönülnek a sci-fi textúráktól is (nem olvad bele
      a szürke falba vagy a zöldes padlóba).
- [ ] **Log színek** (szerkesztő, hiba) olvashatók a log hátterén.
- [ ] **1440×860 és 1024×768** méreten, és ahol a lépés érinti: mobil.
- [ ] **Teljesítmény:** a lépés ne lassítsa a szerkesztést a nagyobb sci-fi
      deckeken sem (FPS a Stats-ban).
- [ ] Ami nem jó, a következő lépés előtt javul; a javítás is a kapu része.

A kapu eredménye egy-két mondat és a képek a lépés commitjában vagy a
leírásában. Ha a sci-fi világ egy eszközhöz hiányos (pl. nincs a világhoz
asset), az is bekerül a jegyzetbe.

## 14. Amit eddig kihagytunk (felvetve, nincs eldöntve)

1. **Hibák / figyelmeztetések panel.** A térképbetöltő ma csak a szerkesztés
   pillanatában utasít vissza („nem lehet…”). Hasznos lenne egy
   „Problémák” lista a térképre: nincs start, nem elérhető terület, zár
   kulcs nélkül, link olyan azonosítóra, ami nincs, terminál kód nélkül.
2. **Link- és flag-választók.** A `with` / `without`, zárkulcs, terminál- és
   trigger-azonosítók ma szövegmezők. Legyen legördülő a térkép meglévő
   azonosítóiból (és „új azonosító…”).
3. **Variációs előnézet.** Az elemek `chance` értéke csak futáskor derül
   ki. Az editorban egy „seed” mező + gomb: a térkép ahogy az adott
   variációban kinézne, a kihagyott elemek halványan.
4. **Kamera.** Fókusz a kijelöltre (F), kameralépték (repülési sebesség),
   „ugorj ide” a minimap kattintására, mentett kamerapontok; „Test from
   here” (az EDITOR.md-ben tervezett) a felső sávba.
5. **Parancspaletta** (Ctrl+K vagy `/`): eszköz, asset, térkép gyors
   keresése névre; a fa keresőjének általánosítása.
6. **Rétegzár** a rejtés mellett: egy réteg látszik, de nem fogható meg (pl.
   a falmatricák, amíg a propokat rendezed).
7. **Asset-kedvencek és legutóbbiak** a fa tetején; ugyanaz a sor a
   gyorsmenüben (C változat).
8. **Előzmény-lista** (undo-lista nevekkel: „Dig 15 cells”, „Floor ▲”), nem
   csak Z/Y: a blokkműveleteknél látni kell, mi mit csinált.
9. **Billentyűtérkép és súgó** (a `?` ikon mögött): minden gyorsbillentyű egy
   helyen, eszközönként; később átállítható.
10. **Történet-szerkesztés helye.** A terminálok, triggerek és a tervezett
    jelenet-/párbeszéd-rendszer (STORY.md) ma kézzel írt JSON. Az Inspector és
    a fa „Logic” kategóriája hely marad nekik, hogy később ne kelljen újraépíteni.
11. **Automatikus mentés / helyreállítás** és közös térképek ütközése (Shared
    maps): a „Save •” jelzés mellé „utoljára mentve” és egy helyreállítási
    pont.
12. **Elérhetőség:** a körvonal ne csak színnel különbözzön (vonaltípus /
    ikon is), a tooltipekben a gyorsbillentyű, a kontraszt a
    képernyőképek fölött is megfelelő legyen.

## 15. Nyelv: magyar és angol felület

Igény: a szerkesztők közül nem mindenki tud jól angolul, ezért az editor
(később a játék) UI-ja magyarul és angolul is menjen.

- **Kapcsoló:** egy kis `HU | EN` váltó a **Settings** (ma: a Debug panel
  teteje) alatt, nem kiemelt helyen (döntés). Az első indításkor a böngésző
  nyelve (`navigator.language`) dönt, utána a választás megmarad
  (`localStorage`). Váltás újratöltés nélkül.
- **Szöveglista:** `src/i18n/en.ts` és `src/i18n/hu.ts`, azonos kulcsokkal;
  a magyar hiányzó kulcsa angolra esik vissza. Típusos kulcsok: ha egy kulcs
  az egyikből hiányzik, a TypeScript szól. Használat: `t("tool.dig")`,
  paraméterrel: `t("edit.filled", { n: 15 })`.
- **Mi fordítandó:** az `EditorBar` és a többi panel címkéi és tooltipjei
  (kb. 40 `title`, több száz címke), a Debug panel, az Asset Manager, a
  státuszsor, **a naplóüzenetek** („Editor: …”, kb. 50 `pushLog` hívás –
  ezek mondatok, paraméterekkel), a gombok és a hibaüzenetek (a térképbetöltő
  visszautasításai is).
- **Asset-nevek:** a `label` mezők (textúrák, propok, NPC-k, itemek) ma
  angol szövegek. Kapjanak `{ en, hu }` alakot, vagy a kulcsuk legyen az
  i18n listában; keresés mindkét nyelven működjön (a fa kereshessen
  magyar és angol névre is).
- **Szakszótár (javaslat, egyeztetni kell):** Dig = Ásás, Fill = Betömés,
  Height = Magasság, Floor / Ceiling = Padló / Plafon, Wall = Fal, Paint /
  Texture = Festés / Textúra, Prop = Tárgy (berendezés), Item = Felszedhető
  tárgy, Decal = Matrica, Light = Fény, Particles = Részecskék, Chance =
  Esély, Inspector = Tulajdonságok, Undo / Redo = Visszavonás / Újra.
- **Tartalom ≠ felület:** a térképek szövegei (ajtófelirat, terminál,
  történet, `Says`) a *tartalom*, nem a UI. A történeti rendszer (STORY.md)
  külön dönt a lokalizációról; itt csak a felület nyelve szerepel.
- **Elrendezés:** a magyar szöveg kb. 20–30%-kal hosszabb. Ezért az
  ikon-alapú, tooltipes felső sáv és a rugalmas mezők (nem fix szélességű
  gombok) a megoldás; a mockupokat magyar feliratokkal is ellenőrizni kell.
- **Betű:** a használt betűtípusoknak tudniuk kell az ő, ű, Ő, Ű karaktereket
  (a Segoe UI és a monospace-ek tudják; a játék betűtípusa még
  ellenőrizendő), a számokban a tizedesvessző/pont a nyelv szerint (ma a
  prop-szerkesztő már vesszőt mutat a magyar gépen).
- **Sorrend:** ez a **0. lépés**: az i18n váltó és a `t()` a többi lépés
  előtt kerül be, hogy az új komponensek (Inspector, `NumberField`, fa) már
  fordítható szöveggel szülessenek. A meglévő szövegek átemelése fokozatosan
  megy, panelenként.

## 16. Döntések

Eldöntve:

1. **Select az alapeszköz** (Q).
2. **Módosítók és billentyűk a szabványt követik** (3ds Max, Unity, Tiled) –
   a 7. pont táblázata; az Alt-os globális megfogás elmarad.
3. **Ctrl+Z / Ctrl+Y** a szabvány (a Z / Y átmenetileg marad).
4. **A nyelvváltó a Settingsben van**, nem kiemelve.

Nyitott:

5. ~~3D Topdown~~ – eldöntve: kell, a kísérlet megvan (10. pont).
6. **Napló:** elég az állapotsor üzenetmező + előzményfiók, vagy kell fix
   hely is?
7. **Világ-specifikus paletták** (sci-fi / fantasy): a fa mindig csak az aktív
   világot mutassa (ma így van), vagy kapcsolóval mindkettőt?
8. **Magyar szakszótár** (a 15. pont) jóváhagyása a szerkesztőkkel.
