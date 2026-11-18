// Run: npx tsx src/editor/mapDraftLogic.test.ts
import assert from "node:assert/strict";
import { fingerprint, planDraft } from "./mapDraftLogic";

const base = { name: "a", cells: [1, 2, 3] };
const edited = { name: "a", cells: [1, 2, 4] };
assert.equal(fingerprint(base), fingerprint(structuredClone(base)));
assert.notEqual(fingerprint(base), fingerprint(edited));
assert.deepEqual(planDraft(undefined, base), { kind: "none" });
assert.deepEqual(planDraft({ id: "a", savedAt: 1, baseFp: fingerprint(base), file: base }, base), { kind: "same" });
assert.deepEqual(planDraft({ id: "a", savedAt: 1, baseFp: fingerprint(base), file: edited }, base), { kind: "restore", stale: false });
assert.deepEqual(planDraft({ id: "a", savedAt: 1, baseFp: "x", file: edited }, base), { kind: "restore", stale: true });
console.log("mapDraftLogic ok");
