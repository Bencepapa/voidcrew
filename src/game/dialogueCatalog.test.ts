// Run: npx tsx src/game/dialogueCatalog.test.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildDialogueCatalog, bundledDialogueId } from "./dialogueCatalogCore";

assert.equal(bundledDialogueId("../dialogues/void-fantasy.twee"), "void-fantasy");
assert.equal(bundledDialogueId("x\\y\\a.b.twee"), "a.b");

// every bundled file parses without errors
const dir = "src/dialogues";
const bundled = readdirSync(dir).filter(f => f.endsWith(".twee")).map(f => ({ id: bundledDialogueId(f), twee: readFileSync(`${dir}/${f}`, "utf8") }));
assert.ok(bundled.some(b => b.id === "void-fantasy"));
const base = buildDialogueCatalog(bundled);
const fantasy = base.get("void-fantasy")!;
assert.deepEqual(fantasy.dialogue.entries, ["Start Wizard", "Start Smith"]);
assert.deepEqual(fantasy.problems.filter(p => p.severity === "error"), []);

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
