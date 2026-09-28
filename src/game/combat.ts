import type { ActorState, BodyPart } from "./actors";

// Combat: each crewmate has one weapon (or tool) with a cooldown. Using it
// drops the game into bullet time and opens the aiming overlay: pick an
// enemy and a body part - then, with the aiming mini-game on, a crosshair
// sways around that part and the shot goes wherever it is when fired (the
// part, the one next to it, another enemy, the wall); with it off, the hit
// chance decides. Afterwards time runs on and the weapon cools down.

export interface Weapon {
  name: string;
  // shot: aimed at an enemy's body part; heal: patches up the crew
  kind: "shot" | "heal";
  // hit points dealt (a shot) or restored (a heal)
  amount: [number, number];
  cooldownMs: number;
  // shots: how far (cells) it reaches, how steady it is at point blank and
  // how much that drops per cell, and how far the crosshair sways (a
  // fraction of the view's height)
  range?: number;
  accuracy?: number;
  falloff?: number;
  sway?: number;
  // the view's magnification while aiming with the mini-game (a scope):
  // 1 = none (a pistol), about 2 for a scoped rifle, 4+ for a sniper rifle
  aimZoom?: number;
  // a stun weapon: every hit stuns, for this long
  stunMs?: number;
  // rapid fire: shots per use, each aimed on its own (default 1)
  burst?: number;
}

export const CREW_WEAPONS: Record<string, Weapon> = {
  reese: {
    name: "Pulse rifle",
    kind: "shot",
    amount: [5, 9],
    cooldownMs: 4000,
    range: 8,
    accuracy: 0.95,
    falloff: 0.05,
    sway: 0.035,
    aimZoom: 1.8,
    burst: 3,
  },
  lyn: {
    name: "Arc welder",
    kind: "shot",
    amount: [14, 22],
    cooldownMs: 5000,
    range: 3,
    accuracy: 0.9,
    falloff: 0.15,
    sway: 0.05,
    aimZoom: 1,
  },
  orion: {
    name: "Shock emitter",
    kind: "shot",
    amount: [4, 8],
    cooldownMs: 6000,
    range: 6,
    accuracy: 0.95,
    falloff: 0.04,
    sway: 0.03,
    aimZoom: 1.3,
    stunMs: 2500,
  },
  kell: { name: "Stim injector", kind: "heal", amount: [8, 14], cooldownMs: 8000 },
};

// what a hit on each body part does: its damage multiplier and effect
export const PART_EFFECTS: Record<BodyPart, { damage: number; effect?: "stun" | "disarm" | "slow"; ms?: number }> = {
  head: { damage: 1.8, effect: "stun", ms: 1500 },
  torso: { damage: 1 },
  armL: { damage: 0.8, effect: "disarm", ms: 4000 },
  armR: { damage: 0.8, effect: "disarm", ms: 4000 },
  legs: { damage: 0.8, effect: "slow", ms: 6000 },
};

// a hit on a weak spot (see ActorType.crits) multiplies the part's damage
export const CRIT_DAMAGE = 2;

// what a shot hit: an actor's body part (and weak spot, if it was on one),
// or something else
export type ShotResult =
  | { kind: "actor"; actor: number; part: BodyPart; crit?: string }
  | { kind: "miss"; hit: "wall" | "prop" | "nothing" };

// bullet time: how fast the world runs while aiming
export const AIM_TIME_RATE = 0.08;

export const rollAmount = ([lo, hi]: [number, number]) => lo + Math.floor(Math.random() * (hi - lo + 1));

// the base chance to hit at a distance (cells), before cover and size
export function weaponAccuracy(weapon: Weapon, distance: number): number {
  return Math.max(0.05, (weapon.accuracy ?? 1) - (weapon.falloff ?? 0) * Math.max(0, distance - 1));
}

// A hit: the actor after it, and what to log.
export function applyHit(
  actor: ActorState,
  part: BodyPart,
  weapon: Weapon,
  now: number,
  crit = false,
): { actor: ActorState; damage: number; killed: boolean; effect: string | null } {
  const rule = PART_EFFECTS[part];
  const damage = Math.max(1, Math.round(rollAmount(weapon.amount) * rule.damage * (crit ? CRIT_DAMAGE : 1)));
  const hp = Math.max(0, actor.hp - damage);
  let next: ActorState = { ...actor, hp, hitAt: now, hostile: true };
  let effect: string | null = null;
  if (hp === 0) {
    next = { ...next, diedAt: now };
    return { actor: next, damage, killed: true, effect: null };
  }
  const stunMs = Math.max(weapon.stunMs ?? 0, rule.effect === "stun" ? (rule.ms ?? 0) : 0);
  if (stunMs) {
    next = { ...next, stunnedUntil: Math.max(next.stunnedUntil, now + stunMs) };
    effect = "stunned";
  }
  if (rule.effect === "disarm") {
    next = { ...next, disarmedUntil: now + (rule.ms ?? 0) };
    effect = "disarmed";
  }
  if (rule.effect === "slow") {
    next = { ...next, slowedUntil: now + (rule.ms ?? 0) };
    effect = "slowed";
  }
  return { actor: next, damage, killed: false, effect };
}
