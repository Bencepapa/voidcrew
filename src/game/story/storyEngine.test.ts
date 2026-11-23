// Run: npx tsx src/game/story/storyEngine.test.ts
import assert from "node:assert/strict";
import { StoryEngine, type Effect, type StoryHost } from "./storyEngine";
import { buildBundle } from "./storyParse";

const inv: Record<string, number> = {};
const party = new Set<string>();
const host: StoryHost = { has: i => inv[i] ?? 0, party: id => party.has(id) };

const CAMPAIGN = `:: FileData
@kind campaign
@var score = 0
@var fate = "none"
@start c1
:: R1 [chapter]
@chapter c1
@next c2 @if campaign.fate == "go"
@next end @if campaign.fate == "stop"
:: R2 [chapter]
@chapter c2
@next end
`;
const C1 = `:: FileData
@kind chapter
@var flag = false
@returns score, fate
:: Intro [on]
@on chapter_start
Chapter one begins.
:: Hi [start]
@npc bob
@overlay
@priority 1
@once
First hello.
[[Next->Second]]
:: Hi2 [start]
@npc bob
@overlay
@when flag
Flag hello.
@end
:: Hi3 [start]
@npc bob
@overlay
Plain hello.
@if flag
[[Flagged->Second]]
@endif
[[Jump->other/Remote]]
[[Bye->Bye]]
:: Second
@set flag = true
@set campaign.score += 2
Second text.
@end
:: Bye
@set campaign.fate = "go"
@endchapter
Bye text.
@set campaign.score += 10
@end
:: Stay
@endchapter
@set campaign.score += 1
Staying.
[[Continue->Stay2]]
:: Stay2
Still talking.
@end
:: Go [start]
@npc gate
[[Stay->Stay]]
:: Chain
@goto Tail
:: Tail
Tail text.
[[Back->Chain]]
:: Looper [start]
@npc looper
@goto Looper
:: Handler [on]
@on boom
@set campaign.score += 100
:: Bad [start]
@npc bad
@set campaign.nope = 1
@set flag += 1
@frob
[[Gone->Nowhere]]
Bad text.
:: Quest q [quest]
@goal g
@ready_when has("ore") >= 2
@fate expires
:: Q [start]
@npc qgiver
@if quest("q") == "none"
[[Take->Take]]
@endif
@if quest("q") == "ready"
[[Done->Done]]
@endif
[[Bye->Second]]
:: Take
@quest start q
@quest start q
Taken.
:: Done
@quest done q
@take ore 2
Done.
:: Em [on]
@on boom now
@set campaign.score += 1000
`;
const OTHER = `:: FileData
@kind global
@var seen = false
:: Remote
@set seen = true
Remote text.
:: Hi [start]
@npc bob
Global hello.
:: Hi4 [start]
@npc bob
@priority 5
@when seen
Seen hello.
:: Only [start]
@npc globby
Only global.
:: B [banter]
@on enemy_dead
@speaker mira
@once
@reply rook 1s
Mira says.
:: BR [banter]
@speaker rook
@when party("rook")
Rook answers.
:: G [on]
@on chapter_start
Global start.
`;
const C2 = `:: FileData
@kind chapter
@var x = 1
:: Intro [on]
@on chapter_start
Chapter two.
:: P [start]
@npc pil
Pilgrim.
`;

const { bundle, problems } = buildBundle([
  { id: "campaign", twee: CAMPAIGN }, { id: "c1", twee: C1 }, { id: "c2", twee: C2 }, { id: "other", twee: OTHER },
]);
assert.deepEqual(problems.filter(p => p.severity === "error"), []);

const fresh = () => {
  for (const k of Object.keys(inv)) delete inv[k];
  party.clear();
  const e = new StoryEngine(bundle, host);
  return { e, start: e.startCampaign() };
};
const kinds = (fx: Effect[]) => fx.map(f => f.kind);
const texts = (fx: Effect[]) => fx.flatMap(f => (f.kind === "text" ? [f.text] : []));
const errors = (fx: Effect[]) => fx.flatMap(f => (f.kind === "error" ? [f.message] : []));
const labels = (v: { choices: { label: string }[] } | null) => v?.choices.map(c => c.label);

// start: chapter, chapter_start handlers (chapter first, then global)
{
  const { e, start } = fresh();
  assert.equal(e.state.chapter, "c1");
  assert.deepEqual(start.filter(f => f.kind === "chapterStarted"), [{ kind: "chapterStarted", chapter: "c1" }]);
  assert.deepEqual(texts(start), ["Chapter one begins.", "Global start."]);
  assert.deepEqual(e.state.chapterVars, { flag: false });
  assert.deepEqual(e.state.globals, { other: { seen: false } });
}

// entry resolution: overlay by priority, @once, guards, global fallback tiers
{
  const { e } = fresh();
  assert.deepEqual(e.resolveEntry("bob"), { file: "c1", passage: "Hi" }); // priority 1 beats 0
  const t1 = e.talk("bob");
  assert.equal(t1.view?.text, "First hello.");
  assert.deepEqual(e.resolveEntry("bob"), { file: "c1", passage: "Hi3" }); // @once is spent, Hi2 guard false
  e.endDialogue();
  const t2 = e.talk("bob");
  assert.equal(t2.view?.passage, "Hi3");
  assert.deepEqual(labels(t2.view), ["Jump", "Bye"]); // @if flag hides "Flagged"
  assert.equal(e.talk("nobody").view, null);
  assert.equal(e.talk("globby").view?.text, "Only global.");
  assert.equal(e.talk("pil").view, null); // chapter 2's NPC, not now
}

// choices run passages in order, @set scopes, @end, canSave
{
  const { e } = fresh();
  assert.equal(e.canSave(), true);
  e.talk("bob");
  assert.equal(e.canSave(), false); // dialogue running
  const r = e.choose(0);
  assert.equal(r.view?.text, "Second text.");
  assert.equal(r.view?.ended, true);
  assert.ok(kinds(r.effects).includes("end"));
  assert.equal(e.state.chapterVars.flag, true);
  assert.equal(e.state.campaign.score, 2);
  assert.equal(e.canSave(), true);
  e.setShopOpen(true); assert.equal(e.canSave(), false); e.setShopOpen(false);
  e.setCutscene(true); assert.equal(e.canSave(), false); e.setCutscene(false);
  assert.equal(e.choose(0).view, null); // no dialogue any more
  // with the flag on, Hi2 (guard true) takes over: Hi is spent, Hi2 comes before Hi3 in file order
  assert.equal(e.resolveEntry("bob")?.passage, "Hi2");
  assert.equal(e.talk("bob").view?.text, "Flag hello.");
}

// @endchapter: the rest of the passage runs, the close waits for the dialogue to end, @next rules pick
{
  const { e } = fresh();
  e.talk("bob");
  e.endDialogue();
  e.talk("bob");
  const r = e.choose(1); // Bye
  assert.equal(r.view?.text, "Bye text.");
  assert.equal(e.state.campaign.score, 10); // @set after @endchapter applied
  assert.deepEqual(r.effects.filter(f => f.kind === "chapterEnded"), [{ kind: "chapterEnded", chapter: "c1", next: "c2" }]);
  assert.equal(e.state.chapter, "c2");
  assert.deepEqual(texts(r.effects), ["Chapter two.", "Global start."]);
  assert.deepEqual(e.state.chapterVars, { x: 1 });
  assert.equal(e.talk("pil").view?.text, "Pilgrim.");
  assert.equal(e.talk("bob").view?.text, "Global hello."); // the chapter's overlays are gone
}

// a close waits for a dialogue that continues
{
  const { e } = fresh();
  e.talk("gate");
  const r = e.choose(0); // Stay: @endchapter, then text, a choice remains
  assert.equal(r.view?.text, "Staying.");
  assert.equal(r.view?.ended, false);
  assert.equal(e.state.chapter, "c1");
  assert.equal(e.state.campaign.score, 1);
  assert.equal(e.status().closePending, true);
  // no @next rule is true (fate is "none"): the close is refused and the chapter stays
  const r2 = e.choose(0);
  assert.equal(r2.view?.ended, true);
  assert.ok(kinds(r2.effects).includes("chapterBlocked"));
  assert.equal(e.state.chapter, "c1");
  assert.equal(e.status().closePending, false);
}

// @next end
{
  const { e } = fresh();
  assert.ok(e.debugSetVar("campaign", "fate", "stop"));
  e.talk("gate");
  const r = e.choose(0);
  e.endDialogue();
  assert.equal(r.view?.ended, false);
  assert.equal(e.state.chapter, null);
  assert.equal(e.state.ended, true);
  assert.ok(kinds(e.dispatch("anything")).length === 0);
}

// events: [on] handlers with and without args, once, banter + reply
{
  const { e } = fresh();
  assert.deepEqual(e.dispatch("boom"), []); // "boom" handler has no text; both handlers: Handler(any arg) runs, Em needs "now"
  assert.equal(e.state.campaign.score, 100);
  e.dispatch("boom", "now");
  assert.equal(e.state.campaign.score, 100 + 100 + 1000);
  party.add("rook");
  const b = e.dispatch("enemy_dead", "x");
  assert.deepEqual(b, [{ kind: "banter", file: "other", passage: "B", speaker: "mira", text: "Mira says.", reply: { speaker: "rook", delayMs: 1000, text: "Rook answers." } }]);
  assert.deepEqual(e.dispatch("enemy_dead", "x"), []); // @once
}
{
  const { e } = fresh();
  const b = e.dispatch("enemy_dead");
  assert.equal(b[0].kind === "banter" && b[0].reply, undefined); // the reply's guard (party) is false
}

// @goto, loops, errors surface as effects instead of throwing
{
  const { e } = fresh();
  // Chain -> Tail: the goto replaces the choices
  const r = (e as unknown as { step(n: string, f: string, p: string, fx: Effect[]): { view: { text: string; choices: unknown[] } } }).step("x", "c1", "Chain", []);
  assert.equal(r.view.text, "Tail text.");
  assert.equal(r.view.choices.length, 1);
  const loop = e.talk("looper");
  assert.ok(errors(loop.effects).some(m => /too deep/.test(m)));
  const bad = e.talk("bad");
  const msgs = errors(bad.effects);
  assert.ok(msgs.some(m => /campaign.nope is not in the @returns/.test(m)));
  assert.ok(msgs.some(m => /needs numbers/.test(m)));
  assert.ok(msgs.some(m => /Unknown command @frob/.test(m)));
  assert.ok(msgs.some(m => /Broken link "Gone"/.test(m)));
  assert.equal(bad.view?.text, "Bad text.");
}

// quests: start, readiness follows the inventory, turn-in
{
  const { e } = fresh();
  assert.deepEqual(labels(e.talk("qgiver").view), ["Take", "Bye"]);
  const t = e.choose(0);
  assert.equal(e.state.quests.q, "active");
  assert.equal(errors(t.effects).filter(m => /nothing changed/.test(m)).length, 1); // the second @quest start
  inv.ore = 2;
  e.talk("qgiver");
  assert.equal(e.state.quests.q, "ready");
  assert.deepEqual(labels(e.talk("qgiver").view), ["Done", "Bye"]);
  e.choose(0);
  assert.equal(e.state.quests.q, "done");
  inv.ore = 0;
  e.refreshQuests();
  assert.equal(e.state.quests.q, "done"); // done stays done
}
{
  const { e } = fresh();
  e.talk("qgiver"); e.choose(0);
  inv.ore = 2;
  assert.ok(e.refreshQuests().some(f => f.kind === "questChanged" && f.state === "ready"));
  inv.ore = 0;
  assert.ok(e.refreshQuests().some(f => f.kind === "questChanged" && f.state === "active")); // back to active
}

// jumpToChapter, debugSetVar, snapshot / load
{
  const { e } = fresh();
  assert.ok(e.debugSetVar("chapter", "flag", true));
  assert.ok(!e.debugSetVar("chapter", "nope", true));
  const snap = e.snapshot();
  assert.equal(snap.chapterVars.flag, true);
  const fx = e.jumpToChapter("c2");
  assert.equal(e.state.chapter, "c2");
  assert.deepEqual(texts(fx), ["Chapter two.", "Global start."]);
  assert.equal(e.jumpToChapter("nope")[0].kind, "error");
  e.load(snap);
  assert.equal(e.state.chapter, "c1");
  assert.equal(e.state.chapterVars.flag, true);
  assert.equal(e.talk("bob").view?.passage, "Hi"); // the loaded state decides: "Hi" (priority 1) is not spent in it
}

// debugSetQuest: known quests only, any state, "none" removes it
{
  const { e } = fresh();
  assert.ok(e.debugSetQuest("q", "done"));
  assert.equal(e.state.quests.q, "done");
  assert.ok(e.debugSetQuest("q", "none"));
  assert.equal(e.state.quests.q, undefined);
  assert.ok(!e.debugSetQuest("nope", "active"));
  assert.equal(e.status().chapter, "c1");
  assert.equal(e.status().dialogue, null);
  e.talk("bob");
  assert.equal(e.status().dialogue?.npc, "bob");
}

console.log("storyEngine ok");
