// Run: npx tsx src/game/editorWipe.test.ts
import assert from "node:assert/strict";
import { initialCrew } from "./crew";
import { reviveCrew, wipeOutcome } from "./editorWipe";

const down = initialCrew.map((c) => ({ ...c, hp: 0 }));
const hurt = initialCrew.map((c, i) => ({ ...c, hp: i === 0 ? 1 : 0 }));

// in play: the last crewmate falling is a wipe; one standing is not
assert.equal(wipeOutcome(down, false, false), "wipe");
assert.equal(wipeOutcome(hurt, false, false), "none");
// with the editor on: revived instead
assert.equal(wipeOutcome(down, false, true), "revive");
assert.equal(wipeOutcome(hurt, false, true), "none");
// a wipe already on is never decided twice (a wipe from play, shown after the editor is left, stays)
assert.equal(wipeOutcome(down, true, false), "none");
assert.equal(wipeOutcome(down, true, true), "none");
// nobody in the crew is not a wipe
assert.equal(wipeOutcome([], false, false), "none");

// the revival: full health, in place, everything else kept; the input is not changed
const spent = down.map((c) => ({ ...c, en: 3 }));
const back = reviveCrew(spent);
assert.deepEqual(back.map((c) => c.hp), initialCrew.map((c) => c.maxHp));
assert.deepEqual(back.map((c) => c.en), spent.map(() => 3));
assert.deepEqual(back.map((c) => c.id), initialCrew.map((c) => c.id));
assert.equal(spent[0].hp, 0);

console.log("editorWipe ok");
