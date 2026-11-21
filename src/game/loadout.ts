// Who carries which weapon after a run (pure, see meta.ts commitLoadout).

export type Loadout = Record<string, [number | null, number | null]>;

// The loadouts after a run. `held` is what each crewmate holds in hand at the
// end as owned weapon ids [right, left] (right = the one in use). A crewmate
// holding no weapon at all (it was stowed in the backpack, or given away) is
// not left unarmed: they keep their previous loadout - except for weapons now
// held by someone else. Everyone else's loadout is what they hold.
export function resolveLoadout(prev: Loadout, held: Record<string, [number | null, number | null]>): { loadout: Loadout; keptPrevious: string[] } {
  const claimed = (except: string) => {
    const ids = new Set<number>();
    for (const [crew, [a, b]] of Object.entries(held)) {
      if (crew === except) continue;
      if (a !== null) ids.add(a);
      if (b !== null) ids.add(b);
    }
    return ids;
  };
  const loadout: Loadout = { ...prev };
  const keptPrevious: string[] = [];
  for (const [crew, [right, left]] of Object.entries(held)) {
    if (right === null && left === null) {
      const taken = claimed(crew);
      const before = prev[crew] ?? [null, null];
      const keep = before.map((id) => (id !== null && !taken.has(id) ? id : null)) as [number | null, number | null];
      loadout[crew] = keep[0] === null ? [keep[1], null] : keep;
      keptPrevious.push(crew);
      continue;
    }
    loadout[crew] = right === null ? [left, null] : [right, left];
  }
  return { loadout, keptPrevious };
}
