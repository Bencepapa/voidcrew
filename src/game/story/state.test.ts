// Run: npx tsx src/game/story/state.test.ts
import assert from "node:assert/strict";
import { canSave, closeChapter, deserializeState, enterChapter, markOnce, markVisited, newState, questState, readVar, serializeState, setVar, setVarDebug, transitionQuest, type VarOwner } from "./state";

const base = () => enterChapter(
  newState({ heroism: 0, tyrant_fate: "none" }, { "npc-kovacs": { met: false } }),
  "ch1",
  { heard_rumor: false },
);
const ch1: VarOwner = { fileId: "ch1", kind: "chapter", returns: ["heroism"] };
const camp: VarOwner = { fileId: "campaign", kind: "campaign" };
const kov: VarOwner = { fileId: "npc-kovacs", kind: "global" };

// reading
{
  const s = base();
  assert.equal(readVar(s, { name: "heard_rumor" }, ch1), false);
  assert.equal(readVar(s, { name: "heroism" }, ch1), undefined); // not own
  assert.equal(readVar(s, { scope: "campaign", name: "heroism" }, ch1), 0);
  assert.equal(readVar(s, { name: "heroism" }, camp), 0);
  assert.equal(readVar(s, { scope: "npc-kovacs", name: "met" }, ch1), false);
  assert.equal(readVar(s, { scope: "kovacs", name: "met" }, ch1), false); // alias without npc-
  assert.equal(readVar(s, { name: "met" }, kov), false);
  assert.equal(readVar(s, { name: "heard_rumor" }, { fileId: "ch2", kind: "chapter" }), undefined); // another chapter's
}

// writing: the scope rules
{
  const s = base();
  const ok = (r: ReturnType<typeof setVar>) => { assert.ok(r.ok, r.ok ? "" : r.error); return r.state; };
  const err = (r: ReturnType<typeof setVar>, re: RegExp) => assert.ok(!r.ok && re.test(r.error), r.ok ? "should fail" : r.error);

  const a = ok(setVar(s, { name: "heard_rumor" }, true, ch1));
  assert.equal(a.chapterVars.heard_rumor, true);
  assert.equal(s.chapterVars.heard_rumor, false); // pure
  assert.equal(ok(setVar(s, { scope: "campaign", name: "heroism" }, 2, ch1)).campaign.heroism, 2);
  err(setVar(s, { scope: "campaign", name: "tyrant_fate" }, "x", ch1), /not in the @returns/);
  assert.equal(ok(setVar(s, { scope: "campaign", name: "tyrant_fate" }, "x", camp)).campaign.tyrant_fate, "x");
  err(setVar(s, { scope: "campaign", name: "heroism" }, 1, kov), /global file/);
  err(setVar(s, { scope: "npc-kovacs", name: "met" }, true, ch1), /read-only/);
  err(setVar(s, { scope: "campaign", name: "nope" }, 1, camp), /Unknown campaign/);
  err(setVar(s, { name: "nope" }, 1, ch1), /Unknown variable/);
  err(setVar(s, { name: "heard_rumor" }, true, { fileId: "ch2", kind: "chapter" }), /not active/);
  assert.equal(ok(setVar(s, { name: "met" }, true, kov)).globals["npc-kovacs"].met, true);
  err(setVar(s, { name: "x" }, true, kov), /Unknown variable/);

  // the debug write skips the rules but needs an existing variable
  assert.ok(setVarDebug(s, "campaign", "tyrant_fate", "killed").ok);
  assert.ok(setVarDebug(s, "chapter", "heard_rumor", true).ok);
  assert.ok(setVarDebug(s, "kovacs", "met", true).ok);
  assert.ok(!setVarDebug(s, "chapter", "nope", true).ok);
  assert.ok(!setVarDebug(s, "nope", "x", true).ok);
}

// quest transitions
{
  let s = base();
  assert.equal(questState(s, "sword"), "none");
  assert.equal(transitionQuest(s, "sword", "done"), s); // not started: unchanged (same object)
  s = transitionQuest(s, "sword", "start");
  assert.equal(questState(s, "sword"), "active");
  assert.equal(transitionQuest(s, "sword", "start"), s);
  s = transitionQuest(s, "sword", "ready");
  assert.equal(questState(s, "sword"), "ready");
  s = transitionQuest(s, "sword", "unready");
  assert.equal(questState(s, "sword"), "active");
  s = transitionQuest(transitionQuest(s, "sword", "ready"), "sword", "done");
  assert.equal(questState(s, "sword"), "done");
  assert.equal(transitionQuest(s, "sword", "fail"), s);
  assert.equal(questState(transitionQuest(base(), "a", "start"), "a"), "active");
  assert.equal(questState(transitionQuest(transitionQuest(base(), "a", "start"), "a", "fail"), "a"), "failed");
}

// closing a chapter
{
  let s = base();
  for (const id of ["sword", "ring", "old", "fin", "never"]) s = id === "never" ? s : transitionQuest(s, id, "start");
  s = transitionQuest(transitionQuest(s, "old", "ready"), "old", "unready");
  s = transitionQuest(transitionQuest(s, "fin", "ready"), "fin", "done");
  const must = (r: ReturnType<typeof setVar>) => { assert.ok(r.ok); return r.state; };
  s = must(setVar(s, { name: "heard_rumor" }, true, ch1));
  s = must(setVar(s, { scope: "campaign", name: "heroism" }, 2, ch1));
  s = markOnce(markVisited(markVisited(s, "ch1/Intro"), "npc-kovacs/Talk"), "ch1/Intro");
  const def = { id: "ch1", quests: [{ id: "sword", fate: "expires" }, { id: "ring", fate: "carry" }, { id: "fin", fate: "expires" }, { id: "never", fate: "carry" }] };
  const c = closeChapter(s, def);
  assert.equal(c.chapter, null);
  assert.deepEqual(c.chapterVars, {});
  assert.equal(c.campaign.heroism, 2); // campaign values stay
  assert.equal(questState(c, "sword"), "expired"); // tombstone
  assert.equal(questState(c, "ring"), "active"); // carried
  assert.deepEqual(c.carried, { ring: "ch1" });
  assert.equal(questState(c, "fin"), "done"); // finished ones are kept
  assert.equal(questState(c, "never"), "none");
  assert.equal(questState(c, "old"), "active"); // not in the chapter's list: untouched
  assert.deepEqual(c.visited, ["npc-kovacs/Talk"]);
  assert.deepEqual(c.once, []);
  assert.equal(s.chapter, "ch1"); // pure
}

// canSave
assert.equal(canSave({}), true);
assert.equal(canSave({ dialogue: false, shop: false, cutscene: false }), true);
assert.equal(canSave({ dialogue: true }), false);
assert.equal(canSave({ shop: true }), false);
assert.equal(canSave({ cutscene: true }), false);

// save / load
{
  const s = markVisited(transitionQuest(base(), "ring", "start"), "ch1/Intro");
  const back = deserializeState(serializeState(s));
  assert.deepEqual(back, s);
  assert.equal(deserializeState("not json"), null);
  assert.equal(deserializeState("{}"), null);
  assert.equal(deserializeState(JSON.stringify({ ...s, v: 99 })), null); // from a newer build
  assert.equal(deserializeState(JSON.stringify({ ...s, quests: 3 })), null);
  assert.equal(deserializeState("null"), null);
}

console.log("state ok");
