import assert from "node:assert/strict";
import { applyUse } from "./itemUse";
import { ITEM_TYPES } from "./items";
import type { Crewmate } from "./types";

const mate = (id: string, hp: number, en = 10): Crewmate => ({ id, name: id, role: "MARINE", hp, maxHp: 20, en, maxEn: 10 });
const low = ([lo]: [number, number]) => lo;
const crew = [mate("a", 20), mate("b", 5), mate("c", 12)];

// a potion heals the drinker, capped at their maximum
const potion = ITEM_TYPES.potion_red.use!;
let r = applyUse([mate("a", 15), mate("b", 5)], "a", potion, ([, hi]) => hi);
assert.ok(r.ok && r.target === "a" && r.hp === 5 && r.crew[0].hp === 20);

// a full drinker: nothing happens (so nothing is used up)
r = applyUse(crew, "a", potion, low);
assert.deepEqual(r, { ok: false, reason: "nothing" });

// a medkit goes to the most hurt (by fraction), whoever holds it
r = applyUse(crew, "a", ITEM_TYPES.medkit.use!, low);
assert.ok(r.ok && r.target === "b" && r.hp === 12 && r.crew[1].hp === 17);

// a downed user can't use anything
assert.deepEqual(applyUse([mate("a", 0), mate("b", 5)], "a", ITEM_TYPES.medkit.use!, low), { ok: false, reason: "down" });

// energy only
r = applyUse([mate("a", 20, 2)], "a", ITEM_TYPES.potion_blue.use!, ([, hi]) => hi);
assert.ok(r.ok && r.hp === 0 && r.en === 8 && r.crew[0].en === 10);
assert.deepEqual(applyUse([mate("a", 5, 10)], "a", ITEM_TYPES.potion_blue.use!, low), { ok: false, reason: "nothing" });

// given to one crewmate (dropped on their avatar): theirs to use, even a medkit meant for the most hurt
r = applyUse(crew, "a", ITEM_TYPES.medkit.use!, low, "c");
assert.ok(r.ok && r.target === "c" && r.crew[2].hp > 12);
assert.deepEqual(applyUse(crew, "a", ITEM_TYPES.medkit.use!, low, "a"), { ok: false, reason: "nothing" });
assert.deepEqual(applyUse([mate("a", 0), mate("b", 5)], "b", ITEM_TYPES.medkit.use!, low, "a"), { ok: false, reason: "down" });
assert.deepEqual(applyUse(crew, "a", ITEM_TYPES.medkit.use!, low, "nobody"), { ok: false, reason: "down" });

console.log("itemUse tests passed");
