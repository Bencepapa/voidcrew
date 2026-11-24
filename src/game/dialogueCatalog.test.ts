// Run: npx tsx src/game/dialogueCatalog.test.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildDialogueCatalog, buildDialogueCatalogChecked, bundledDialogueId } from "./dialogueCatalogCore";

assert.equal(bundledDialogueId("../dialogues/void-fantasy.twee"), "void-fantasy");
assert.equal(bundledDialogueId("x\\y\\a.b.twee"), "a.b");

// every bundled file parses without errors
const dir = "src/dialogues";
// (tesztsztori: remove together - the test story's fallback library is not part of this sample check, see src/story/TESZTSZTORI-REMOVE.md)
// (voidfantasy.twee is the published library pulled from the shared store by `npm run pull:shared`, not the hand-made sample)
const bundled = readdirSync(dir).filter(f => f.endsWith(".twee") && !f.startsWith("tesztsztori") && f !== "voidfantasy.twee").map(f => ({ id: bundledDialogueId(f), twee: readFileSync(`${dir}/${f}`, "utf8") }));
assert.ok(bundled.some(b => b.id === "void-fantasy"));
const base = buildDialogueCatalog(bundled);
const fantasy = base.get("void-fantasy")!;
assert.deepEqual(fantasy.dialogue.entries, ["Start Wizard", "Start Smith"]);
assert.deepEqual(fantasy.problems.filter(p => p.severity === "error"), []);

// @shop ids are checked against the bundled shops (src/shops/*.json): the sample's two are known
const shopIds = new Set(readdirSync("src/shops").filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, "")));
const checked = buildDialogueCatalogChecked(shopIds, bundled);
assert.deepEqual(checked.get("void-fantasy")!.problems, fantasy.problems);
assert.deepEqual(checked.get("void-fantasy")!.problems.filter(p => p.message.startsWith("Unknown shop")), []);
// ...and an id that is not there warns
const strict = buildDialogueCatalogChecked(new Set(["wizard-shop"]), bundled);
assert.deepEqual(strict.get("void-fantasy")!.problems.filter(p => p.message.startsWith("Unknown shop")).map(p => p.passage), ["Smith buy"]);

// a later layer (a local draft) overrides the bundled one with the same id, and adds its own
const draft = ":: StoryTitle\nMine\n\n:: Start\nHello\n[[Bye->End]]\n\n:: End\n@end\nBye\n";
const merged = buildDialogueCatalog(bundled, [{ id: "void-fantasy", twee: draft }, { id: "extra", twee: draft }]);
assert.deepEqual([...merged.keys()], ["extra", "void-fantasy"]);
assert.equal(merged.get("void-fantasy")!.dialogue.title, "Mine");
assert.deepEqual(merged.get("extra")!.dialogue.entries, ["Start"]);
// the bundled sources are untouched
assert.equal(base.get("void-fantasy")!.dialogue.title, "Void Fantasy");

// an unknown library is simply absent
assert.equal(merged.get("nope"), undefined);
console.log("dialogueCatalog tests passed");
