# Fényprobe-ok és hasáb: nyitott kérdések (2026-11-27)

A felhasználó kézi tesztjéből és a szobatükröződési kísérletből fennmaradt teendők.

## Fényprobe-megjelenítő

- **Irányonkénti szín.** Elvárás: a gömb körbe más-más színű oldalakkal mutassa, honnan milyen fényt kap a probe. Most egy szín és egy irányvonal látszik. Ok: a pályák nagy része `directional` módban bake-el (ambient + egy fő fény + irány), a 6 irányú `cube` mód csak beállítás kérdése. Megoldandó: cube módban a gömb lapjait az irányok szerint színezni (vagy irányonként kis csúcsokat rajzolni); directional módban jelezni, hogy csak egy fő irány van.
- **Méret a sűrűséghez.** Sűrűbb probe-rácsnál legyenek kisebbek a gömbök (a sugár a probe-távolság törtrésze).
- **Probe-ok a falakban.** A falak belsejében is vannak probe-ok. Megválaszolandó: kimaradhatnak-e (bake-idő, memória, szivárgó fény a fal mellett), vagy a rácsnak szüksége van rájuk az interpolációhoz; ha maradnak, a megjelenítő ne mutassa őket, vagy halványan.

## Elmosott tükröződés a probe-okból

- A mostani rendszer egyszerű: directional módban egy probe-nak ambient színe, egy fő fénye és iránya van. Elmosott tükröződéshez irányonkénti fény kell (legalább a 6 irányú cube, jobb esetben alacsony rendű SH), és nem csak a fényforrások és az ég, hanem a falakról és propokról visszavert átlagszín is (színes bounce, a nap-bake terv C változata).
- Megválaszolandó: mennyibe kerül a cube mód és a felület-visszaverődés a bake-ben; elég-e a cube a sci-fi témához, vagy reflection probe (cubemap) kell. Kapcsolódó ötlet: memória `probe-reflections-idea`.

## Szobatükröződés debug nézete

- A Debug kapcsoló az aktuális szoba meglévő nyers cubemapját kis, hatoldalú kockán mutatja a felvételi ponton. A kapcsoló kereshető, és a megjelenítés nem készít új felvételt.
- [ ] **Részletes cubemap-nézet.** Később külön panelen látszódjon az oldaljelölés (`+X`, `−X`, `+Y`, `−Y`, `+Z`, `−Z`), a felbontás, a régió határa és a dobozprojekció állapota. A nézet jelezze, ha a helyiséghez még nincs felvétel.
- A vizsgált adat a falak, propok és tócsák közös szobafelvétele. A tesztgömb saját cubemapja és a világítás hatirányú probe-ja külön adatforrás. A diagnosztikai nézet megnyitásakor az előnézetet egyszer kell előállítani, a normál rendereléshez nem szükséges képpontonkénti GPU-visszaolvasás.

## Hasáb-dombormű

- A sokszög/csillag lapjai most vastagabb lapnak hatnak, nem igazi domborműnek. Megnézendő: a mélységtérkép erőssége a hasáb lapjain (relief mértéke, `propReliefAmount`), a kétoldalas felépítés és a hibrid/durva rács beállítása a panelekhez képest.
