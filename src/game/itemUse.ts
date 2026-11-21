import type { ItemUse } from "./items";
import type { Crewmate } from "./types";

// Using an item from a hand (see items.ts's ItemUse): what it would do to the
// crew. Pure: the roll is passed in, the caller applies the result (and uses
// one of the item up).

export type UseOutcome =
  | { ok: true; crew: Crewmate[]; target: string; hp: number; en: number }
  // "down": the user is down; "nothing": nobody needs it
  | { ok: false; reason: "down" | "nothing" };

export function applyUse(
  crew: readonly Crewmate[],
  userId: string,
  use: ItemUse,
  roll: (range: [number, number]) => number,
): UseOutcome {
  const user = crew.find((c) => c.id === userId);
  if (!user || user.hp <= 0) return { ok: false, reason: "down" };
  const lacks = (c: Crewmate) => (use.hp ? c.maxHp - c.hp : 0) + (use.en ? c.maxEn - c.en : 0);
  let target: Crewmate | undefined;
  if (use.target === "self") target = lacks(user) > 0 ? user : undefined;
  else
    target = crew
      .filter((c) => c.hp > 0 && lacks(c) > 0)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!target) return { ok: false, reason: "nothing" };
  const hp = use.hp ? Math.min(target.maxHp - target.hp, roll(use.hp)) : 0;
  const en = use.en ? Math.min(target.maxEn - target.en, roll(use.en)) : 0;
  const id = target.id;
  return { ok: true, target: id, hp, en, crew: crew.map((c) => (c.id === id ? { ...c, hp: c.hp + hp, en: c.en + en } : c)) };
}
