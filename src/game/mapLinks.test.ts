// Run: npx tsx src/game/mapLinks.test.ts
import assert from "node:assert/strict";
import { arrivalFacing, linkAt, linkProblems, loadingImageFor, mapLinks, readLinkTarget, resolveArrival, type LinkMap } from "./mapLinks";
import type { CellType } from "./types";

const grid = (rows: string[]): CellType[][] => rows.map((r) => r.split("").map((c): CellType => (c === "W" ? "wall" : "floor")));
const mk = (id: string, rows: string[], extra: Partial<LinkMap> = {}): LinkMap => ({
  id,
  name: id.toUpperCase(),
  width: rows[0].length,
  height: rows.length,
  cells: grid(rows),
  start: { cell: { x: 1, y: 1 }, facing: "E" },
  ...extra,
});

// ---- readLinkTarget
assert.equal(readLinkTarget(undefined), undefined);
assert.equal(readLinkTarget({}), undefined);
assert.equal(readLinkTarget({ map: "  " }), undefined);
assert.deepEqual(readLinkTarget({ map: "forest" }), { map: "forest" });
assert.deepEqual(readLinkTarget({ map: " forest ", arrival: " South gate ", facing: "N", loadingImage: "img" }), {
  map: "forest",
  arrival: "South gate",
  facing: "N",
  loadingImage: "img",
});
assert.deepEqual(readLinkTarget({ map: "a", arrival: { x: 2, y: 3 } }), { map: "a", arrival: { x: 2, y: 3 } });
assert.deepEqual(readLinkTarget({ map: "a", arrival: { x: 2.5, y: 3 }, facing: "up" }), { map: "a" });

// ---- links of a map
const town = mk("town", ["WWWWW", "W...W", "W...W", "WWWWW"], {
  exits: [
    { cell: { x: 2, y: 1 }, name: "North gate", to: { map: "forest" } },
    { cell: { x: 3, y: 2 }, name: "Run end" },
    { cell: { x: 1, y: 2 }, to: { map: "cellar", arrival: "Hatch" } },
  ],
});
assert.deepEqual(mapLinks(town).map((l) => l.cell), [{ x: 2, y: 1 }, { x: 1, y: 2 }]);
assert.equal(linkAt(town, { x: 2, y: 1 })?.to.map, "forest");
assert.equal(linkAt(town, { x: 3, y: 2 }), undefined, "an exit without a target is no link");
assert.equal(linkAt(town, { x: 0, y: 0 }), undefined);

// ---- arrival
const forest = mk("forest", ["WWWWWW", "W....W", "W....W", "WWWWWW"], {
  start: { cell: { x: 4, y: 2 }, facing: "W" },
  exits: [
    { cell: { x: 1, y: 1 }, name: "Town road", to: { map: "town" } },
    { cell: { x: 2, y: 2 }, name: "Other road", to: { map: "elsewhere" } },
  ],
});
const gate = linkAt(town, { x: 2, y: 1 })!;
// 2. the gate that leads back
let arr = resolveArrival(town, gate, forest);
assert.deepEqual([arr.via, arr.cell], ["back", { x: 1, y: 1 }]);
// the facing: toward open ground, the start's facing first (E is open from 1,1)
assert.equal(arr.facing, "E");
// 3. no way back: the start, facing as it does
const lonely = mk("lonely", ["WWWW", "W..W", "WWWW"]);
arr = resolveArrival(town, gate, lonely);
assert.deepEqual([arr.via, arr.cell, arr.facing], ["start", { x: 1, y: 1 }, "E"]);
// 1. a named arrival (case-insensitive), a cell, then facing from the link
arr = resolveArrival(town, { kind: "gate", to: { map: "forest", arrival: "other ROAD", facing: "N" } }, forest);
assert.deepEqual([arr.via, arr.cell, arr.facing], ["named", { x: 2, y: 2 }, "N"]);
arr = resolveArrival(town, { kind: "gate", to: { map: "forest", arrival: { x: 3, y: 1 } } }, forest);
assert.deepEqual([arr.via, arr.cell], ["cell", { x: 3, y: 1 }]);
// an arrival that isn't there falls back to the gate leading back
arr = resolveArrival(town, { kind: "gate", to: { map: "forest", arrival: "nowhere" } }, forest);
assert.equal(arr.via, "back");
arr = resolveArrival(town, { kind: "gate", to: { map: "forest", arrival: { x: 0, y: 0 } } }, forest);
assert.equal(arr.via, "back", "a wall cell is no arrival");
arr = resolveArrival(town, { kind: "gate", to: { map: "forest", arrival: { x: 99, y: 0 } } }, forest);
assert.equal(arr.via, "back", "a cell off the map is no arrival");
// two ways back: the first one
const twoWays = mk("two", ["WWWWW", "W...W", "WWWWW"], {
  exits: [{ cell: { x: 3, y: 1 }, to: { map: "town" } }, { cell: { x: 1, y: 1 }, to: { map: "town" } }],
});
assert.deepEqual(resolveArrival(town, gate, twoWays).cell, { x: 3, y: 1 });

// ---- facing
assert.equal(arrivalFacing(forest, { x: 4, y: 1 }), "W", "the start's facing when open");
assert.equal(arrivalFacing(forest, { x: 4, y: 1 }, "S"), "S", "as asked");
// a corner with no open way W: the first open one
assert.equal(arrivalFacing(forest, { x: 1, y: 1 }), "E");
assert.equal(arrivalFacing(mk("a", ["WWW", "W.W", "WWW"]), { x: 1, y: 1 }), "E", "boxed in: the start's facing");

// ---- loading image: link > target map > none
assert.equal(loadingImageFor({ to: { map: "a", loadingImage: "link" } }, { loadingImage: "map" }), "link");
assert.equal(loadingImageFor({ to: { map: "a" } }, { loadingImage: "map" }), "map");
assert.equal(loadingImageFor({ to: { map: "a" } }, {}), undefined);
assert.equal(loadingImageFor(undefined, { loadingImage: "map" }), "map");
assert.equal(loadingImageFor({ to: { map: "a", loadingImage: "" } }, { loadingImage: "map" }), "map");
assert.equal(loadingImageFor(undefined, undefined), undefined);

// ---- problems
const world: Record<string, LinkMap> = { town, forest, lonely };
const look = (id: string) => world[id];
assert.deepEqual(linkProblems(forest, look).map((p) => [p.code, p.severity]), [["linkUnknownMap", "error"]], "town is there, elsewhere isn't");
const problems = linkProblems(town, look);
assert.deepEqual(problems.map((p) => [p.code, p.severity, p.cell]), [
  ["linkUnknownMap", "error", { x: 1, y: 2 }],
]);
assert.equal(problems[0].params.map, "cellar");
const noBack = mk("a", ["WWWW", "W..W", "WWWW"], { exits: [{ cell: { x: 1, y: 1 }, to: { map: "lonely" } }] });
assert.deepEqual(linkProblems(noBack, look).map((p) => [p.code, p.severity]), [["linkNoWayBack", "warning"]]);
// a gate onto its own map is an error
const selfish = mk("s", ["WWWW", "W..W", "WWWW"], { exits: [{ cell: { x: 1, y: 1 }, to: { map: "s" } }] });
assert.deepEqual(linkProblems(selfish, (id) => (id === "s" ? selfish : undefined)).map((p) => [p.code, p.severity]), [["linkSelf", "error"]]);
// an explicit arrival needs no way back, but must exist
const named = mk("b", ["WWWW", "W..W", "WWWW"], {
  exits: [
    { cell: { x: 1, y: 1 }, to: { map: "forest", arrival: "Town road" } },
    { cell: { x: 2, y: 1 }, to: { map: "forest", arrival: "Bogus" } },
    { cell: { x: 2, y: 1 }, to: { map: "forest", arrival: { x: 0, y: 0 } } },
  ],
});
assert.deepEqual(linkProblems(named, look).map((p) => p.code), ["linkUnknownArrival", "linkUnknownArrival"]);

console.log("mapLinks ok");
