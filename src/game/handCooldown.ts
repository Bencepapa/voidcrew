// Weapon cooldowns are per hand: a crewmate's left and right hand cool down on
// their own, so using one does not block the other. The key names a hand
// ("reese:1"; a two-handed weapon always uses the right hand's, see
// effectiveHand in inventory.ts). `ReadyAt` says when each hand is next ready
// (game clock ms); a missing key is ready.
import type { HandIndex } from "./inventory";

export type ReadyAt = Readonly<Record<string, number>>;

export const handCooldownKey = (crew: string, hand: HandIndex): string => `${crew}:${hand}`;

export const readyAtOf = (ready: ReadyAt, crew: string, hand: HandIndex): number => ready[handCooldownKey(crew, hand)] ?? 0;

// when a hand is used (now) and its weapon needs `cooldownMs` to be ready again
export const withCooldown = (ready: ReadyAt, crew: string, hand: HandIndex, now: number, cooldownMs: number): ReadyAt => ({
  ...ready,
  [handCooldownKey(crew, hand)]: now + cooldownMs,
});
