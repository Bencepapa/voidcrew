# Void Crew Asset Manager – tervezet

A könyvtár a térképszerkesztő felső sorából nyílik. Három szerkeszthető típus indul: Anyag, NPC, Prop. Ugyanez a felület nyílik meg a térképen kijelölt objektum Szerkesztés gombjáról, a konkrét assetre fókuszálva. Bezáráskor visszatérünk a korábbi térképhez és kamerapozícióhoz.

## Egy munkamenet

Bal oldalon kereshető könyvtár bélyegképekkel, világ- és típusszűrővel. Középen a típushoz tartozó 2D munkafelület, mellette a folyamatosan frissülő 3D próbaszoba. Keskeny kijelzőn a Szerkesztés és a Szoba nézet fülekkel váltható. Az asset neve, módosított állapota és a Közzététel gomb mindkét nézetben elérhető.

Az Import helyi piszkozatot nyit, amelyet a böngésző IndexedDB-be ment a forrásképekkel együtt. Minden változás az előnézetben látszik. Csak a Közzététel tölt fel a közös projektbe. Bezáráskor a szerkesztő jelzi, hogy maradt-e helyi piszkozat.

## Bevilágított próbaszoba

Egyetlen Three.js vászon mutat semleges falakat, padlót, halvány környezeti fényt és két külön kapcsolható, eltérő irányú lámpát. A lapos szögből súroló fény különösen hasznos a normal irányának és a relief mélységének ellenőrzéséhez. A világítás intenzitása állítható; egy gomb visszaállítja a referenciafényt és a kamerát. A kamera egérhúzással körbejár, görgővel közelít. A kamera, az objektum és a lámpa mozgatása külön mód, így ugyanabban a megvilágításban lehet két változatot összevetni.

- **Anyag:** a kijelölt felhasználáshoz illő falon, padlón vagy plafonon jelenik meg. A sarok és legalább két egymás melletti csempe megmutatja a varratot, a lépcsőél pedig az elmozdítás mértékét. Kapcsolható normál-, depth- és végleges nézet, valamint a játék smooth/steps módja.
- **NPC:** játékbeli méretű billboard áll a padlón. A test forgatása a nézeti irányt változtatja. A kamera körbejárásakor a játék szabályai választanak irányképkockát és tükrözést. A lejátszás, megállítás és képkockaléptetés közös a 2D és 3D nézettel. A talpvonal és az árnyék megmutatja, ha járás közben ugrál a figura.
- **Prop:** a játék tényleges geometriája és anyaga kerül a szobába. Forgatható függőleges tengely körül, körbejárható, és alulról is megvizsgálható. A front/oldal/felülnézetben mozgatott doboz rögtön frissül a szobában. Kapcsolható a befoglaló doboz és a méretrács.

## Mit használunk újra?

| Forrás | Megtartandó képesség | Integráció |
|---|---|---|
| src/editor/ActorEditor.tsx | Sheet-rács, képkockánkénti offset, szellemkép, talpvonal, járás/fordulás/harc | A kiválasztott actor és a képek a piszkozatból érkezzenek. A segédvonalak maradnak 2D-ben, az irányválasztás és időzítés a játékkal közös legyen. |
| src/editor/PropEditor.tsx | Három vetület, dobozok húzása, méretek, meglévő propok paraméterei | A jelenlegi élő játéktér-módosítás helyett a piszkozat változzon; a játék és a szoba ugyanazzal a geometriaépítővel dolgozzon. |
| C:/dev/js/normalMap/src/core.js | Festett változat, szűrés, szintek, depth, Sobel-normal, Y-fordítás | A böngészőben is futó számítási mag verziózott modul legyen a buildben. Workerben kis felbontású előnézet, jóváhagyáskor teljes felbontás. Maradjon meg az eredeti kép és a generátor receptje. |

A meglévő fejlesztői mentési végpontok helyett mindhárom panel ugyanazt a piszkozat- és publikálási műveletet hívja. A próbaszobához csak a szükséges renderelőrészeket emeljük ki a GameViewportból. Saját jelenetet, kamerát és objektumpéldányt kap, a textúrák és a geometria előállítási szabályait megosztja a játékkal.

## Tartalom és mentés

- **Anyag:** szerkesztő által beállítható fal/padló/plafon címkék, akár több egyszerre. Külön csatorna az alapszín, depth, normal, roughness vagy gloss, metalness és emisszió. Képenként látszik, hogy importált vagy generált. Gloss importnál az átalakítás roughnessre előnézhető. A generált csatorna újraszámítása külön művelet, megőrzi a kézzel adott csatornákat.
- **NPC:** spritesheet, sor/oszlop, képkockák állapothoz és irányhoz rendelése, FPS, tükrözés, offsetek, méret, opcionális normal/emisszió és meglévő viselkedéssablon.
- **Prop:** típus, vetületi képek vagy anyaghivatkozások, méretek, részek, elhelyezés és forgás. Az első verzió a jelenleg szerkeszthető propokat támogatja.
- **Azonosítás:** típustól és megjelenített névtől független stabil asset-ID, változtathatatlan revíziók. A publikált térkép az asset revíziójára hivatkozik; újabbra váltás előnézhető szerkesztői művelet. A mostani közös PNG-k régi azonosítói feloldhatók maradnak.
- **Közös könyvtár:** a képek Supabase Storage-ba, a leírások, szerző, időpont és függőségek Postgresbe kerülnek. Előbb feltöltjük és ellenőrizzük a fájlokat, majd egy tranzakció teszi láthatóvá a teljes revíziót. Elavult alapverzió esetén ütközést jelzünk. Archiválás eltávolítja az assetet a palettáról; végleges törlés előtt a teljes megőrzött térkép- és assetverziók hivatkozásait ellenőrizzük.

## Megvalósítás és elfogadás

1. **Próbaszoba meglévő tartalommal.** Egy beépített kőanyag, egy irányfüggő NPC és egy többdobozos prop. Ugyanazt a képkockát, méretet, UV-t és reliefet kell mutatniuk, mint azonos beállításokkal a játékban. A kamera mozgatása és a fények kapcsolása mindháromnál próbálható.
2. **Első teljes munkafolyamat: anyag.** PNG import → célfelület kiválasztása → depth/normal import vagy generálás → szobateszt → publikálás → felhasználás második böngészőből. Külön ellenőrzendő a megszakított feltöltés és a piszkozat újranyitása.
3. **NPC- és prop-panelek átvezetése.** A régi szerkesztőkből megnyitott asset ugyanazt a piszkozatot kapja, mint a könyvtárból. Új spritesheetből készített NPC lehelyezhető és animálható a pályán; a szobában módosított prop ugyanazzal az alakzattal jelenik meg játékban.
4. **Könyvtárkezelés és csomagcsere.** Használati helyek, archiválás, másolat, verzióválasztás, majd export/import az összes szükséges képpel és hivatkozott revízióval. Egy másik projektbe importáláskor azonos nevű, eltérő tartalom nem írhat felül korábbi munkát.
