# Globális kereső és helyzetfüggő súgó

## Felület

- Az első szerkesztőnyitáskor a nézet tetején rövid **Keresés mindenhol** sáv látszik. Kattintásra nagyobb kereső nyílik. Később a lebegő eszköztár nagyítója bármikor megnyitja.
- A kereső szerkesztő módban a Ctrl+P és Ctrl+Shift+F kombinációt is kezeli. A Ctrl+Space is választható. A böngésző által átadott eseményt kezeljük, a játékvezérlés és a többi modális ablak billentyűi megmaradnak. Edge-ben és Chrome-ban ellenőrizzük a böngészőnyomtatással való ütközést. A nagyító mindig elérhető.
- Üres keresésnél a tíz legutóbbi lekérdezés és a hozzájuk kiválasztott találat jelenik meg. Enterrel újra megnyitható az utolsó célpont. Az előzmények helyi böngészőtárba kerülnek, törölhetők, és az ismételt keresés előresorolja ugyanazt a bejegyzést.
- A találatok eszközt, assetet, konkrét beállítást, dokumentációs fejezetet, videót vagy kiadási megjegyzést jelölnek. A találat megnyithatja a panelt, kibonthatja a csoportot, odagörgethet és röviden kiemelheti a vezérlőt. A cél mellett maradhat **Tipp** és **Példák**. A navigáció önmagában nem módosítja a pályát.
- A gyorskereső a gyakorlott szerkesztők napi navigációja is. A nyilakkal és Enterrel gyorsan elérhető egy visszatérő eszköz vagy beállítás, az Esc visszaadja a fókuszt.

## Találatok és dokumentáció

- Magyar felület és magyar súgó, magyar és angol keresés. Ékezet nélküli egyezés, szótöredék és kisebb elírások. A címek, szinonimák és korábbi nevek többet érnek a hosszabb leírás szövegében talált egyezésnél. Az aktuális világ finoman súlyozza a sorrendet.
- A beépített és már betöltött megosztott assetek a meglévő katalógusokból jönnek. A célpontok stabil azonosítót kapnak. Új vagy átköltözött funkció a releváns régi keresőkifejezésre megjelenik, a kapcsolódó új célpontra mutatva.
- A GitHubon készülő magyar útmutatók fejezetre mutató linket, képeket és gyakorlati példákat kapnak. A meglévő YouTube-videók is kerüljenek be a találatok közé címmel, témával és ahol hasznos, időbélyeggel. A kereső helyi címeket és összefoglalókat indexel, a külső anyagot megnyitáskor tölti be.
- A changelog egy-két mondatos összefoglalói kereshetők. Alapból statikus információként jelennek meg verzióval. Külön **Megnyitás** kapcsolható hozzájuk, ha van konkrét eszköz, mező, doksi vagy videó célpont.
- Első megvalósításként kliensoldali teljes szöveges kereső és kézzel gondozott szinonimák használhatók. Szemantikus modellről akkor érdemes dönteni, ha a keresési példák alapján mérhető a többlete.

## Diszkrét tippek

- Példa. Ha egy megemelt tömbön több tetőelem kézzel kerül a helyére, a nézet alján jelenjen meg egyszer, hogy a **Tető (automata)** eszközön a Shift+kattintás lefedi az egész tömböt. A tippről megnyitható az eszköz és a példás útmutató.
- Az elvetett tipp stabil azonosítója `localStorage`-ba kerül, és ugyanabban a böngészőprofilban a tipp többé nem jelenik meg. Verziófrissítés sem állítja vissza az elvetést. A kapcsolódó súgó továbbra is megtalálható kereséssel. Egyszerre egy helyzetfüggő tipp látszik.

## Kérések és hibajelentés

- A keresőből **Kérés felvétele**, a szerkesztő állandó részén pedig felkiáltójeles **Probléma jelentése** gomb nyitja meg ugyanazt a folyamatot.
- Kötelező a beküldő neve. Bejelentkezett szerkesztőnél előtöltjük a megjelenített nevet, egyébként bekérjük. A jelentésben szerepel a cél, a tényleges eredmény vagy ami hiányzik, és a sürgősség (blokkol, lassít, ötlet). Opcionális a reprodukció lépéssora.
- Előtöltjük az aktív eszközt, a világot, a pályát, a verziót és keresőből indítva a keresési kifejezést. A felhasználó elküldés előtt szerkesztheti vagy törölheti az előtöltött adatokat. Képernyőkép beilleszthető vagy csatolható. Szándékos beküldésig az adatok helyben maradnak.
- A közös Google Táblázat nyilvántartja a beküldéseket, a bejelentőt, a sürgősséget és a feldolgozás állapotát. Az első változatban egy Drive-űrlap adhat strukturált beküldést. A közvetlen vágólapos képbeillesztéshez külön szerkesztői űrlap és jogosultsággal védett képtár kellhet.
- Egy későbbi óránkénti Codex-ellenőrzés csoportosíthatja a duplikátumokat, kereshet meglévő megoldást, és jóváhagyásra felajánlhatja a soron következő tételt. Implementálás jóváhagyott tételből, külön ágon történhet.

## Megvalósítás (2026-11-26)

Kapcsolódó: [Teljesítmény és bővíthetőség terve](../scalability-and-development-plan.md), 7. pont (feature-regisztráció) és G szakasz. Onnan ide tartozik: hiányellenőrzés (vezérlő célpont nélkül, hiányzó súgó- vagy fordításkulcs), egyszerű mezőknél közös metaadat (típus, határok, alapérték) ugyanabból a regisztrációból, az index csak assetmetadatát tölt, statikus súgóindex buildkor, worker csak mérés alapján.

A célpont nem a menü helyét tárolja, hanem egy stabil azonosítót, így a Debug vagy a Pályaadatok átszervezése után is jó helyre ugrik.

- **Célpont-katalógus** (`src/search/targets.ts`, tiszta modul): `{ id, kind, titleKey, synonyms, keywords, world?, oldIds? }`. Az `id` stabil és pontozott (pl. `setting.sky.sunAzimuth`, `tool.roofAuto`, `debug.lightProbes`); átnevezéskor a régi id az `oldIds`-be kerül. A címek az i18n-ből jönnek, a szinonimák hu + en kézzel gondozottak.
- **Horgony a vezérlőn**: a mező vagy gomb `data-search-target="<id>"` attribútumot kap (egy `searchAnchor(id)` segéddel). Ha a mező másik menübe költözik, a horgony vele megy, a katalógushoz nem kell nyúlni.
- **Megnyitók**: minden panel (Debug, Pályabeállítások, Asset Manager, eszközfa) regisztrál egy `openForTarget(id)` függvényt egy közös registrybe, amely megnyitja a panelt és kibontja a csoportot, ha a célpont nála van. A navigáció sorban: a megfelelő megnyitó, majd `[data-search-target]` keresése a DOM-ban, odagörgetés, rövid kiemelés, fókusz. Ha nincs horgony, a találat jelzi, de nem hibázik.
- **Index**: MiniSearch, ékezetfüggetlen normalizálás, előtag- és elírás-egyezés, súly: cím > szinonima > régi név > leírás; az aktuális világ kis bónuszt ad. Az index-építés és a rangsorolás tiszta, tesztelt modul.
- **Ellenőrzés**: egy teszt végigmegy a katalóguson, és jelzi az árva célpontokat (nincs megnyitó vagy nincs horgony a forrásban), így egy menü-átszervezés után azonnal kiderül, ha valami elveszett.
- **Lépések**: 1) mag: katalógus, index, horgony, megnyitó-registry, kereső ablak (Ctrl+P / Ctrl+K, nagyító), előzmények, néhány célpont a próbakörhöz (Codex). 2) a Debug, a Pályabeállítások és az eszközfa összes mezőjének és eszközének horgonya és katalógusbejegyzése, szinonimákkal (opencode, mechanikus). 3) changelog-, doksi- és videótalálatok. 4) tippek. 5) kérés és hibajelentés.

## Első próbakör

1. Tető. Egy új szerkesztő a tippből megtalálja az automata eszközt és az egész tömböt lefedő műveletet.
2. Napszak. Magyar és angol keresésből ugyanaz a mező nyílik, majd a kiválasztás az előzményekből ismételhető.
3. Hiányzó hangfunkció. A keresőből vagy a felkiáltójelről névvel és szerkeszthető kontextussal rögzíthető a kérés.
