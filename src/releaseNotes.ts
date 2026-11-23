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
    version: 1,
    date: "2026-11-23",
    items: [
      { title: "NPC méretigazítás", text: "Elérhető az Asset managerben (NPC-k): csúszkával állítható, a goblinok kicsit kisebbek lettek." },
      { title: "Ajtónkénti textúra", text: "Az ajtó lapja és kerete ajtónként is állítható az Inspector Kinézet szakaszában." },
      { title: "Nincs fekete sík a falak mögött", text: "Átlátszó textúrájú fal és emelt padló oldala mögött már a valódi háttér látszik." },
      { title: "Közös textúra-kezelés", text: "Tárgyak, felvehető tárgyak, matricák és NPC-k saját mélység- és normáltérképet kaphatnak, akár AI-val is." },
      { title: "Kijárat és lépcső", text: "A kijárat a Közlekedés csoportban van, a kijelölt kapu vagy lépcső Delete-tel törölhető, és a 3D nézetben keret jelzi." },
      { title: "Átjárók a pályák között", text: "Városkapu és lépcső (akár csigalépcső) tölt be másik pályát, töltőképpel." },
      { title: "Tető automata", text: "A tető textúrája a jobb oldali panelen választható, nem a pöttyös az alapértelmezett." },
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
