import type { Lock } from "./story";

// Keys of locked doors. A door's `lock.key` names a story flag (see story.ts): the door opens once it is up. What raises
// a flag is a story item picked up (`MapItem.sets`, with a `name` for the log: a keycard, a rusty key), a terminal's or
// a trigger's "set:" action. This module lists those for the editor (a key to pick, a lock whose key nothing raises) and
// words what a locked door tells the party.

export interface KeyFlag {
  flag: string;
  // what raises it: an item lying on the map (its name, if it has one), or a story action
  from: "item" | "action";
  name?: string;
}

interface KeyMap {
  items?: { item: string; name?: string; sets?: string }[];
  triggers?: { do: string[] }[];
  terminals?: Record<string, { do?: string[] }>;
}

const setOf = (action: string) => (action.startsWith("set:") ? action.slice(4).trim() : "");

// every flag something on the map raises
export function keyFlags(map: KeyMap): KeyFlag[] {
  const out = new Map<string, KeyFlag>();
  for (const it of map.items ?? []) if (it.sets) out.set(it.sets, { flag: it.sets, from: "item", name: it.name });
  const actions = [...(map.triggers ?? []).flatMap((t) => t.do), ...Object.values(map.terminals ?? {}).flatMap((t) => t.do ?? [])];
  for (const a of actions) {
    const flag = setOf(a);
    if (flag && !out.has(flag)) out.set(flag, { flag, from: "action" });
  }
  return [...out.values()];
}

// the flag a picked-up item raises when it is made a key: "key.<item>" (a second key of one kind: name it by hand)
export const keyFlagFor = (item: string) => `key.${item}`;

// What the party is told at a locked door: the lock's own message (default "It's locked."), and - if the hacker could
// break it - that they could.
export function lockedMessage(lock: Pick<Lock, "message" | "hack">, hackerName?: string): string {
  const hint = lock.hack && hackerName ? ` ${hackerName} could hack it (Use).` : "";
  return `${lock.message?.trim() ? lock.message : "It's locked."}${hint}`;
}

// A door's lock key nothing on the map raises (a mistake, unless the key comes from another deck's story)
export function lockKeyMissing(lock: Pick<Lock, "key"> | undefined, map: KeyMap): boolean {
  return !!lock?.key && !keyFlags(map).some((k) => k.flag === lock.key);
}
