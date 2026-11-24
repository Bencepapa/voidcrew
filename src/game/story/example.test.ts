// Run: npx tsx src/game/story/example.test.ts
// The real files of concept/story-example/ run through the engine: scenarios 1-21 of scenarios.md.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { checkSources } from "./storyCheck";
import { StoryEngine, type DialogueView, type Effect } from "./storyEngine";
import { buildBundle } from "./storyParse";
import { deserializeState, serializeState } from "./state";

const dir = "concept/story-example";
const sources = readdirSync(dir).filter(n => n.endsWith(".twee")).sort().map(n => ({ id: n.replace(/\.twee$/, ""), twee: readFileSync(`${dir}/${n}`, "utf8") }));
const { bundle, problems } = buildBundle(sources);
assert.deepEqual(problems, []);

/** the fake game: an inventory, credits, a party; it applies the effects the engine returns */
class Game {
  inv: Record<string, number> = {};
  credits = 0;
  party = new Set<string>();
  log: Effect[] = [];
  e: StoryEngine;
  constructor() {
    this.e = new StoryEngine(bundle, { has: i => this.inv[i] ?? 0, party: id => this.party.has(id) });
    this.apply(this.e.startCampaign());
  }
  apply(fx: Effect[]): Effect[] {
    for (const f of fx) {
      if (f.kind === "give") this.inv[f.item] = (this.inv[f.item] ?? 0) + f.n;
      else if (f.kind === "take") this.inv[f.item] = Math.max(0, (this.inv[f.item] ?? 0) - f.n);
      else if (f.kind === "reward" && f.what === "credits") this.credits += f.n;
      this.log.push(f);
    }
    return fx;
  }
  talk(npc: string): { view: DialogueView | null; effects: Effect[] } {
    const r = this.e.talk(npc);
    this.apply(r.effects);
    return r;
  }
  pick(label: string) {
    const v = this.e.currentView();
    const i = v?.choices.findIndex(c => c.label === label) ?? -1;
    assert.ok(i >= 0, `no choice "${label}" in ${JSON.stringify(v?.choices)}`);
    const r = this.e.choose(i);
    this.apply(r.effects);
    return r;
  }
  event(name: string, arg?: string) { return this.apply(this.e.dispatch(name, arg)); }
  jump(chapter: string) { return this.apply(this.e.jumpToChapter(chapter)); }
  get s() { return this.e.state; }
  /** a start in chapter 2 (as if the tyrant was dealt with) */
  static inChapter2(): Game { const g = new Game(); g.jump("chapter-2-labirintus"); return g; }
}
const kinds = (fx: Effect[], k: Effect["kind"]) => fx.filter(f => f.kind === k);
const texts = (fx: Effect[]) => fx.flatMap(f => (f.kind === "text" ? [f.text] : []));
const labels = (v: DialogueView | null) => v?.choices.map(c => c.label) ?? [];
const quest = (g: Game, id: string) => g.s.quests[id] ?? "none";

// 1: campaign start
{
  const g = new Game();
  assert.equal(g.s.chapter, "chapter-1-zsarnok");
  const intro = g.log.filter(f => f.kind === "text" && f.passage === "Intro");
  assert.equal(intro.length, 1); // shown once
  assert.match(texts(g.log)[0], /Gróf Varga lezáratta/);
  assert.deepEqual(g.s.campaign, { tyrant_fate: "none", heroism: 0, labyrinth_route: "none" });
}

// 2: the chapter's overlay beats the global entry
{
  const g = new Game();
  const v = g.talk("smith").view!;
  assert.equal(v.file, "chapter-1-zsarnok");
  assert.equal(v.passage, "Smith Chapter1");
  assert.notEqual(v.passage, "Start Smith");
  assert.deepEqual(labels(v), ["Kérek egy jó kardot", "Csak vásárolnék", "Mást kérdeznék"]);
}

// 3: the sword quest starts
{
  const g = new Game();
  g.talk("smith");
  g.pick("Kérek egy jó kardot");
  assert.equal(quest(g, "sword"), "active");
  assert.deepEqual(labels(g.e.currentView()), ["Rendben"]);
  g.pick("Rendben");
  assert.deepEqual(labels(g.e.currentView()), ["Hogy állok az érccel?", "Csak vásárolnék", "Mást kérdeznék"]);
}

// 4: ore found -> ready -> turn-in
{
  const g = new Game();
  g.talk("smith"); g.pick("Kérek egy jó kardot"); g.e.endDialogue();
  g.inv.frost_ore = 3;
  const v = g.talk("smith").view!;
  assert.equal(quest(g, "sword"), "ready");
  assert.ok(labels(v).includes("Meghoztam az ércet"));
  g.pick("Meghoztam az ércet");
  assert.equal(g.inv.runic_sword, 1);
  assert.equal(g.inv.frost_ore, 0);
  assert.equal(g.credits, 20);
  assert.equal(quest(g, "sword"), "done");
  assert.ok(labels(g.e.currentView()).length === 1); // "Köszönöm" back to the smith
  g.pick("Köszönöm");
  assert.ok(labels(g.e.currentView()).includes("Köszönöm a kardot"));
}

// 5: the tyrant dies in the game
{
  const g = new Game();
  const fx = g.event("enemy_dead", "tyrant");
  assert.equal(g.s.campaign.tyrant_fate, "killed");
  assert.equal(g.s.campaign.heroism, 2);
  assert.deepEqual(kinds(fx, "chapterEnded"), [{ kind: "chapterEnded", chapter: "chapter-1-zsarnok", next: "chapter-2-labirintus" }]);
  assert.equal(g.s.chapter, "chapter-2-labirintus");
  assert.match(texts(fx).find(t => /kapuk nyitva/.test(t))!, /Varga már nem fenyeget/);
}

// 6: judgement -> spare
{
  const g = new Game();
  const v = g.talk("tyrant").view!;
  assert.deepEqual(labels(v), ["Megkíméled", "Végzel vele"]);
  const r = g.pick("Megkíméled");
  assert.deepEqual(kinds(r.effects, "emit"), [{ kind: "emit", event: "tyrant_spared", arg: undefined }]);
  assert.equal(g.s.campaign.tyrant_fate, "spared");
  assert.equal(g.s.campaign.heroism, 1);
  assert.equal(g.s.chapter, "chapter-2-labirintus");
  assert.equal(r.view?.text, "Varga összeroskad, és intésére kinyílnak a kapuk.");
  assert.match(texts(r.effects)[0], /mogorván/); // chapter 2's intro for a spared tyrant
}

// 7: the sword quest expires, chapter variables go
{
  const g = new Game();
  g.talk("smith"); g.pick("Kérek egy jó kardot"); g.e.endDialogue();
  g.talk("lana"); g.pick("Mit tudsz Vargáról?"); g.e.endDialogue();
  assert.equal(g.s.chapterVars.heard_rumor, true);
  g.event("enemy_dead", "tyrant");
  assert.equal(quest(g, "sword"), "expired");
  assert.equal("heard_rumor" in g.s.chapterVars, false);
  assert.deepEqual(g.s.chapterVars, { pilgrim_helped: false });
}

// 8: ... and the global smith reacts
{
  const g = new Game();
  g.talk("smith"); g.pick("Kérek egy jó kardot"); g.e.endDialogue();
  g.event("enemy_dead", "tyrant");
  const v = g.talk("smith").view!;
  assert.equal(v.file, "npc-kovacs");
  assert.equal(v.passage, "Start Smith");
  assert.match(v.text, /az érc elfogyott/);
  assert.match(v.text, /Hallottam, mit tettél Vargával/);
  assert.deepEqual(labels(v), ["Vásárolnék", "Mást kérdeznék", "Viszlát"]);
  // the global file's own variable: "met" was set by this first talk
  assert.equal(g.s.globals["npc-kovacs"].met, true);
  g.e.endDialogue();
  assert.match(g.talk("smith").view!.text, /Megint te/);
}

// 9 + 10: the ring quest is carried over and turned in at the global Lana
{
  const g = new Game();
  g.party.add("mira");
  g.talk("lana"); g.pick("Valami baj van?"); g.e.endDialogue();
  assert.equal(quest(g, "ring"), "active");
  g.event("enemy_dead", "tyrant");
  assert.equal(quest(g, "ring"), "active"); // global now
  assert.deepEqual(g.s.carried, { ring: "chapter-1-zsarnok" });
  assert.equal(g.s.chapter, "chapter-2-labirintus");
  assert.deepEqual(labels(g.talk("lana").view), ["Még keresem a gyűrűdet", "Mást kérdeznék", "Viszlát"]);
  g.e.endDialogue();
  g.inv.lana_ring = 1;
  const found = g.event("item_picked", "lana_ring");
  assert.ok(found.some(f => f.kind === "banter" && /Add vissza Lanának/.test(f.text)));
  const credits = g.credits;
  const v = g.talk("lana").view!;
  assert.equal(v.passage, "Start Lana");
  assert.equal(quest(g, "ring"), "ready");
  assert.ok(labels(v).includes("Megtaláltam a gyűrűdet"));
  g.pick("Megtaláltam a gyűrűdet");
  assert.equal(quest(g, "ring"), "done");
  assert.equal(g.credits, credits + 40);
  assert.equal(g.inv.lana_ring, 0);
}

// 11: a chapter variable is gone in chapter 2, and the checker says so
{
  const g = new Game();
  g.talk("lana"); g.pick("Mit tudsz Vargáról?"); g.e.endDialogue();
  g.event("enemy_dead", "tyrant");
  assert.equal(g.s.chapterVars.heard_rumor, undefined);
  const mutated = sources.map(s => (s.id === "chapter-2-labirintus" ? { ...s, twee: s.twee.replace("@if pilgrim_helped", "@if heard_rumor") } : s));
  assert.ok(checkSources(mutated).problems.some(p => p.severity === "error" && /Unknown variable "heard_rumor"/.test(p.message) && p.file === "chapter-2-labirintus"));
}

// 12: the pilgrim
{
  const g = Game.inChapter2();
  g.talk("pilgrim");
  g.pick("Kivezetem");
  assert.equal(g.s.chapterVars.pilgrim_helped, true);
  assert.equal(g.s.campaign.labyrinth_route, "secret");
  assert.equal(g.s.campaign.heroism, 1);
}

// 13: leaving the level without helping; the handler has no @endchapter
{
  const g = Game.inChapter2();
  g.event("level_exit", "labirintus");
  assert.equal(g.s.campaign.labyrinth_route, "front");
  assert.equal(g.s.chapter, "chapter-2-labirintus");
  const h = Game.inChapter2();
  h.talk("pilgrim"); h.pick("Kivezetem");
  h.event("level_exit", "labirintus");
  assert.equal(h.s.campaign.labyrinth_route, "secret");
  const none = Game.inChapter2();
  assert.deepEqual(none.event("level_exit", "other"), []); // another level: no handler
  assert.equal(none.s.campaign.labyrinth_route, "none");
}

// 13b: @endchapter without a target: the campaign says `@next end`
{
  const g = Game.inChapter2();
  g.talk("captain");
  const r = g.pick("Az alvilág felé veszed az utad");
  assert.equal(r.view?.text, "\"Akkor ég veled. Ha visszajössz, megvárlak.\"");
  assert.equal(kinds(r.effects, "storyEnded").length, 1);
  assert.equal(g.s.ended, true);
  assert.equal(g.s.chapter, null);
}

// 13c + 14: a target: chapter 3 starts, the heroism of the same passage still counts, chapter 2's NPCs are gone
{
  const g = Game.inChapter2();
  g.talk("captain");
  const r = g.pick("Hajóra szállsz");
  assert.equal(g.s.campaign.heroism, 1);
  assert.deepEqual(kinds(r.effects, "chapterEnded"), [{ kind: "chapterEnded", chapter: "chapter-2-labirintus", next: "chapter-3-hajo" }]);
  assert.equal(g.s.chapter, "chapter-3-hajo");
  assert.ok(texts(r.effects).some(t => /fedélzet imbolyog/.test(t)));
  assert.equal(g.talk("pilgrim").view, null); // silent
  assert.equal(g.talk("captain").view, null);
  assert.equal(g.s.ended, false);
}

// 15: banter, once, with a delayed reply
{
  const g = new Game();
  g.party.add("mira"); g.party.add("rook");
  const fx = g.event("enemy_dead", "tyrant");
  const banter = fx.filter(f => f.kind === "banter");
  assert.equal(banter.length, 1);
  const b = banter[0];
  assert.ok(b.kind === "banter");
  assert.equal(b.speaker, "mira");
  assert.match(b.text, /Végre/);
  assert.deepEqual(b.reply && [b.reply.speaker, b.reply.delayMs], ["rook", 2000]);
  assert.match(b.reply!.text, /Még nem ünnepelnék/);
  assert.equal(kinds(g.event("enemy_dead", "tyrant"), "banter").length, 0); // @once
  // without rook in the party the reply is left out
  const solo = new Game();
  solo.party.add("mira");
  const sb = solo.event("enemy_dead", "tyrant").find(f => f.kind === "banter");
  assert.ok(sb && sb.kind === "banter" && sb.reply === undefined);
  // another arg of the same event is another event
  assert.equal(kinds(new Game().event("enemy_dead", "rat"), "banter").length, 0);
}

// 16 + 17: the checker
{
  const mutate = (file: string, from: string | RegExp, to: string) => sources.map(s => (s.id === file ? { ...s, twee: s.twee.replace(from, to) } : s));
  const p16 = checkSources(mutate("chapter-1-zsarnok", "@set heard_rumor = true", "@set campaign.foo = 1")).problems;
  assert.ok(p16.some(p => p.severity === "error" && /not in the @returns/.test(p.message)));
  const p17 = checkSources(mutate("chapter-1-zsarnok", /\[\[Csak vásárolnék->Smith Shop\]\]\n\[\[Mást kérdeznék->npc-kovacs\/Talk\]\]\n/, "")).problems;
  assert.ok(p17.some(p => p.severity === "warning" && p.passage === "Smith Chapter1" && /No fallback/.test(p.message)));
  assert.deepEqual(checkSources(sources).problems.filter(p => p.severity === "error"), []);
}

// 18: save in chapter 1 and reload
{
  const g = new Game();
  g.talk("smith"); g.pick("Kérek egy jó kardot"); g.e.endDialogue();
  g.talk("lana"); g.pick("Mit tudsz Vargáról?"); g.e.endDialogue();
  g.event("something_else");
  assert.equal(g.e.canSave(), true);
  const saved = serializeState(g.e.snapshot());
  const back = deserializeState(saved)!;
  const g2 = new Game();
  g2.e.load(back);
  assert.equal(g2.s.chapter, "chapter-1-zsarnok");
  assert.deepEqual(g2.s.chapterVars, { heard_rumor: true });
  assert.equal(quest(g2, "sword"), "active");
  assert.deepEqual(g2.s.campaign, g.s.campaign);
  assert.deepEqual(g2.s, g.s); // everything, including visited/once/globals
  // ... and it plays on: the sword quest reads the (new game's) inventory
  g2.inv.frost_ore = 3;
  assert.ok(labels(g2.talk("smith").view).includes("Meghoztam az ércet"));
}

// 19: a kill during a dialogue: the dialogue finishes first
{
  const g = new Game();
  g.talk("smith");
  const during = g.event("enemy_dead", "tyrant");
  assert.equal(kinds(during, "chapterEnded").length, 0);
  assert.equal(g.s.chapter, "chapter-1-zsarnok");
  assert.equal(g.s.campaign.tyrant_fate, "killed"); // the handler's other commands did run
  assert.equal(g.e.status().closePending, true);
  const r = g.pick("Csak vásárolnék"); // Smith Shop: a shop, no more choices: the dialogue is over
  assert.ok(kinds(r.effects, "shop").length === 1);
  assert.equal(r.view?.ended, true);
  assert.deepEqual(kinds(r.effects, "chapterEnded"), [{ kind: "chapterEnded", chapter: "chapter-1-zsarnok", next: "chapter-2-labirintus" }]);
  assert.equal(g.s.chapter, "chapter-2-labirintus");
  // and by closing the dialogue box instead
  const h = new Game();
  h.talk("smith");
  h.event("enemy_dead", "tyrant");
  assert.equal(h.s.chapter, "chapter-1-zsarnok");
  assert.equal(kinds(h.apply(h.e.endDialogue()), "chapterEnded").length, 1);
  assert.equal(h.s.chapter, "chapter-2-labirintus");
}

// 20: no saving while something runs
{
  const g = new Game();
  assert.equal(g.e.canSave(), true);
  g.talk("smith");
  assert.equal(g.e.canSave(), false);
  g.e.endDialogue();
  assert.equal(g.e.canSave(), true);
  g.e.setShopOpen(true);
  assert.equal(g.e.canSave(), false);
  g.e.setShopOpen(false);
  g.e.setCutscene(true);
  assert.equal(g.e.canSave(), false);
  g.e.setCutscene(false);
  assert.equal(g.e.canSave(), true);
}

// 21: @endchapter first, then the rest of the passage, then the close
{
  const camp = ":: FileData\n@kind campaign\n@var heroism = 0\n@start a\n:: A [chapter]\n@chapter a\n@next b\n:: B [chapter]\n@chapter b\n@next end\n";
  const a = ":: FileData\n@kind chapter\n@returns heroism\n:: P [start]\n@npc n\n@endchapter\n@set campaign.heroism += 1\nDone.\n";
  const b = ":: FileData\n@kind chapter\n:: Intro [on]\n@on chapter_start\nB:\n@if campaign.heroism == 1\nSeen.\n@endif\n";
  const bb = buildBundle([{ id: "campaign", twee: camp }, { id: "a", twee: a }, { id: "b", twee: b }]).bundle;
  const e = new StoryEngine(bb, { has: () => 0, party: () => false });
  e.startCampaign();
  const r = e.talk("n");
  assert.equal(e.state.campaign.heroism, 1);
  assert.equal(e.state.chapter, "b");
  assert.deepEqual(r.effects.flatMap(f => (f.kind === "text" ? [f.text] : [])), ["B:\nSeen."]); // the chapter-2 handler already sees heroism 1
}

console.log("example ok");
