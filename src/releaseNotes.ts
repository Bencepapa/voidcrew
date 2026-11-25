// Release notes (Hungarian only). Newest entry first. Adding an entry IS the version bump: the app's version is the
// highest `version` here, and a user who last saw a lower one gets the newer entries once (see components/ReleaseNotes).
// To release: add a new object on top with `version` = previous + 1, one line title and one sentence per item.

export interface ReleaseItem {
  title: string;
  text: string;
}

export interface Release {
  version: number;
  date: string;
  items: ReleaseItem[];
}

export const RELEASES: Release[] = [
  {
    version: 2,
    date: "2026-11-25",
    items: [
      { title: "Fű és búza a kerítéseken", text: "A fantasy kerítésekhez közepes fű, magas fű és búza választható, áttetsző hézagokkal és folytonosan illeszkedő szélekkel." },
      { title: "Növényzet: réteges és X kerítés", text: "A Kerítések csoportban a Réteges kerítés (a szélen vagy a közepén több párhuzamos síkban) és az X kerítés (két keresztező sík a cella közepén) sűrű, minden oldalról kitöltött sövényt, magas füvet és búzát ad; a rétegek száma, távolsága és eltolása állítható, alapból járható és átlátszó." },
      { title: "Hangzónák és visszhang", text: "A minitérképen Shift+kattintással kijelölt termekhez (szobák, folyosók, termek) hangzóna adható előbeállítással (folyosó, szoba, terem, barlang, szabadtér) és csúszkákkal (visszhang, lecsengés, puhaság, szigetelés): a játék ezek szerint ad a hangoknak teremhangzást, a zónák között átúszva, a vastag falú zónák pedig jobban tompítják a falon át érkező hangot; zóna nélkül a terem méretéből automatikus visszhang jár, a Debug panelben a Visszhang csúszka és kapcsoló állítja." },
      { title: "Hangelemek", text: "A térképre valódi hangmintákból (madarak, tűzropogás, kandalló, goblin, kalapács) hangelem rakható (hangerő, sebesség, hatótáv, az egyszeri hangoknál ismétlődés szünettel; a régi sípoló és zajos hangelemek is működnek), amely a játékban 3D-ben szól: falon át tompítva, nyíláson át az ajtó felől érkezve, simán átúszó átmenetekkel, mindkét fülbe; a hangerő és a hátsó tompítás a Debug panelben állítható, a szerkesztőben hangszóró-jel mutatja, az impulzus felfutása és lecsengése állítható, és kar, gomb vagy nyomólap ki-be kapcsolhatja." },
      { title: "Színvilág (look)", text: "A pálya beállításaiban hangulat (hideg-misztikus, meleg-filmes, szürke-borús...) és haladó színcsúszkák egy színvilágba terelik a textúrákat; a look a pályával mentődik, és átmásolható másik pályára." },
      { title: "Tűz-, méreg- és előhívó csapdák", text: "A kar, gomb és nyomólap tűz- vagy mérgező füst-kibocsátót kapcsolhat be, NPC-ket idézhet meg, tárgyat vagy aranyat adhat; a tűz fajtája és színe állítható." },
      { title: "Zárható ládák és kulcsok", text: "Ládák, tárolók és karok is zárhatók kulccsal: a kulcs egy felvehető tárgy, a zár üzenete és a kulcs elhasználása állítható." },
      { title: "Ajtó részletesség", text: "A Debug grafikai beállításai között külön állítható az ajtókeret és az ajtólap rácsának finomsága (az automatikus a falrészletesség, legfeljebb 32)." },
      { title: "Látható cellák a minimapon", text: "A szerkesztő minimapján a Padló és Plafon mellett a Látható gomb kiemeli azokat a cellákat, amelyeket a motor a csapat helyéről láthatónak számol." },
      { title: "Sötét fantasy hangulat mentése", text: "A Debug panelben hangolt sötét fantasy beállítások megmaradnak a böngészőben, és szövegként másolhatók, illetve beilleszthetők." },
      { title: "Köd és fantasy alapértékek", text: "A távoli köd kezdete és teljes sűrűsége pályánként beállítható (Fény szakasz), a fantasy világ hangolt kamera- és fényalapértékekkel indul." },
      { title: "Gyors fényelőszámítás", text: "Pálya betöltésekor és fény vagy tárgy szerkesztése után előbb egy durva, gyors bake mutatja a fényt, a pontos a háttérben számolódik ki; ha a fény bemenetei nem változtak (például fal textúra csere), a korábbi eredményt újrahasználja (Debug: gyors előszámítás, 0 = ki)." },
      { title: "Tárgy eldobása", text: "A hátizsákból a nézetre húzva vagy a Drop gombbal eldobhatod a tárgyat a földre; nyomólapon fekve ajtót tarthat nyitva." },
    ],
  },
  {
    version: 1,
    date: "2026-11-23",
    items: [
      { title: "Gradiens égbolt", text: "Kültéri pályákhoz kép nélküli, színátmenetes égbolt választható a pálya beállításaiban." },
      { title: "Működtethető elemek", text: "Kar, gomb, nyomólap és csapda rakható le, amelyek ajtót nyitnak vagy a csapatot támadják; az ajtókhoz kulcs is megadható." },
      { title: "Felvétel, Play gomb és tesztelési segédletek", text: "A tárgyak kattintással vagy húzással (hátizsákra, kézre, karakterre) is felvehetők, a szerkesztő békés módban indul (ellenfelek és csapdák kikapcsolva), a Play gomb élesíti őket, és szerkesztés közben a csapat halála nem dob ki a pályáról." },
      { title: "NPC méretigazítás", text: "Elérhető az Asset managerben (NPC-k): csúszkával állítható, a goblinok kicsit kisebbek lettek." },
      { title: "Ajtónkénti textúra", text: "Az ajtó lapja és kerete ajtónként is állítható az Inspector Kinézet szakaszában." },
      { title: "Nincs fekete sík a falak mögött", text: "Átlátszó textúrájú fal és emelt padló oldala mögött már a valódi háttér látszik." },
      { title: "Közös textúra-kezelés", text: "Tárgyak, felvehető tárgyak, matricák és NPC-k saját mélység- és normáltérképet kaphatnak, akár AI-val is." },
      { title: "Átjárók a pályák között", text: "Városkapu és lépcső (akár csigalépcső) tölt be másik pályát töltőképpel; a Közlekedés csoportban érhető el, kijelölve Delete törli, a 3D nézetben keret jelzi." },
      { title: "Tető automata", text: "A tető textúrája a jobb oldali panelen választható, nem a pöttyös az alapértelmezett." },
      { title: "Stabil hátizsák- és boltablak", text: "Az ablak mérete már nem ugrál hover közben, a tárgy leírását kattintásra rögzítheted, a használati súgó a ? gomb mögött van." },
      { title: "Egész blokknyi magasítás", text: "A Magasság eszközzel a Ctrl+kattintás egy egész blokkot emel (Ctrl+jobb kattintás: süllyeszt) a padlón és a plafonon." },
      { title: "Kerítések és blokkok", text: "A Tető mellett új eszközök: blokk, kerítés a cella szélén és kerítés a közepén (átlátszó textúrával is, a mögötte lévő jelenet látszik), a textúrát pedig miniatűrös listából választhatod az Inspectorban." },
      { title: "Területek másolása", text: "A kijelölt terület minden eleme (falak, tárgyak, ajtók, tetők, kerítések) másolható, elforgatható és beilleszthető, akár másik pályába is." },
      { title: "Új tetőformák", text: "A tető eszközzel gúla (akár 1x1-es toronysüveg) és keskeny, hosszú házra való nyeregtető is építhető." },
      { title: "Égbolt feltöltése", text: "Az Assets managerben 2:1 arányú panorámaképet tölthetsz fel égboltnak, és a pálya beállításaiban kiválaszthatod." },
    ],
  },
];

export const CURRENT_RELEASE = RELEASES.reduce((max, r) => Math.max(max, r.version), 0);

/** The releases newer than `seen`, newest first. */
export function releasesSince(seen: number, releases: readonly Release[] = RELEASES): Release[] {
  return releases.filter(r => r.version > seen).sort((a, b) => b.version - a.version);
}

/**
 * What to show for a stored "last seen" value. `undefined` (never stored): a returning user (`returning`, e.g. a saved
 * game exists) sees everything, a brand-new one sees nothing and is silently marked as up to date.
 */
export function pendingReleases(stored: number | undefined, returning: boolean, releases: readonly Release[] = RELEASES): Release[] {
  if (stored === undefined) return returning ? releasesSince(0, releases) : [];
  return releasesSince(stored, releases);
}
