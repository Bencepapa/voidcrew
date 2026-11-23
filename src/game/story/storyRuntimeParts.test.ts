// Run: npx tsx src/game/story/storyRuntimeParts.test.ts
// The pure parts of the game wiring: the host adapter, the effect routing order, the save gate.
import assert from "node:assert/strict";
import { PACK_SIZE, addItem, emptyInventory } from "../inventory";
import { createStoryHost } from "./storyHost";
import { applyStoryEffects, touchesInventory, type StoryEffectTarget } from "./storyEffects";
import { createSaveGate, hostCanSave } from "./storySaveGate";
import { storyFileId, storySources, buildStoryFromSources } from "./storyBundle";
import type { Effect } from "./storyEngine";

// host adapter: has() counts the live inventory, party() the live crew list
{
  let inv = emptyInventory(PACK_SIZE);
  inv = addItem(inv, "scrap", 3, { stackMax: () => 10 } as never).inv;
  let crew = ["reese"];
  const host = createStoryHost({ inventory: () => inv, party: () => crew });
  assert.equal(host.has("scrap"), 3);
  assert.equal(host.has("nothing"), 0);
  assert.equal(host.party("reese"), true);
  assert.equal(host.party("lyn"), false);
  crew = ["reese", "lyn"]; // read live, not captured
  assert.equal(host.party("lyn"), true);
  inv = emptyInventory(PACK_SIZE);
  assert.equal(host.has("scrap"), 0);
}

// effects reach the target once each, in the engine's order
{
  const seen: string[] = [];
  const target: StoryEffectTarget = {
    give: (i, n) => seen.push(`give ${i} ${n}`),
    take: (i, n) => seen.push(`take ${i} ${n}`),
    reward: (w, n) => seen.push(`reward ${w} ${n}`),
    shop: (s) => seen.push(`shop ${s ?? "-"}`),
    end: () => seen.push("end"),
    text: (t) => seen.push(`text ${t}`),
    banter: (s, t, r) => seen.push(`banter ${s}:${t}${r ? `>${r.speaker}:${r.text}@${r.delayMs}` : ""}`),
    chapterStarted: (c) => seen.push(`start ${c}`),
    chapterEnded: (c, n) => seen.push(`endch ${c}>${n}`),
    storyEnded: () => seen.push("storyEnded"),
    chapterBlocked: (c) => seen.push(`blocked ${c}`),
    questChanged: (id, s) => seen.push(`quest ${id} ${s}`),
    emit: (e, a) => seen.push(`emit ${e} ${a ?? ""}`.trim()),
    error: (e) => seen.push(`error ${e.message}`),
  };
  const effects: Effect[] = [
    { kind: "take", item: "ore", n: 2 },
    { kind: "reward", what: "credits", n: 50 },
    { kind: "give", item: "key", n: 1 },
    { kind: "questChanged", id: "q", state: "done" },
    { kind: "shop" },
    { kind: "text", file: "f", passage: "p", text: "intro" },
    { kind: "banter", file: "f", passage: "p", speaker: "mira", text: "hi", reply: { speaker: "rook", delayMs: 900, text: "yo" } },
    { kind: "emit", event: "x", arg: "y" },
    { kind: "chapterEnded", chapter: "c1", next: "c2" },
    { kind: "chapterStarted", chapter: "c2" },
    { kind: "chapterBlocked", chapter: "c2" },
    { kind: "storyEnded" },
    { kind: "error", severity: "error", message: "boom" },
    { kind: "end" },
  ];
  applyStoryEffects(effects, target);
  assert.deepEqual(seen, [
    "take ore 2", "reward credits 50", "give key 1", "quest q done", "shop -", "text intro",
    "banter mira:hi>rook:yo@900", "emit x y", "endch c1>c2", "start c2", "blocked c2", "storyEnded", "error boom", "end",
  ]);
  assert.equal(touchesInventory(effects), true);
  assert.equal(touchesInventory([{ kind: "end" }, { kind: "emit", event: "e" }]), false);
}

// save gate: postponed while blocked, once when it ends
{
  let blocked = true;
  let saves = 0;
  const gate = createSaveGate(() => !blocked, () => saves++);
  gate.request();
  gate.request();
  assert.equal(saves, 0);
  assert.equal(gate.pending, true);
  gate.flush();
  assert.equal(saves, 0);
  blocked = false;
  gate.flush();
  assert.equal(saves, 1);
  assert.equal(gate.pending, false);
  gate.flush();
  assert.equal(saves, 1); // nothing pending: no extra save
  gate.request();
  assert.equal(saves, 2); // allowed: at once
}
assert.equal(hostCanSave(true, false), true);
assert.equal(hostCanSave(false, false), false); // engine dialogue / shop / cutscene
assert.equal(hostCanSave(true, true), false); // an old dialogue library's window

// bundle: file ids, stable order, no campaign = no story
assert.equal(storyFileId("./npc-kovacs.twee"), "npc-kovacs");
assert.equal(storyFileId("C:\\x\\a.TWEE"), "a");
assert.deepEqual(storySources({ "./b.twee": "B", "./a.twee": "A" }).map((s) => s.id), ["a", "b"]);
assert.equal(buildStoryFromSources([{ id: "lonely", twee: ":: FileData\n@kind chapter\n:: P [start]\n@npc x\nhi\n" }]).bundle.campaign, undefined);

console.log("storyRuntimeParts ok");
