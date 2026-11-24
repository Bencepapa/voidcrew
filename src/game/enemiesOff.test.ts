// Run: npx tsx src/game/enemiesOff.test.ts
import assert from "node:assert/strict";
import type { ActorState } from "./actors";
import { enemiesParamChoice, enemiesStoredChoice, holdEnemies, isEnemy, resolveEnemiesOff } from "./enemiesOff";

// the URL and the stored switch
assert.equal(enemiesParamChoice("?enemies=off"), true);
assert.equal(enemiesParamChoice("?world=fantasy&enemies=off"), true);
assert.equal(enemiesParamChoice("?enemies=on"), false);
assert.equal(enemiesParamChoice("?enemies=maybe"), null);
assert.equal(enemiesParamChoice(""), null);
assert.equal(enemiesStoredChoice("1"), true);
assert.equal(enemiesStoredChoice("0"), false);
assert.equal(enemiesStoredChoice(null), null);
assert.equal(enemiesStoredChoice("yes"), null);
// the URL beats the stored switch; nothing says: enemies are on
assert.equal(resolveEnemiesOff(true, false), true);
assert.equal(resolveEnemiesOff(false, true), false);
assert.equal(resolveEnemiesOff(null, true), true);
assert.equal(resolveEnemiesOff(null, null), false);

// who is held
assert.equal(isEnemy({}), true);
assert.equal(isEnemy({ friendly: true }), false);
assert.equal(isEnemy({ ally: true }), false);

const actor = (id: number, extra: Partial<ActorState> = {}) => ({ id, type: "robot1", ...extra }) as ActorState;
const before = [actor(0), actor(1, { friendly: true }), actor(2, { ally: true }), actor(3)];
// a step moved all four (new objects)
const stepped = before.map((a) => ({ ...a, waitUntil: 99 }) as ActorState);
const held = holdEnemies(before, stepped);
assert.equal(held[0], before[0]);
assert.equal(held[3], before[3]);
assert.equal(held[1], stepped[1]);
assert.equal(held[2], stepped[2]);
// nothing to hold: the very same array
assert.equal(holdEnemies(before, before), before);
const friendsOnly = [stepped[1], stepped[2]];
assert.equal(holdEnemies([before[1], before[2]], friendsOnly), friendsOnly);
// an arrival (no earlier state) is kept as it is; a shot taken between the ticks is in `before`
const arrival = actor(1000);
const hit = { ...before[3], hp: 1 } as ActorState;
const mixed = holdEnemies([before[0], hit], [{ ...before[0], waitUntil: 5 } as ActorState, { ...hit, waitUntil: 5 } as ActorState, arrival]);
assert.equal(mixed[0], before[0]);
assert.equal(mixed[1], hit);
assert.equal(mixed[2], arrival);

console.log("enemiesOff ok");
