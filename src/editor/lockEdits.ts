import type { MapFile } from "../game/mapFormat";
import { keyChoices, keySources, lockableProp, patchPropLock, suggestKeyFlag, type KeyChoice, type PropLock } from "../game/propLocks";
import { updateProp } from "./mapEdits";

// Edits on the locks of placed props (see game/propLocks.ts): pure functions on a map file, as mapEdits.ts's - `applyEdit`
// runs them (and undoes them: a lock is part of the prop's entry). The panel's `PropLockInfo` is built here too.

// a prop's lock set (a change to the current one) or taken off (null); a prop that cannot be locked is left alone
export function setPropLock(file: MapFile, index: number, patch: Partial<PropLock> | null): MapFile {
  const entry = file.props?.[index];
  if (!entry || (patch !== null && !lockableProp(entry.prop))) return file;
  return updateProp(file, index, { lock: patch === null ? undefined : patchPropLock(entry.lock, patch) });
}

// the lock block of the Inspector
export interface PropLockInfo {
  // the lock, if the prop has one
  lock?: PropLock;
  // the flags to choose a key from (see keyChoices)
  keys: KeyChoice[];
  // a new key flag for this lock ("Create a key for this lock")
  suggested: string;
  // whether nothing on the map raises the lock's key (as the Problems panel says)
  nobody: boolean;
}

type InfoMap = Parameters<typeof keyChoices>[0];

// undefined: the prop cannot be locked (no block in the Inspector)
export function propLockInfo(map: InfoMap, spec: { prop: string; cell: { x: number; y: number }; lock?: PropLock }): PropLockInfo | undefined {
  if (!lockableProp(spec.prop)) return undefined;
  const keys = keyChoices(map);
  return {
    lock: spec.lock,
    keys,
    suggested: suggestKeyFlag(spec.prop, spec.cell, keys.map((k) => k.flag)),
    nobody: !!spec.lock?.key && !keySources(map).has(spec.lock.key),
  };
}
