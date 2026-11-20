# Párbeszéd (Twine), bolt és kézi inventory (terv, 2026-11-20)

A handover H pontjának kibontása: NPC-párbeszéd Twine-ban szerkesztve, a „Vásárlás” választás **parancsa** egy bolt-ablakot nyit, abban a csapat
és a bolt készlete között húzással mozognak a tárgyak, és minden csapattag két keze (bal, jobb) kis négyszögletes dobozban mutatja a tartott tárgyat.

## 0. Mi van ma (a kódból)

- **Események:** `src/game/interactions.ts` (`Interaction`: `message` és `image`, falra/ajtóra/propra/matricára/tárgyra tehető), a felugró ablak
  `src/components/InteractionPopup.tsx` (szöveg, opcionális kép, egy „Bezár” gomb; `modal` megállítja a mozgást).
- **Csapat:** `Crewmate` (`src/game/types.ts`): csak név, szerep, HP, EN. **Nincs inventory és nincs kéz.**
- **Zsákmány:** `haul` (`useGameState`, `HaulPanel`): a futás alatt gyűjtött tárgyak darabszáma és értéke (`ITEM_TYPES`, `cr` = kredit), a bázison eladva.
- **Fegyver:** csapattagonként egy fegyvergomb (`[1] Throwing spear`), a fegyverek a `meta.ts`-ben vásárolhatók.
- **NPC-k:** ellenséges aktorok; a „vándorló, barátságos” NPC fogalom még nincs.

## 1. Twine formátum (végleges szabályok)

Szerkesztés **Twine 2.6+**-ban, az export **Twee 3** (*Build → Export as Twee*). A story formátum mindegy (a Harlowe/SugarCube makrókat nem
értelmezzük, szövegként maradnak). Minta: `concept/dialogue/samples/void-fantasy.twee`, hibás minta: `invalid-duplicate.twee`.

- **Egy `.twee` fájl = egy párbeszéd-KÖNYVTÁR** (egy Twine-story). A passzusnevek a fájlon belül globálisak, **több NPC osztozik a passzusokon**
  (pl. egy közös „Goodbye”). **Nincs név-előtag**-konvenció. Ugyanaz a passzusnév kétszer **hiba** (a Twine sem engedi, de kézzel összefésült fájlban előfordul).
- **Belépő passzusok:** a `start` címkéjű passzusok (és az egy `Start` nevű). Az NPC később kiválaszt egy belépőt (pl. „Wizard in town”). A StoryData `start`
  mezőjét figyelmen kívül hagyjuk (üres passzusra mutathat). A címke nélküli passzus normális.
- **Fejléc:** `:: Név [címke1 címke2] {"position":...}`; a név tartalmazhat `/`, szóközt, `!`, `'` jelet, a `\[ \] \{ \}` escape-elhető. `:: StoryTitle` a könyvtár
  címe, `:: StoryData` (JSON) nem passzus.
- **Passzus törzse** (CRLF/LF és BOM rendben):
  - **Választás** = Twine link: `[[felirat->cél]]`, `[[cél<-felirat]]`, `[[felirat|cél]]`, `[[cél]]`; a szövegből kikerül.
  - **Parancs** = olyan sor, aminek a trimmelt szövege `@`-gal kezdődik; a szövegből kikerül, a passzus megnyitásakor sorban lefut:
    - `@end`: a párbeszéd bezárása.
    - `@shop <bolt-azonosító>`: bolt-ablak (lásd 4.); `@shop` azonosító nélkül = **az NPC saját boltja**. A bolt után a párbeszéd a passzus választásaival folytatódik.
    - később: `@give`, `@take`, `@set`, `@if`, `@gold`.
  - minden más sor a passzus **szövege** (a szélén az üres sorok levágva, belül a bekezdések maradnak).
- **Ellenőrzés** (importkor és a Dialogues tesztablakban; `src/game/dialogue.ts`):
  - **HIBA:** duplikált passzusnév, törött link (a cél nem létezik), nincs belépő passzus.
  - **FIGYELMEZTETÉS:** ismeretlen parancs (pl. `@wave`, `{kind:"unknown"}`-ként megmarad), `@shop` olyan azonosítóval, ami nincs az (opcionális) ismert boltok között,
    minden belépőből elérhetetlen passzus (az üres „Untitled Passage” némán kimarad), belépő passzus választás és `@end` nélkül (zsákutca), üres szövegű és választás nélküli passzus.
- **Nyelv:** egy `.twee` egy nyelvre (a fájlnév vagy egy `[hu]` címke jelzi); a játék a felület nyelvének megfelelőt tölti, ennek hiányában az angolt.

## 2. Adatmodell

- **Párbeszéd-könyvtár** (a `.twee`-ből fordítva; később megosztott tartalom, Assets v3 `type: "dialogue"`): `{ id, title, entries: string[], passages: { [név]: { name, tags, text, choices: [{label, to}], commands } } }`,
  parancs: `{kind:"end"} | {kind:"shop", shop?} | {kind:"unknown", raw}`. Az eredeti `.twee` is mellette marad (újraszerkeszthető). Az `id` a fájlnév slugja.
  Az Asset Managerben új kategória: **Párbeszédek** (`+ Új` = `.twee` feltöltése vagy beillesztése, ellenőrzés, **tesztablak**); H1-ben csak helyi vázlat (IndexedDB), kiadás nélkül.
- **Bolt** (megosztott tartalom, `type: "shop"`): `{ id, name, portrait?, stock: [{ item, price?, qty }], buyRate, sellRate }`. A készletet az Asset Managerben szerkeszted
  (a Twine nem készletet ír, csak a `@shop id` parancsot).
- **NPC:** a lehelyezett NPC kap egy `dialogue` mezőt (könyvtár-azonosító) **és egy belépő passzust** (`entry`, a könyvtár `start` passzusai közül), egy `portrait` mezőt (állókép, cél: portré), valamint
  egy saját boltot (a `@shop` azonosító nélkül ezt nyitja); az NPC `friendly` jelzőt kap (nem támad, a Használat/Space megszólítja).
- **Esemény:** az `Interaction` kap egy harmadik fajtát: `dialogue` (`{ dialogue: id, entry }`), így falra, ajtóra, propra is tehető, nem csak NPC-re (pl. egy tábla vagy egy bolt pultja).

## 3. Párbeszéd-ablak

A `InteractionPopup` mintájára (modal, a világ megáll): bal oldalt a **portré**, mellette az NPC-szöveg, alatta a választások gombokként. Egér és billentyűzet:
**1–9** vagy fel/le + Enter, Esc = Viszlát (ha van `@end`-es út) vagy bezár. A választás a következő passzusra lép, a parancsok sorban futnak le.

## 4. Bolt-ablak és inventory

**A cél:** a `@shop` parancs után két rács (**Bolt** és **Csapat**), a játékteret részben letakarva, **de a csapat avatarjai (alul) látszanak**, hogy a tárgyat
rögtön a kezükbe lehessen húzni.

- **Csapat-inventory:** a csapat közös hátizsákja, rács (cellák, halmozható tárgyak, kapacitás). Ez váltja a mai `haul` darabszám-listát (átmenet: a haul tárgyai a hátizsákba kerülnek).
- **Kezek:** csapattagonként **bal és jobb kéz**, négyszögletes kis doboz a tartott tárgy képével az avatar mellett. Tárgyat a hátizsákból vagy a boltból **a kéz-dobozra húzva** adsz a kezébe (a fegyver a kézben
  lévő tárgy lesz; a mai `[1] Throwing spear` gomb a jobb kéz tartalmát használja). Kétkezes tárgy mindkét kezet foglalja.
- **Húzás:** vásárlás = a bolt rácsából a csapat rácsába / egy kézbe (a kredit levonódik); eladás = a csapatból a bolt rácsába (a kredit jóváíródik). Egy kattintásos gyorsmozgatás és billentyűs
  használat (az egér nélküli játékhoz) kell. Az ár `price` vagy az `ITEM_TYPES` értéke × `buyRate`/`sellRate`. A bolt készlete a munkamenet alatt csökken/nő (kezdetben nem mentődik).
- **Első változatban** a bolt üres is lehet, de **egy tárgy** legyen benne a húzás kipróbálásához.

## 5. Építési sorrend

1. **H1 – Twine-tábla (KÉSZ):** a `.twee` olvasó (tiszta függvény, tesztekkel), a párbeszéd-adat és az ellenőrző, az Asset Manager „Párbeszédek” kategória a feltöltéssel és a tesztablakkal. *(OpenCode/Sonnet medium)*
2. **H2 – Párbeszéd-ablak és barátságos NPC:** `dialogue` esemény, portré, választások, `@end`; az NPC `friendly` viselkedés és a Használat/Space megszólítás; az NPC-szerkesztő mezői. *(Sonnet medium)*
3. **H3 – Inventory-modell és UI:** hátizsák, kezek, húzás hátizsák és kéz között, a fegyverek összekötése a kézzel, a haul átvezetése. Mentés. *(Sonnet high: a legnagyobb)*
4. **H4 – Bolt:** bolt-adat az Asset Managerben, `@shop`, bolt-ablak, vétel/eladás húzással, kredit. *(Sonnet medium)*
5. **H5 – Kiadás:** a párbeszédek, boltok és NPC-portrék a `pull:shared` csomagba.

## 6. Nyitott kérdések (a Twine-mintád után véglegesítjük)

- Valóban `@parancs` sorok legyenek, vagy valami Twine-barátabb (pl. passzus-címke `shop` + a bolt neve a szövegben, vagy link-felirat konvenció)?
- A „Viszlát” legyen külön gomb a keretben, vagy csak a Twine-ból jöjjön?
- Hány hely a hátizsákban, és vannak-e súly- vagy méret-szabályok? Mi számít kétkezesnek?
- A kreditek (`cr`) kerüljenek a hátizsákba mint tárgy, vagy külön csapatszámláló marad?
- Kinek a készlete a bolt: egy globális bolt-azonosító (minden példány osztozik), vagy NPC-nként külön példány?
- Hol tároljuk a „már beszélt vele” és hasonló állapotokat (a `@set` kulcsok): a mentésben, térképenként?
