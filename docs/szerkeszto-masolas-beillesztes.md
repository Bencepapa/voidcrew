# Terület másolása és beillesztése a pályaszerkesztőben

Ha már megépítettél egy házat, egy szobát vagy egy kis utcarészt, nem kell újra felépítened: kijelölöd, lemásolod, és beilleszted máshová – akár elforgatva, akár tükrözve, akár egy másik pályába. A fal, a padló, az ajtók, a tárgyak, a tető, a kerítés, a matricák, az NPC-k és a fények mind együtt másolódnak, ugyanúgy elrendezve, ahogy a kijelölésben álltak.

Programozói tudás nem kell hozzá. Az egész három billentyű: **Ctrl+C** (másolás), **Ctrl+V** (beillesztés), **R** (forgatás).

## 1. Mit másol a szerkesztő?

Egy téglalap alakú területen belül minden, ami a cellákban van:

| Mi | Megjegyzés |
|---|---|
| Falak, padló, ajtócellák | a magasságokkal (padló, plafon) és a textúrákkal (padló, fal, plafon, lépcsőlap) együtt |
| Tárgyak | a tetők és a kerítések is (blokk, kerítés a szélen, kerítés középen) |
| Matricák | falra, padlóra, plafonra festettek; az üzenetük és a hozzájuk kötött esemény is |
| Felszedhető tárgyak | a darabszámukkal és a helyükkel a cellán belül |
| Fények | mennyezeti lámpa és szabadon álló fény is |
| NPC-k és ellenfelek | az irányukkal; a párbeszéd- és bolt-hivatkozásuk is megmarad |
| Ajtók | az irányukkal, a feliratukkal, a zárjukkal |
| Létrák, hidak, ablakok | |
| Részecskék | füst, tűz, köd, szirmok… |
| Esélyfalak és tiltott területek | |
| Események | a tárgyra, ajtóra, matricára vagy falra tett üzenet, kép, párbeszéd vagy bolt |

## 2. Mit nem másol, és miért?

Néhány dolog a pályán **egyedi kell legyen**, ezért kimarad. A szerkesztő a másoláskor kiírja, hány dolog maradt ki és miért („3 dolog kimaradt: kapuk és kijáratok, lift-elemek.").

| Kimarad | Miért |
|---|---|
| A csapat indulópontja | csak egy lehet pályánként |
| Kapuk és kijáratok, lépcsők | a nevük más pályák hivatkozásaiban szerepel, nem lehet két ugyanolyan |
| Lift (a fülke, az ajtaja és a gombja) | a lift két emelet között működik, párja van a másik pályán |
| Történet-eseményindítók (belépés egy cellába, ajtónyitás) | ezek a történet menetét vezérlik, vakon duplázni nem szabad |
| Létra, amelynek a párkánya a kijelölésen kívül van | párkány nélkül a létra nem vezet sehová |
| Ablak, amelyből csak egy rész esik a kijelölésbe | az ablak egy darab, félbevágva nem érvényes |
| NPC útvonala, ha az útvonal egy része kívül esik | az NPC másolódik, de az útvonal nélkül, egy helyben áll |

A kimaradó elemek **cellája** másolódik (padlóként), csak maga az elem hiányzik.

**Azonosítók (`id`).** Az „egyedi név" mezővel ellátott tárgyak, ajtók, NPC-k, matricák és a többiek (amelyekre a „csak ezzel / csak e nélkül" kapcsolók hivatkoznak) másolódnak. Ha a pályán már van ilyen nevű elem, a másolat a nevéhez egy számot kap (`doboz` → `doboz-2`, `doboz-3`…), és a *másolat* „csak ezzel" kapcsolója a *másolt* társra mutat, nem az eredetire. Egy másik pályába beillesztve a nevek változatlanok maradnak, ha ott még nincs ilyen.

**Tető.** A beillesztett tető **új tető** lesz (új azonosítót kap), így nem olvad bele a szomszédos, régi tetőbe. A tető darabjait (sarok, lejtő, lapos) a program az új helyen újra kiszámítja, ezért elforgatva is helyesen záródik.

## 3. Lépésről lépésre

### 3.1. A terület kijelölése

1. Lépj be a szerkesztőbe (Tab), és nyisd ki a **nagy térképet**: a *Térkép* fejlécében a **⤢** gombbal (csak széles képernyőn van).
2. Fogd meg a bal egérgombbal a kijelölendő terület egyik sarkát, és húzd át a szemközti sarokra. A kijelölt rész kiemelődik, a térkép fölött kiírja a méretét (pl. *5 x 4*).
3. Vigyázz, hogy a ház **teljes** falát és a hozzátartozó kerítést is a téglalapba vedd. Tipp: jelölj ki inkább egy sorral-oszloppal többet; ami üres, az üresen másolódik.

![Terület kijelölése](img/masolas-kijeloles.png)

### 3.2. Másolás

Nyomd meg a **Ctrl+C**-t (vagy a *Másol* gombot a kijelölés melletti sávban). Az alsó állapotsorban megjelenik: *„Másolva: 14 dolog, 5x4 mezőben."* Ha valami kimaradt, egy második sor megmondja, mi.

> Ha egy tárgy vagy fény is ki van jelölve a 3D nézetben, a Ctrl+C akkor is a **blokkot** másolja, amíg a blokk ki van jelölve. Az egy tárgy sima másolásához előbb engedd el a blokk kijelölését (✕ gomb vagy Esc).

### 3.3. Beillesztés

1. Nyomd meg a **Ctrl+V**-t (vagy a *Beilleszt* gombot). A szerkesztő beillesztő módba lép, a 3D nézet alján egy sárga súgósor jelzi.
2. Mozgasd az egeret a térképen vagy a 3D nézetben: egy **sárga körvonal** követi a mutatót. A térképen a körvonalon belül halványan a másolt terület cellái is látszanak (sötét: fal, sárgás: padló, vöröses: ajtó); a 3D nézetben a padlón egy sárga keret jelzi a helyét.
3. **A körvonal bal felső sarka a mutatott cellára kerül.** Tehát oda kattints, ahová a beillesztett rész *bal felső* sarka kell.
4. **Kattintás** lerakja. A beillesztő mód ilyenkor *nem ér véget*: újra kattinthatsz máshová, és ugyanazt még egyszer lerakja (mint egy pecsét). Így lehet egy utcát házakkal beültetni.
5. Kilépés: **Esc**, **jobb egérgomb** vagy a *Kész* gomb.

![Beillesztés előnézete](img/masolas-beillesztes-elonezet.png)

### 3.4. Forgatás és tükrözés

Beillesztés közben:

- **R** – 90°-kal jobbra forgat (négy lenyomás után újra az eredeti). **Shift+R** – visszafelé.
- **F** – tükrözi balról jobbra.

Ilyenkor minden együtt fordul: a falak, az ajtók iránya, a falra szerelt tárgyak, a matricák, az NPC-k nézési iránya, az ablakok, a létrák, a kerítések oldala. A forgatás után a körvonal alakja is megváltozik (egy 5×4-es ház 4×5-ös lesz), a bal felső sarka akkor is a mutatott cellán van.

*Megjegyzés a tükrözésről:* a felirat és a kép nem tükröződik (a matrica szövege olvasható marad), csak az elhelyezése. Az ajtófeliratok is olvashatóak maradnak.

![Elforgatott beillesztés](img/masolas-forgatas.png)

### 3.5. Mi történik a beillesztett helyen?

A beillesztés **felülírja a területet**: a körvonalon belül mindent kicserél arra, ami a vágólapon van – a falat, a padlót, a magasságokat, a textúrákat és *minden ott álló elemet* (a régi tárgyakat, NPC-ket, fényeket, matricákat előbb eltávolítja). A területen kívül semmi nem változik.

- Ami **kilóg a pálya szélén**, az kimarad; az állapotsor megmondja, hány cella.
- Ahol a **kezdőpont, egy kapu, egy lépcső vagy egy lift** áll, az a cella érintetlen marad (nem kerül rá semmi, nem is törlődik semmi), és az állapotsor szól.
- Ha az új fal miatt egy szomszédos **ablak, létra, híd vagy NPC-útvonal** érvénytelenné válna, a program kiveszi, és az állapotsor szól. (Így a pálya mindig betölthető marad.)
- Az egész beillesztés **egy lépésben** vonható vissza: egy **Z** (Visszavonás), és a pálya olyan, mint előtte. A pecsételés minden kattintása külön lépés.

![Az eredmény](img/masolas-eredmeny.png)

## 4. Másolás másik pályába

A vágólap a böngészőben is megmarad, ezért:

1. Jelöld ki és másold le a területet az egyik pályán (Ctrl+C).
2. Nyisd meg a másik pályát (a pályalistából vagy a Fájl menüből).
3. Nyomj Ctrl+V-t, és illeszd be ugyanúgy.

![Másolás másik pályába](img/masolas-masik-palya.png)

Az **oldal újratöltése** után is megvan a vágólap. A vágólap böngészőnként külön él: egy másik böngészőben vagy gépen nem látszik. Nagyon nagy terület esetén előfordulhat, hogy a böngésző nem tárolja el; ilyenkor a vágólap csak az oldal bezárásáig él, és az állapotsor nem szól külön.

Fontos: a tárgyak, textúrák és matricák **azonosítóval** szerepelnek a vágólapon. Ha a másik pálya másik világba (pl. Void Fantasy ↔ hajó) tartozik, és egy tárgy ott nem létezik, a beillesztés hibaüzenettel megáll, és semmi nem változik.

## 5. Tippek

- **Ház másolása, forgatása, újrafelhasználása:** építs meg egy házat egyszer (fal, ajtó, ablak, tető, bútor). Jelöld ki, Ctrl+C, majd Ctrl+V, és a pecséttel rakj le belőle hármat. Az egyiket R-rel fordítsd el, hogy ne legyenek egyformák.
- **Mielőtt kijelölsz egy házat, ellenőrizd, hogy a tető minden darabja a falon belül van.** A tetőt a kijelölés *celláiban* álló darabok alkotják.
- **Kerítés:** a szélen álló kerítésdarabot az a cella viszi, amelyiknek a szélére építetted. Ha a ház körüli kerítésből néhány darab hiányzik a beillesztés után, vedd nagyobbra a kijelölést egy cellányival.
- **Ha rossz helyre pecsételtél,** nyomj egy Z-t, és kattints máshová; a beillesztő mód közben is működik a Visszavonás.
- **Hogy ne érje baj a pályát:** a beillesztés előtt érdemes menteni (Ctrl+S), a nagy változtatások előtt is.
- **A felvehető tárgyak** (kincsek) is másolódnak. Ha nem akarod, hogy egy ház minden másolatában ott legyen a kincs, szedd ki a kincset a másolás előtt, vagy a beillesztés után töröld.

## 6. Gyakori kérdések

**Nem történik semmi a Ctrl+C-re.** Ellenőrizd, hogy van-e kijelölt blokk (a nagy térképen húzással), és hogy nem szövegmezőben áll-e a kurzor.

**A Ctrl+V nem csinál semmit.** Előbb másolni kell (az állapotsor: „Nincs mit beilleszteni…"). Ha a vágólapon az utolsó dolog egy *egyetlen tárgy* volt, a Ctrl+V azt illeszti be (a szokásos módon, a tárgy eszközével); a terület beillesztéséhez másold le újra a területet.

**A körvonal nem látszik a 3D nézetben.** A mutatónak a pálya egy cellája fölött kell lennie (padló vagy fal); a térképen mindig látszik.

**A tető furcsán néz ki.** A tető darabjai az új helyen újraszámolódnak. Ha kézzel módosítottál egy darabot (leválasztott darab), az megtartja a beállítását, és forgatáskor vele együtt fordul.

**A beillesztés után hiányzik egy ablak vagy létra.** A beillesztés kiveszi azokat, amelyek az új falak mellett érvénytelenek lennének; az állapotsor megmondja, hányat. Tedd vissza őket az Ablak/Létra eszközzel.

## 7. Gyorsbillentyűk

| Billentyű | Mit csinál |
|---|---|
| húzás a nagy térképen | blokk kijelölése |
| **Ctrl+C** | a kijelölt blokk másolása |
| **Ctrl+V** | beillesztő módba lép |
| kattintás | lerakja a területet (bal felső sarok a mutatott cellán) |
| **R** / **Shift+R** | forgatás jobbra / balra |
| **F** | tükrözés |
| **Esc** vagy jobb gomb | kilépés a beillesztő módból |
| **Z** | visszavonás |
| **?** | a szerkesztő összes billentyűje (a „Terület másolása / beillesztése" csoportban is) |

![A billentyűk súgója](img/masolas-sugo.png)

---

## Készítendő képernyőképek

Az útmutató képei még hiányoznak; ide kerülnek a `docs/img/` mappába (PNG). Minden képhez a pontos lépések:

1. **`masolas-kijeloles.png`** – *Terület kijelölése.*
   1. Nyisd meg a szerkesztőt egy olyan pályán, amelyen van egy ház (fallal, ajtóval, tetővel) – pl. a `tesztsztori` pálya.
   2. Kattints a Térkép fejléce melletti **⤢** gombra: nagy térkép.
   3. Húzz kijelölést a ház köré (kb. 5×4 mező). A kép tartalmazza a kijelölést és a mellette lévő gombsort (Ásás, Betömés… Másol, ✕).
2. **`masolas-beillesztes-elonezet.png`** – *Beillesztés előnézete.*
   1. A kijelölt terület másolása után nyomj Ctrl+V-t.
   2. Mozgasd a mutatót egy üres rész fölé a nagy térképen, hogy a sárga körvonal és a halvány cellák látszódjanak; a 3D nézet alján a sárga súgósor is.
   3. Ha lehet, egy második kép ugyanerről a 3D nézetben (a padlón a sárga keret).
3. **`masolas-forgatas.png`** – *Elforgatott beillesztés.*
   1. Beillesztő módban nyomj R-t egyszer (a ház elforog, a körvonal 4×5 lesz).
   2. A kép mutassa a térképet az elforgatott körvonallal és a beillesztő gombokat (*Forgat*, *Tükröz*, *Kész*).
4. **`masolas-eredmeny.png`** – *Az eredmény.*
   1. Kattints, hogy letegye; nyomj Esc-et.
   2. Kép a 3D nézetről az eredeti és a lemásolt házról egymás mellett, az alsó állapotsorral („Beillesztve: …").
5. **`masolas-masik-palya.png`** – *Másolás másik pályába.*
   1. Másolj le egy részt, nyiss meg másik pályát, nyomj Ctrl+V-t.
   2. Kép a másik pályáról a körvonallal; látszik a pálya neve a státuszsorban.
6. **`masolas-sugo.png`** – *A billentyűk súgója.*
   1. Nyomd meg a **?** billentyűt a szerkesztőben.
   2. Kép a „Terület másolása / beillesztése" csoportról.

A hivatkozások (`![…](img/….png)`) már a helyükön vannak az útmutatóban; amíg a képfájl nincs ott, a böngésző a kép alternatív szövegét mutatja. Ha egy képet nem lehet megcsinálni, a hozzá tartozó sort ki kell törölni.
