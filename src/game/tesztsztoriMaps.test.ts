// Run: npx tsx src/game/tesztsztoriMaps.test.ts
// tesztsztori: remove together (see src/story/TESZTSZTORI-REMOVE.md).
// The test story's two maps (src/maps/fantasy/tesztsztori*.json) through the game's own parser, link checker and
// actor/item/dialogue tables, and against the story files they play: every story NPC, item and event has a place on the maps.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import type { MapFile } from "./mapFormat";

// (the game's modules read Vite's import.meta.env / import.meta.glob, which plain node lacks: stand-ins are put in their place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");
const { linkProblems } = await import("./mapLinks");
const { ACTOR_TYPES, isFriendlySpec } = await import("./actors");
const { ITEM_TYPES } = await import("./items");
const { talkMode } = await import("./simpleShop");
const { parseTwee, checkDialogue } = await import("./dialogue");
const { buildStoryFromSources, storySources } = await import("./story/storyBundle");
const { assetInWorld } = await import("./worlds");

const read = (name: string) => JSON.parse(readFileSync(`src/maps/fantasy/${name}.json`, "utf8")) as MapFile;
const ids = ["tesztsztori", "tesztsztori-labirintus"];
const maps = Object.fromEntries(ids.map(id => [id, parseMap(id, read(id))]));
const lookup = (id: string) => maps[id];

// the files exist under the prefix, in the fantasy folder (so the editor lists them and the game registers them as fantasy maps)
for (const id of ids) assert.ok(readdirSync("src/maps/fantasy").includes(`${id}.json`));
for (const id of ids) assert.ok(maps[id].name.startsWith("tesztsztori"));

// the links resolve: both ways, with their named arrivals
for (const id of ids) assert.deepEqual(linkProblems(maps[id], lookup), [], `${id} links`);

// everything is on a walkable cell the party can reach from the start (flat floors: a flood fill over the grid)
for (const id of ids) {
  const m = maps[id];
  const seen = new Set<string>([`${m.start.cell.x},${m.start.cell.y}`]);
  const queue = [m.start.cell];
  while (queue.length) {
    const c = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, y = c.y + dy, key = `${x},${y}`;
      if (m.cells[y]?.[x] === undefined || m.cells[y][x] === "wall" || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  const reach = (what: string, c: { x: number; y: number }) => assert.ok(seen.has(`${c.x},${c.y}`), `${id}: ${what} at ${c.x},${c.y} is not reachable`);
  for (const a of m.actors ?? []) reach(`actor ${a.actor}`, a.cell);
  for (const it of m.items ?? []) reach(`item ${it.item}`, it.cell);
  for (const e of m.exits ?? []) reach(`gate ${e.name}`, e.cell);
  // no actor shares a cell with another actor or a gate (the start may be a gate: it is where that gate arrives)
  const cells = [...(m.actors ?? []).map(a => a.cell), ...(m.exits ?? []).map(e => e.cell)].map(c => `${c.x},${c.y}`);
  assert.equal(new Set(cells).size, cells.length, `${id}: two things share a cell`);
}

// actors: known types, all of them fantasy ones for the editor; the NPCs can be talked to (friendly + dialogue or shop)
const placed = Object.values(maps).flatMap(m => m.actors ?? []);
for (const a of placed) {
  assert.ok(ACTOR_TYPES[a.actor], `unknown actor type ${a.actor}`);
  assert.ok(a.actor.startsWith("tesztsztori"));
  assert.ok(assetInWorld(a.actor, "fantasy") && !assetInWorld(a.actor, "scifi"), `${a.actor} must be a fantasy asset`);
  if (isFriendlySpec(a)) assert.ok(talkMode(a, true), `${a.actor} at ${a.cell.x},${a.cell.y} is friendly but cannot be talked to`);
}
// (the tyrant: one friendly placement for the judgement dialogue, one hostile for the fight)
const tyrants = placed.filter(a => a.actor === "tesztsztori_zsarnok");
assert.equal(tyrants.filter(a => isFriendlySpec(a)).length, 1);
assert.equal(tyrants.filter(a => !isFriendlySpec(a)).length, 1);
assert.ok(ACTOR_TYPES.tesztsztori_zsarnok.hp > ACTOR_TYPES.ogre1.hp && !ACTOR_TYPES.tesztsztori_zsarnok.friendly);
// the story-bound NPC types need a talkable placement: the friendly ones above
const talkable = new Set(placed.filter(a => isFriendlySpec(a)).map(a => a.actor));

// items: known, with their sprites on disk (copies of existing ones: the viewport loads public/textures/item_<id>/)
for (const it of Object.values(maps).flatMap(m => m.items ?? [])) assert.ok(ITEM_TYPES[it.item]);
for (const id of Object.keys(ITEM_TYPES).filter(i => i.startsWith("tesztsztori"))) {
  assert.ok(assetInWorld(id, "fantasy") && !assetInWorld(id, "scifi"), `${id} must be a fantasy asset`);
  for (const f of ["diffuse", "normal", "depth"]) assert.ok(existsSync(`public/textures/item_${id}/${f}.png`), `${id}: no ${f}.png`);
}
const count = (item: string) => Object.values(maps).flatMap(m => m.items ?? []).filter(i => i.item === item).reduce((n, i) => n + (i.count ?? 1), 0);
assert.ok(count("tesztsztori_fagyerc") >= 3);
assert.equal(count("tesztsztori_gyuru"), 1);

// the dialogue libraries and shops the NPCs name exist, and the library has the entry
for (const a of placed) {
  if (a.dialogue) {
    const file = `src/dialogues/${a.dialogue.library}.twee`;
    assert.ok(existsSync(file), `no dialogue library ${a.dialogue.library}`);
    const { dialogue, problems } = parseTwee(readFileSync(file, "utf8"), a.dialogue.library);
    assert.ok(dialogue.entries.includes(a.dialogue.entry), `${a.dialogue.library} has no entry ${a.dialogue.entry}`);
    assert.deepEqual(problems.filter(p => p.severity === "error"), []);
    assert.deepEqual(checkDialogue(dialogue).filter(p => p.severity === "error"), []);
  }
  if (a.shop) assert.ok(existsSync(`src/shops/${a.shop}.json`), `no shop ${a.shop}`);
}
assert.ok(placed.find(a => a.actor === "tesztsztori_kovacs")?.shop, "the smith needs his own shop for the story's @shop");

// the story: every NPC it binds is a talkable placement; the events name things the maps have
const files = Object.fromEntries(readdirSync("src/story").filter(n => /^tesztsztori-.*\.twee$/.test(n)).map(n => [`./${n}`, readFileSync(`src/story/${n}`, "utf8")]));
const { bundle } = buildStoryFromSources(storySources(files));
for (const f of Object.values(bundle.files)) {
  for (const n of f.entries) {
    const npc = f.passages[n].header.npc!;
    assert.ok(talkable.has(npc), `the story binds ${npc} but no friendly, talkable placement of it is on the maps`);
  }
}
const text = Object.values(files).join("\n");
for (const m of text.matchAll(/@on level_exit ([\w-]+)/g)) {
  const map = maps[m[1]];
  assert.ok(map, `level_exit ${m[1]}: no such map`);
  assert.ok((map.exits ?? []).some(e => e.to), `${m[1]} has no gate to leave by`);
}
for (const m of text.matchAll(/@on enemy_dead ([\w-]+)/g)) {
  assert.ok(placed.some(a => a.actor === m[1] && !isFriendlySpec(a)), `enemy_dead ${m[1]}: no hostile placement`);
}
for (const m of text.matchAll(/@on item_picked ([\w-]+)/g)) assert.ok(count(m[1]) > 0, `item_picked ${m[1]}: not on the maps`);

console.log("tesztsztori maps: ok");
