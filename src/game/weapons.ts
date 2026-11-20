import type { Weapon } from "./combat";

// The weapons and tools there are (what the shop sells, what the crew carries), and an
// owned weapon as it fires. Kept apart from meta.ts (the base's saved state, which
// needs the browser) so the inventory's rules can use them under plain Node.

// the weapons and tools there are: the crew's own, and what the shop sells
export interface WeaponType extends Weapon {
  blurb: string;
  // credits at the shop
  price: number;
  // holding it takes both hands (see inventory.ts)
  twoHanded?: boolean;
}

export const WEAPON_TYPES: Record<string, WeaponType> = {
  pulse_rifle: {
    name: "Pulse rifle",
    blurb: "Three-shot bursts, good at range.",
    price: 220,
    kind: "shot",
    amount: [5, 9],
    cooldownMs: 4000,
    range: 8,
    accuracy: 0.95,
    falloff: 0.05,
    sway: 0.035,
    aimZoom: 1.8,
    burst: 3,
    twoHanded: true,
  },
  arc_welder: {
    name: "Arc welder",
    blurb: "Short reach, heavy damage.",
    price: 180,
    kind: "shot",
    amount: [14, 22],
    cooldownMs: 5000,
    range: 3,
    accuracy: 0.9,
    falloff: 0.15,
    sway: 0.05,
    aimZoom: 1,
  },
  shock_emitter: {
    name: "Shock emitter",
    blurb: "Light damage, but every hit stuns.",
    price: 200,
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
  stim_injector: { name: "Stim injector", blurb: "Patches the crew up.", price: 160, kind: "heal", amount: [8, 14], cooldownMs: 8000 },
  sidearm: {
    name: "Sidearm",
    blurb: "Quick and steady, modest damage.",
    price: 90,
    kind: "shot",
    amount: [6, 10],
    cooldownMs: 2500,
    range: 5,
    accuracy: 0.92,
    falloff: 0.08,
    sway: 0.04,
    aimZoom: 1.1,
  },
  scatter_gun: {
    name: "Scatter gun",
    blurb: "Devastating up close, useless far.",
    price: 260,
    kind: "shot",
    amount: [18, 30],
    cooldownMs: 6000,
    range: 3,
    accuracy: 0.95,
    falloff: 0.25,
    sway: 0.06,
    aimZoom: 1,
    twoHanded: true,
  },
  rail_rifle: {
    name: "Rail rifle",
    blurb: "One scoped, very hard shot. Slow.",
    price: 420,
    kind: "shot",
    amount: [26, 38],
    cooldownMs: 9000,
    range: 10,
    accuracy: 0.98,
    falloff: 0.02,
    sway: 0.025,
    aimZoom: 4,
    twoHanded: true,
  },
  // Void Fantasy's: all of them from a distance
  spear: {
    name: "Throwing spear",
    blurb: "A hurled spear: steady, hard-hitting.",
    price: 150,
    kind: "shot",
    amount: [8, 13],
    cooldownMs: 4500,
    range: 5,
    accuracy: 0.92,
    falloff: 0.08,
    sway: 0.04,
    aimZoom: 1.4,
  },
  crossbow: {
    name: "Crossbow",
    blurb: "A heavy bolt, slow to wind.",
    price: 260,
    kind: "shot",
    amount: [14, 22],
    cooldownMs: 8000,
    range: 7,
    accuracy: 0.95,
    falloff: 0.05,
    sway: 0.035,
    aimZoom: 2.2,
    twoHanded: true,
  },
  longbow: {
    name: "Longbow",
    blurb: "Long reach, one careful arrow.",
    price: 300,
    kind: "shot",
    amount: [10, 17],
    cooldownMs: 6500,
    range: 10,
    accuracy: 0.96,
    falloff: 0.03,
    sway: 0.03,
    aimZoom: 3,
    twoHanded: true,
  },
  arcane_staff: {
    name: "Arcane staff",
    blurb: "Bolts of cold light that stun.",
    price: 240,
    kind: "shot",
    amount: [5, 9],
    cooldownMs: 4000,
    range: 7,
    accuracy: 0.95,
    falloff: 0.04,
    sway: 0.03,
    aimZoom: 1.5,
    stunMs: 1800,
  },
  healing_staff: { name: "Healing staff", blurb: "Mends wounds with warm light.", price: 220, kind: "heal", amount: [9, 15], cooldownMs: 9000 },
  trauma_kit: { name: "Trauma kit", blurb: "A bigger heal, slower.", price: 300, kind: "heal", amount: [16, 24], cooldownMs: 12000 },
};

// the weapons made for Void Fantasy (the rest are Void Crew's): the shop only offers a world its own
const FANTASY_WEAPONS = new Set(["spear", "crossbow", "longbow", "arcane_staff", "healing_staff", "trauma_kit"]);
export const weaponInWorld = (id: string, world: "scifi" | "fantasy"): boolean => FANTASY_WEAPONS.has(id) === (world === "fantasy");

// an owned weapon: its type, and how far it's been upgraded (0..MAX_LEVEL)
export interface OwnedWeapon {
  id: number;
  type: string;
  level: number;
}
export const MAX_LEVEL = 3;

// an owned weapon as it fires: each level adds 15% to what it deals (or
// heals) and takes 7% off its cooldown
export function weaponStats(owned: OwnedWeapon): Weapon {
  const type = WEAPON_TYPES[owned.type];
  const more = 1 + 0.15 * owned.level;
  return {
    ...type,
    name: owned.level ? `${type.name} +${owned.level}` : type.name,
    amount: [Math.round(type.amount[0] * more), Math.round(type.amount[1] * more)],
    cooldownMs: Math.round(type.cooldownMs * (1 - 0.07 * owned.level)),
  };
}
