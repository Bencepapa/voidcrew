// Run: npx tsx src/game/playMode.test.ts
import assert from "node:assert/strict";
import { playParamChoice, resolvePlayActive } from "./playModeLogic";

// the URL
assert.equal(playParamChoice("?play=on"), true);
assert.equal(playParamChoice("?world=fantasy&play=off"), false);
assert.equal(playParamChoice("?play=1"), true);
assert.equal(playParamChoice("?play=false"), false);
assert.equal(playParamChoice("?play=ON"), true);
assert.equal(playParamChoice("?play=maybe"), null);
assert.equal(playParamChoice("?enemies=off"), null);
assert.equal(playParamChoice(""), null);

// every combination: param x editorAvailable x toggled
for (const param of [null, true, false]) {
  for (const editorAvailable of [true, false]) {
    for (const toggled of [null, true, false]) {
      const expected = toggled ?? param ?? !editorAvailable;
      assert.equal(resolvePlayActive({ param, editorAvailable, toggled }), expected, JSON.stringify({ param, editorAvailable, toggled }));
    }
  }
}
// the rules in words
assert.equal(resolvePlayActive({ param: null, editorAvailable: true, toggled: null }), false, "an editor build starts wandering");
assert.equal(resolvePlayActive({ param: null, editorAvailable: false, toggled: null }), true, "a build without an editor plays");
assert.equal(resolvePlayActive({ param: true, editorAvailable: true, toggled: null }), true, "?play=on");
assert.equal(resolvePlayActive({ param: false, editorAvailable: false, toggled: null }), false, "?play=off");
assert.equal(resolvePlayActive({ param: false, editorAvailable: true, toggled: true }), true, "the button speaks after the URL");
assert.equal(resolvePlayActive({ param: true, editorAvailable: true, toggled: false }), false);

console.log("playMode ok");
