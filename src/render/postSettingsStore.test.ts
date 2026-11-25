import assert from "node:assert/strict";
import { defaultPostSettings } from "./postSettings";
import { parsePostText, pickPostSaved, postToText } from "./postSettingsStore";

const base = defaultPostSettings();

// round trip: the text of the settings reads back as the same kept settings
const tuned = { ...base, postDark: true, postDarkness: 0.55, postWarm: 2.4, postVignette: 0.2, postOthers: { mode: "keep" as const, fade: 0.3 } };
tuned.postRules = tuned.postRules.map((rule, i) => (i === 1 ? { ...rule, hue: 250, mode: "fade" as const, target: "#112233" } : rule));
const back = parsePostText(postToText(tuned));
assert.deepEqual(back, pickPostSaved(tuned));

// the session switches are not part of the text
assert.ok(!("postMask" in (back ?? {})));
assert.ok(!("postLookOff" in (back ?? {})));

// invalid text is refused, a text without the look's keys too
assert.equal(parsePostText("hello"), undefined);
assert.equal(parsePostText("{}"), undefined);
assert.equal(parsePostText("[1,2]"), undefined);
assert.equal(parsePostText(JSON.stringify({ format: "something-else", postDark: true })), undefined);

// values are clamped, bad fields dropped, missing rule fields come from the slot's default
const wild = parsePostText(JSON.stringify({ postDarkness: 9, postWarm: -3, postVignette: "x", postRules: [{ hue: 999, mode: "bogus", target: "red" }] }));
assert.equal(wild?.postDarkness, 1);
assert.equal(wild?.postWarm, 0.5);
assert.equal(wild?.postVignette, undefined);
assert.equal(wild?.postRules?.length, 4);
assert.equal(wild?.postRules?.[0].hue, 360);
assert.equal(wild?.postRules?.[0].mode, base.postRules[0].mode);
assert.equal(wild?.postRules?.[0].target, base.postRules[0].target);
assert.deepEqual(wild?.postRules?.[1], base.postRules[1]);

// a copy is a copy: changing the picked rules does not touch the settings
const picked = pickPostSaved(base);
picked.postRules[0].hue = 1;
assert.notEqual(base.postRules[0].hue, 1);
console.log("postSettingsStore ok");