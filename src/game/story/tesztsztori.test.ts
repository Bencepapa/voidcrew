// Run: npx tsx src/game/story/tesztsztori.test.ts
// tesztsztori: remove together (see src/story/TESZTSZTORI-REMOVE.md).
// The playable test story the game ships in src/story/tesztsztori-*.twee: built with the real bundle builder + checker
// (as src/story/load.ts does), then its main scenarios run through the engine with a fake host.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildStoryFromSources, storySources } from "./storyBundle";
import { StoryEngine, type DialogueView, type Effect } from "./storyEngine";
import { testStoryWanted } from "../../story/tesztsztori-switch";

const dir = "src/story";
const files = Object.fromEntries(
  readdirSync(dir).filter(n => /^tesztsztori-.*\.twee$/.test(n)).map(n => [`./${n}`, readFileSync(`${dir}/${n}`, "utf8")]),
);
assert.equal(Object.keys(files).length, 7);
const { bundle, problems } = buildStoryFromSources(storySources(files));

// the checker: no errors; the only warning is the chapter-3 skeleton (it can never end)
assert.deepEqual(problems.filter(p => p.severity === "error"), []);
const warnings = problems.filter(p => p.severity === "warning");
assert.deepEqual(warnings.map(p => `${p.file}: ${p.message}`), ["tesztsztori-chapter-3-hajo: No reachable @endchapter: this chapter can never end"]);
assert.equal(bundle.campaign, "tesztsztori-campaign");
assert.equal(bundle.files["tesztsztori-campaign"].start, "tesztsztori-chapter-1-zsarnok");

// every NPC the story binds, every item and every map/actor argument it names carries the prefix
const npcs = new Set(Object.values(bundle.files).flatMap(f => f.entries.map(n => f.passages[n].header.npc!)));
assert.deepEqual([...npcs].sort(), ["tesztsztori_kapitany", "tesztsztori_kovacs", "tesztsztori_lana", "tesztsztori_zarandok", "tesztsztori_zsarnok"]);
const sourceText = Object.values(files).join("\n");
for (const m of sourceText.matchAll(/\b(?:has\("|@give |@take |@on item_picked |@on enemy_dead |@on level_exit |@quest \w+ )([\w-]+)/g)) {
  assert.ok(m[1].startsWith("tesztsztori"), `unprefixed id "${m[1]}" in the test story`);
}

// ---- a fake game, as example.test.ts has ----
class Game {
  inv: Record<string, number> = {};
  credits = 0;
  party = new Set(["aldra", "borin"]);
  e: StoryEngine;
  log: Effect[] = [];
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
  talk(npc: string) { const r = this.e.talk(npc); this.apply(r.effects); return r; }
  pick(label: string) {
    const v = this.e.currentView();
    const i = v?.choices.findIndex(c => c.label === label) ?? -1;
    assert.ok(i >= 0, `no choice "${label}" in ${JSON.stringify(v?.choices)}`);
    const r = this.e.choose(i);
    this.apply(r.effects);
    return r;
  }
  event(name: string, arg?: string) { return this.apply(this.e.dispatch(name, arg)); }
  get s() { return this.e.state; }
}
const labels = (v: DialogueView | null) => v?.choices.map(c => c.label) ?? [];
const quest = (g: Game, id: string) => g.s.quests[id] ?? "none";
const texts = (fx: Effect[]) => fx.flatMap(f => (f.kind === "text" ? [f.text] : []));
const CH1 = "tesztsztori-chapter-1-zsarnok";
const CH2 = "tesztsztori-chapter-2-labirintus";

// start: chapter 1, its intro in the log once
{
  const g = new Game();
  assert.equal(g.s.chapter, CH1);
  assert.equal(texts(g.log).length, 1);
}

// the smith: overlay entry, ore -> sword quest, the sword is an item the host's give puts in the inventory
{
  const g = new Game();
  assert.equal(g.talk("tesztsztori_kovacs").view!.passage, "Smith Chapter1");
  g.pick("Kérek egy jó kardot");
  assert.equal(quest(g, "tesztsztori_kard"), "active");
  g.pick("Rendben"); g.e.endDialogue();
  g.inv.tesztsztori_fagyerc = 3;
  g.talk("tesztsztori_kovacs");
  assert.equal(quest(g, "tesztsztori_kard"), "ready");
  g.pick("Meghoztam az ércet");
  assert.equal(g.inv.tesztsztori_runakard, 1);
  assert.equal(g.inv.tesztsztori_fagyerc, 0);
  assert.equal(g.credits, 20);
  assert.equal(quest(g, "tesztsztori_kard"), "done");
}

// the tyrant killed (the hostile placement): chapter 1 ends, chapter 2 starts; banter by the fantasy party
{
  const g = new Game();
  const fx = g.event("enemy_dead", "tesztsztori_zsarnok");
  assert.equal(g.s.campaign.tyrant_fate, "killed");
  assert.equal(g.s.campaign.heroism, 2);
  assert.equal(g.s.chapter, CH2);
  assert.ok(fx.some(f => f.kind === "banter" && f.speaker === "aldra" && f.reply?.speaker === "borin"));
}

// the tyrant judged (the friendly, kneeling placement): spare
{
  const g = new Game();
  assert.deepEqual(labels(g.talk("tesztsztori_zsarnok").view), ["Megkíméled", "Végzel vele"]);
  g.pick("Megkíméled");
  assert.equal(g.s.campaign.tyrant_fate, "spared");
  assert.equal(g.s.chapter, CH2);
}

// the sword quest expires; the global smith reacts in chapter 2
{
  const g = new Game();
  g.talk("tesztsztori_kovacs"); g.pick("Kérek egy jó kardot"); g.e.endDialogue();
  g.event("enemy_dead", "tesztsztori_zsarnok");
  assert.equal(quest(g, "tesztsztori_kard"), "expired");
  assert.match(g.talk("tesztsztori_kovacs").view!.text, /az érc elfogyott/);
}

// the ring quest survives into chapter 2 and is turned in at Lana
{
  const g = new Game();
  g.talk("tesztsztori_lana"); g.pick("Valami baj van?"); g.e.endDialogue();
  g.event("enemy_dead", "tesztsztori_zsarnok");
  assert.equal(quest(g, "tesztsztori_gyuru"), "active");
  g.e.endDialogue();
  g.inv.tesztsztori_gyuru = 1;
  const found = g.event("item_picked", "tesztsztori_gyuru");
  assert.ok(found.some(f => f.kind === "banter" && /Add vissza Lanának/.test(f.text)));
  assert.equal(quest(g, "tesztsztori_gyuru"), "ready");
  g.talk("tesztsztori_lana"); g.pick("Megtaláltam a gyűrűdet");
  assert.equal(quest(g, "tesztsztori_gyuru"), "done");
  assert.equal(g.credits, 40);
  assert.equal(g.inv.tesztsztori_gyuru, 0);
}

// chapter 2: pilgrim, level exit, captain
{
  const g = new Game();
  g.event("enemy_dead", "tesztsztori_zsarnok");
  g.event("level_exit", "tesztsztori-labirintus");
  assert.equal(g.s.campaign.labyrinth_route, "front");
  g.talk("tesztsztori_zarandok"); g.pick("Kivezetem"); g.e.endDialogue();
  g.event("level_exit", "tesztsztori-labirintus");
  assert.equal(g.s.campaign.labyrinth_route, "secret");
  g.talk("tesztsztori_kapitany"); g.pick("Hajóra szállsz");
  assert.equal(g.s.chapter, "tesztsztori-chapter-3-hajo");
  assert.equal(g.s.campaign.heroism, 4); // tyrant 2 + pilgrim 1 + captain 1
}
{
  const g = new Game();
  g.event("enemy_dead", "tesztsztori_zsarnok");
  g.talk("tesztsztori_kapitany"); g.pick("Az alvilág felé veszed az utad");
  assert.equal(g.e.state.ended, true);
}

// the on/off switch: the test story is wanted for a tesztsztori map in the URL or an explicit flag
assert.equal(testStoryWanted("?world=fantasy&map=tesztsztori", null), true);
assert.equal(testStoryWanted("?map=tesztsztori-labirintus", null), true);
assert.equal(testStoryWanted("?map=fantasy", null), false);
assert.equal(testStoryWanted("", null), false);
assert.equal(testStoryWanted("", "on"), true);
assert.equal(testStoryWanted("?map=tesztsztori", "off"), false);
assert.equal(testStoryWanted("?story=off&map=tesztsztori", null), false);
assert.equal(testStoryWanted("?story=on", null), true);

console.log("tesztsztori story: ok");
