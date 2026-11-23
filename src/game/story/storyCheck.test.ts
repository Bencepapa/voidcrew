// Run: npx tsx src/game/story/storyCheck.test.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { checkSources, type StoryProblem } from "./storyCheck";

const dir = "concept/story-example";
const base = readdirSync(dir).filter(n => n.endsWith(".twee")).sort().map(n => ({ id: n.replace(/\.twee$/, ""), twee: readFileSync(`${dir}/${n}`, "utf8") }));

/** the example with one file changed (`from` must occur in it) */
function mutate(file: string, from: string | RegExp, to: string) {
  return base.map(s => {
    if (s.id !== file) return s;
    const twee = s.twee.replace(from, to);
    assert.notEqual(twee, s.twee, `mutation of ${file} did nothing`);
    return { ...s, twee };
  });
}
const check = (sources = base) => checkSources(sources).problems;
const find = (problems: StoryProblem[], severity: string, re: RegExp, file?: string) =>
  problems.filter(p => p.severity === severity && re.test(p.message) && (file === undefined || p.file === file));
const has = (problems: StoryProblem[], severity: string, re: RegExp, file?: string) => find(problems, severity, re, file).length > 0;

// the example is clean: no errors, and the only warning is the skeleton chapter that never ends
{
  const p = check();
  assert.deepEqual(p.filter(x => x.severity === "error"), []);
  assert.deepEqual(p.map(x => `${x.file}: ${x.message}`), ["chapter-3-hajo: No reachable @endchapter: this chapter can never end"]);
}

// 16: @set campaign.x not in @returns
{
  const p = check(mutate("chapter-1-zsarnok", "@set heard_rumor = true", "@set heard_rumor = true\n@set campaign.foo = 1"));
  assert.ok(has(p, "error", /campaign\.foo.*not in the @returns/, "chapter-1-zsarnok"));
  const q = check(mutate("chapter-1-zsarnok", "@set heard_rumor = true", "@set campaign.labyrinth_route = \"x\""));
  assert.ok(has(q, "error", /labyrinth_route.*not in the @returns/)); // a campaign variable, but chapter 1 does not return it
  const g = check(mutate("npc-lana", "@set met = true", "@set campaign.heroism = 1"));
  assert.ok(has(g, "error", /global file cannot write campaign\.heroism/));
  const o = check(mutate("npc-lana", "@set met = true", "@set npc-kovacs.met = true"));
  assert.ok(has(o, "error", /read-only/));
  const u = check(mutate("npc-lana", "@set met = true", "@set metx = true"));
  assert.ok(has(u, "error", /unknown variable "metx"/));
}

// 11: a chapter variable of chapter 1 is not readable in chapter 2
{
  const p = check(mutate("chapter-2-labirintus", "@if pilgrim_helped", "@if heard_rumor"));
  assert.ok(has(p, "error", /Unknown variable "heard_rumor"/, "chapter-2-labirintus"));
}

// unknown variable / file / quest
{
  const a = check(mutate("npc-kovacs", '@if !met', '@if !metx'));
  assert.ok(has(a, "error", /Unknown variable "metx"/, "npc-kovacs"));
  const b = check(mutate("npc-kovacs", 'campaign.tyrant_fate == "killed"', 'campaign.nothing == "killed"'));
  assert.ok(has(b, "error", /Unknown variable "campaign\.nothing"/));
  const c = check(mutate("npc-kovacs", 'campaign.tyrant_fate == "killed"', 'ghost.met'));
  assert.ok(has(c, "error", /Unknown file "ghost"/));
  const d = check(mutate("npc-kovacs", 'campaign.tyrant_fate == "killed"', 'lana.met && kovacs.met')); // aliases of npc-lana / npc-kovacs
  assert.deepEqual(find(d, "error", /./), []);
  const e = check(mutate("npc-kovacs", 'campaign.tyrant_fate == "killed"', 'lana.nope'));
  assert.ok(has(e, "error", /Unknown variable "nope" in npc-lana/));
  const f = check(mutate("npc-kovacs", 'quest("sword") == "expired"', 'quest("swrod") == "expired"'));
  assert.ok(has(f, "error", /Unknown quest "swrod"/));
  const g = check(mutate("chapter-1-zsarnok", "@quest start sword", "@quest start swrod"));
  assert.ok(has(g, "error", /Unknown quest "swrod" in @quest start/));
  const h = check(mutate("chapter-1-zsarnok", "[[Mást kérdeznék->npc-kovacs/Talk]]", "[[Mást kérdeznék->npc-kovacz/Talk]]"));
  assert.ok(has(h, "error", /Unknown file "npc-kovacz"/));
  const i = check(mutate("chapter-1-zsarnok", "[[Mást kérdeznék->npc-kovacs/Talk]]", "[[Mást kérdeznék->npc-kovacs/Talks]]"));
  assert.ok(has(i, "error", /Broken link.*Talks/));
  const j = check(mutate("chapter-1-zsarnok", "[[Csak vásárolnék->Smith Shop]]", "[[Csak vásárolnék->Smith Shopp]]"));
  assert.ok(has(j, "error", /Broken link/));
  const k = check(mutate("chapter-2-labirintus", "@endchapter chapter-3-hajo", "@endchapter chapter-9"));
  assert.ok(has(k, "error", /@endchapter target "chapter-9"/));
}

// quests: no @fate, carry with the turn-in only in a chapter file
{
  const a = check(mutate("chapter-1-zsarnok", "@fate expires", ""));
  assert.ok(has(a, "error", /Quest "sword" has no @fate/));
  const b = check(mutate("chapter-1-zsarnok", "@fate expires", "@fate forever"));
  assert.ok(has(b, "error", /@fate must be expires or carry/));
  // move the ring's turn-in out of the global file into the chapter
  const noLana = mutate("npc-lana", "@quest done ring", "@set met = true");
  const c = checkSources(noLana).problems;
  assert.ok(has(c, "error", /Carry quest "ring" has no turn-in.*global file/, "chapter-1-zsarnok"));
  const inChapter = noLana.map(s => (s.id === "chapter-1-zsarnok" ? { ...s, twee: s.twee.replace("@take frost_ore 3", "@take frost_ore 3\n@quest done ring") } : s));
  const d = check(inChapter);
  assert.ok(has(d, "error", /Carry quest "ring".*only in a chapter file/));
}

// chain and chapters
{
  const a = check(mutate("campaign", "@next chapter-2-labirintus @if", "@next chapter-9 @if"));
  assert.ok(has(a, "error", /Unknown @next chapter "chapter-9"/, "campaign"));
  const b = check(mutate("campaign", "@start chapter-1-zsarnok", "@start chapter-0"));
  assert.ok(has(b, "error", /@start "chapter-0"/));
  const c = check(mutate("campaign", /:: Chain Hajo[\s\S]*$/, ""));
  assert.ok(has(c, "warning", /not in the campaign's chain/, "chapter-3-hajo"));
  const d = check(mutate("chapter-1-zsarnok", "@returns tyrant_fate, heroism", "@returns tyrant_fate, heroism, mood"));
  assert.ok(has(d, "error", /"mood" is not a campaign variable/));
  // a chapter whose @endchapter is only in an unreachable passage
  const e = check(mutate("chapter-2-labirintus", /:: Captain Ship[\s\S]*$/, ":: Orphan\n@endchapter\n"));
  assert.ok(has(e, "warning", /No reachable @endchapter/, "chapter-2-labirintus"));
  assert.ok(has(e, "warning", /Unreachable/, "chapter-2-labirintus"));
}

// malformed expressions (in every place one can stand)
{
  const a = check(mutate("chapter-1-zsarnok", "[[Rendben->Smith Chapter1]]", "[[Rendben->Smith Chapter1]] @if quest(\"sword\" ==="));
  assert.ok(has(a, "error", /Malformed expression/, "chapter-1-zsarnok"));
  const b = check(mutate("chapter-1-zsarnok", "@if !heard_rumor", "@if !heard_rumor &&"));
  assert.ok(has(b, "error", /Malformed expression "!heard_rumor &&"/));
  const c = check(mutate("campaign", '@if campaign.tyrant_fate != "none"', "@if campaign.tyrant_fate = 1"));
  assert.ok(has(c, "error", /Malformed expression.*==/, "campaign"));
  const d = check(mutate("chapter-1-zsarnok", '@ready_when has("lana_ring") >= 1', '@ready_when has("lana_ring" >= 1'));
  assert.ok(has(d, "error", /Malformed expression/));
  const e = check(mutate("party-banter", '@when party("rook")', "@when party(rook"));
  assert.ok(has(e, "error", /Malformed expression/, "party-banter"));
  const f = check(mutate("chapter-1-zsarnok", "@set heard_rumor = true", "@set heard_rumor = (1 =="));
  assert.ok(has(f, "error", /Malformed expression/));
}

// 17: no fallback
{
  const noFallback = mutate("chapter-1-zsarnok", /\[\[Csak vásárolnék->Smith Shop\]\]\r?\n\[\[Mást kérdeznék->npc-kovacs\/Talk\]\]/, "");
  const p = check(noFallback);
  assert.ok(has(p, "warning", /No fallback: every choice is guarded/, "chapter-1-zsarnok"));
  assert.equal(find(p, "warning", /No fallback/).length, 1);
  // an NPC whose entries are all guarded
  const q = check(mutate("npc-lana", "@npc lana", "@npc lana\n@when !met"));
  assert.ok(has(q, "warning", /No fallback entry for NPC "lana"/, "npc-lana") === false); // the chapter-1 overlay is unguarded
  const r = check(mutate("chapter-2-labirintus", "@npc pilgrim", "@npc pilgrim\n@when pilgrim_helped"));
  assert.ok(has(r, "warning", /No fallback entry for NPC "pilgrim"/));
  // an @if/@else that gives a choice in both branches counts as a fallback
  const both = check(mutate("chapter-2-labirintus", "[[Hajóra szállsz->Captain Ship]]\n[[Az alvilág felé veszed az utad->Captain Underworld]]",
    "@if pilgrim_helped\n[[Hajóra szállsz->Captain Ship]]\n@else\n[[Az alvilág felé veszed az utad->Captain Underworld]]\n@endif"));
  assert.deepEqual(find(both, "warning", /No fallback/), []);
  const one = check(mutate("chapter-2-labirintus", "[[Hajóra szállsz->Captain Ship]]\n[[Az alvilág felé veszed az utad->Captain Underworld]]",
    "@if pilgrim_helped\n[[Hajóra szállsz->Captain Ship]]\n@endif\n[[Az alvilág felé veszed az utad->Captain Underworld]] @if pilgrim_helped"));
  assert.ok(has(one, "warning", /No fallback: every choice is guarded/));
  // a chapter entry for an NPC that also has global entries, without @overlay
  const s = check(mutate("chapter-1-zsarnok", "@npc smith\n@overlay", "@npc smith"));
  assert.ok(has(s, "warning", /mark this chapter entry @overlay/));
}

// parse problems are part of the report; a bundle without a campaign is an error
{
  const p = check(mutate("npc-lana", "@end", "@end\n@frob"));
  assert.ok(has(p, "warning", /Unknown command @frob/, "npc-lana"));
  const noCampaign = base.filter(s => s.id !== "campaign");
  assert.ok(has(check(noCampaign), "error", /No campaign file/));
  const dup = check([...base, base[0]]);
  assert.ok(has(dup, "error", /Duplicate file id/));
}

console.log("storyCheck ok");
