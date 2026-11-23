// Run: npx tsx src/game/actorSize.test.ts
// (actors.ts itself can't load here - it pulls in the map module's Vite globs - so the helpers there,
// actorHeight / actorEyeHeight / actorBody, are checked as what they are: the written value times actorSize)
import assert from "node:assert/strict";
import {
  ACTOR_SIZE_MAX, ACTOR_SIZE_MIN, actorSize, actorSizes, actorSizesJson, clampActorSize, readActorSizes,
  resetActorSizes, setActorSize, sizedBody, subscribeActorSizes,
} from "./actorSize";

// clamping: into the range, to hundredths, junk is 1
assert.equal(clampActorSize(1), 1);
assert.equal(clampActorSize(0.1), ACTOR_SIZE_MIN);
assert.equal(clampActorSize(9), ACTOR_SIZE_MAX);
assert.equal(clampActorSize(0.8333), 0.83);
assert.equal(clampActorSize(NaN), 1);
assert.equal(clampActorSize(Infinity), 1);
assert.equal(clampActorSize("2"), 1);
assert.equal(clampActorSize(undefined), 1);

// reading a table: clamped, 1s dropped, junk and shared NPCs ignored
assert.deepEqual(readActorSizes({ goblin1: 0.7, goblin2: 1, robot1: 5, wolf1: "big", "bad name": 0.6, "scifi_actor_00000000-0000-4000-8000-000000000000": 0.6 }),
  { goblin1: 0.7, robot1: ACTOR_SIZE_MAX });
assert.deepEqual(readActorSizes(null), {});
assert.deepEqual(readActorSizes([0.6]), {});
assert.deepEqual(readActorSizes("x"), {});

// serialisation: sorted names, a trailing newline, and it reads back the same
assert.equal(actorSizesJson({}), "{}\n");
const json = actorSizesJson({ goblin2: 0.9, goblin1: 0.75 });
assert.equal(json, '{\n  "goblin1": 0.75,\n  "goblin2": 0.9\n}\n');
assert.deepEqual(readActorSizes(JSON.parse(json)), { goblin1: 0.75, goblin2: 0.9 });

// the body: smaller fits lower, bigger needs more but not past a normal ceiling, the step stays
const body = { headroom: 0.8, step: 0.25 };
assert.equal(sizedBody(body, 1), body);
assert.deepEqual(sizedBody(body, 0.5), { headroom: 0.4, step: 0.25 });
assert.deepEqual(sizedBody(body, 1.5), { headroom: 1, step: 0.25 });
assert.deepEqual(sizedBody({ headroom: 0.25, step: 0 }, 1.5), { headroom: 0.375, step: 0 });

// the shipped file is empty: every type at its written size
assert.deepEqual(actorSizes(), {});
assert.equal(actorSize("goblin1"), 1);
assert.equal(actorSize("nope"), 1);

// the live table: the factor follows it, listeners hear it
let told = 0;
const stop = subscribeActorSizes(() => told++);
setActorSize("goblin1", 0.5);
assert.equal(told, 1);
assert.equal(actorSize("goblin1"), 0.5);
assert.equal(actorSize("goblin2"), 1);
assert.equal(0.8 * actorSize("goblin1"), 0.4);
assert.deepEqual(actorSizes(), { goblin1: 0.5 });
setActorSize("goblin1", 0.5);
assert.equal(told, 1, "no change, no news");
setActorSize("goblin1", 3);
assert.equal(actorSize("goblin1"), ACTOR_SIZE_MAX);
setActorSize("goblin1", 1);
assert.deepEqual(actorSizes(), {});
setActorSize("wolf1", 0.6);
setActorSize("wolf1", undefined);
assert.deepEqual(actorSizes(), {});
// a shared NPC takes no factor
setActorSize("scifi_actor_00000000-0000-4000-8000-000000000000", 0.6);
assert.deepEqual(actorSizes(), {});
setActorSize("wolf1", 0.6);
setActorSize("robot1", 1.2);
resetActorSizes();
assert.deepEqual(actorSizes(), {});
const heard = told;
resetActorSizes();
assert.equal(told, heard, "resetting an empty table says nothing");
stop();
setActorSize("wolf1", 0.7);
assert.equal(told, heard, "after unsubscribing");
resetActorSizes();
console.log("actorSize ok");
