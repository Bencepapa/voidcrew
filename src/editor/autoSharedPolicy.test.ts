// Run: npx tsx src/editor/autoSharedPolicy.test.ts
import assert from "node:assert/strict";
import { resolveAutoShared, sharedParamChoice, storedChoice } from "./autoSharedPolicy";

assert.equal(sharedParamChoice(""), null);
assert.equal(sharedParamChoice("?shared=on"), "on");
assert.equal(sharedParamChoice("?a=1&shared=ON"), "on");
assert.equal(sharedParamChoice("?shared=1"), "on");
assert.equal(sharedParamChoice("?shared=off"), "off");
assert.equal(sharedParamChoice("?shared=0"), "off");
assert.equal(sharedParamChoice("?shared=maybe"), null);

assert.equal(storedChoice(null), null);
assert.equal(storedChoice(undefined), null);
assert.equal(storedChoice("1"), "on");
assert.equal(storedChoice("0"), "off");
assert.equal(storedChoice("true"), null);

const guest = { param: null, stored: null, signedIn: false, dev: false } as const;
// a guest on the Pages build: off
assert.equal(resolveAutoShared(guest), false);
// a signed-in editor, or a dev build: on
assert.equal(resolveAutoShared({ ...guest, signedIn: true }), true);
assert.equal(resolveAutoShared({ ...guest, dev: true }), true);
// the stored switch wins over the default, both ways
assert.equal(resolveAutoShared({ ...guest, stored: "on" }), true);
assert.equal(resolveAutoShared({ ...guest, signedIn: true, stored: "off" }), false);
// the URL parameter wins over the stored switch
assert.equal(resolveAutoShared({ ...guest, param: "on", stored: "off" }), true);
assert.equal(resolveAutoShared({ ...guest, signedIn: true, dev: true, param: "off", stored: "on" }), false);

console.log("autoSharedPolicy: ok");
