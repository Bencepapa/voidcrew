// Run: npx tsx src/game/roofAutotile.test.ts
import assert from "node:assert/strict";
import {
  outlineDistances,
  parseRoofGroup,
  planRoof,
  raisedFootprint,
  roofFieldAt,
  roofGroupId,
  roofPieceHeightAt,
  ROOF_FORMS,
  type RoofCell,
  type RoofPiece,
} from "./roofAutotile";

// ---- helpers

// ascii art -> cells: '#' a cell at floor height 0, a digit n its floor height n, '.' nothing
function cellsOf(art: string): RoofCell[] {
  const cells: RoofCell[] = [];
  art.trim().split("\n").forEach((row, y) => {
    [...row.trim()].forEach((ch, x) => {
      if (ch === "#") cells.push({ x, y, level: 0 });
      else if (/[0-9]/.test(ch)) cells.push({ x, y, level: Number(ch) });
    });
  });
  return cells;
}

// a cell's piece as one short symbol: slopes and hips point uphill, valleys
// point at the corner where their eaves meet, flats are '#'
function symbol(p: RoofPiece): string {
  const slope = { 0: "^", 90: ">", 180: "v", 270: "<" } as const;
  const hip = { 0: "/", 90: "\\", 180: "L", 270: "7" } as const; // (the high corner: NE, SE, SW, NW)
  const valley = { 0: "J", 90: "b", 180: "r", 270: "q" } as const; // (the low corner: SE, SW, NW, NE)
  if (p.prop === "roof_flat") return p.approx ? "~" : "#";
  if (p.prop === "roof_slope" || p.prop === "roof_slope_flat") return slope[p.rotation];
  if (p.prop === "roof_corner" || p.prop === "roof_corner_flat") return hip[p.rotation];
  return valley[p.rotation];
}
function draw(cells: RoofCell[], plan: RoofPiece[]): { symbols: string[]; heights: string[] } {
  const w = Math.max(...cells.map((c) => c.x)) + 1;
  const h = Math.max(...cells.map((c) => c.y)) + 1;
  const sym = Array.from({ length: h }, () => Array(w).fill("."));
  const hei = Array.from({ length: h }, () => Array(w).fill("."));
  plan.forEach((p) => {
    sym[p.y][p.x] = symbol(p);
    hei[p.y][p.x] = String(p.elevation).replace("0.5", "h");
  });
  return { symbols: sym.map((r) => r.join("")), heights: hei.map((r) => r.join("")) };
}
const pieceAt = (plan: RoofPiece[], x: number, y: number) => plan.find((p) => p.x === x && p.y === y)!;
const rect = (w: number, h: number, ox = 0, oy = 0): RoofCell[] =>
  Array.from({ length: w * h }, (_, i) => ({ x: ox + (i % w), y: oy + Math.floor(i / w), level: 0 }));

// ---- the group ids

assert.equal(roofGroupId("bent", 12), "bent-12");
assert.deepEqual(parseRoofGroup("slope-3"), { form: "slope", n: 3 });
assert.equal(parseRoofGroup("slope"), null);
assert.equal(parseRoofGroup("roof-3"), null);
assert.equal(parseRoofGroup(3), null);

// ---- the distance from the outline

{
  const d = outlineDistances(rect(5, 5));
  assert.equal(d(0, 0), 0);
  assert.equal(d(1, 1), 1);
  assert.equal(d(2, 2), 2);
  assert.equal(d(3, 3), 2);
  assert.equal(d(5, 5), 0);
  assert.equal(d(2, 0), 0);
  assert.equal(d(9, 9), 0, "off the area is the outline");
  // L shape: the corner point of the notch is on the outline
  const l = outlineDistances(cellsOf("####\n####\n##..\n##.."));
  assert.equal(l(2, 2), 0);
  assert.equal(l(2, 1), 1);
  assert.equal(l(1, 1), 1);
}

// ---- a 3x3 hip roof: the example of the roof props' notes

{
  const cells = rect(3, 3);
  const plan = planRoof(cells, "slope");
  // corners: outer pieces, turned so their eaves meet at the roof's corner (0 = SW, 90 = NW, 180 = NE, 270 = SE)
  assert.deepEqual([pieceAt(plan, 0, 2).prop, pieceAt(plan, 0, 2).rotation], ["roof_corner", 0]);
  assert.deepEqual([pieceAt(plan, 0, 0).prop, pieceAt(plan, 0, 0).rotation], ["roof_corner", 90]);
  assert.deepEqual([pieceAt(plan, 2, 0).prop, pieceAt(plan, 2, 0).rotation], ["roof_corner", 180]);
  assert.deepEqual([pieceAt(plan, 2, 2).prop, pieceAt(plan, 2, 2).rotation], ["roof_corner", 270]);
  // edges: slopes with the eave outward (0 = eave south, 90 = west, 180 = north, 270 = east)
  assert.deepEqual([pieceAt(plan, 1, 2).prop, pieceAt(plan, 1, 2).rotation], ["roof_slope", 0]);
  assert.deepEqual([pieceAt(plan, 0, 1).prop, pieceAt(plan, 0, 1).rotation], ["roof_slope", 90]);
  assert.deepEqual([pieceAt(plan, 1, 0).prop, pieceAt(plan, 1, 0).rotation], ["roof_slope", 180]);
  assert.deepEqual([pieceAt(plan, 2, 1).prop, pieceAt(plan, 2, 1).rotation], ["roof_slope", 270]);
  // the middle: flat, at the height the slopes reach
  assert.deepEqual([pieceAt(plan, 1, 1).prop, pieceAt(plan, 1, 1).elevation], ["roof_flat", 1]);
  for (const p of plan) if (p.prop !== "roof_flat") assert.equal(p.elevation, 0);
  // slope and flat: the same here
  assert.deepEqual(planRoof(cells, "flat"), plan);
  // with the bent pieces: a ring of them and the flat at half a unit
  const bent = planRoof(cells, "bent");
  assert.equal(pieceAt(bent, 0, 2).prop, "roof_corner_flat");
  assert.equal(pieceAt(bent, 1, 2).prop, "roof_slope_flat");
  assert.deepEqual([pieceAt(bent, 1, 1).prop, pieceAt(bent, 1, 1).elevation], ["roof_flat", 0.5]);
  for (const p of bent) assert.equal(p.rotation, pieceAt(plan, p.x, p.y).rotation);
}

// ---- how the forms differ on a deeper roof

// (symbols: ^ > v < slopes pointing uphill; \ L 7 / hips by their high corner SE SW NW NE;
//  # flat; heights: the piece's elevation, h = a half)
{
  const cells = rect(5, 5);
  // slope only: it keeps climbing to the peak
  const slope = draw(cells, planRoof(cells, "slope"));
  assert.deepEqual(slope.symbols, ["\\vvvL", ">\\vL<", ">>#<<", ">/^7<", "/^^^7"]);
  assert.deepEqual(slope.heights, ["00000", "01110", "01210", "01110", "00000"]);
  // slope and flat: one ring of slope, the flat at its top
  const flat = draw(cells, planRoof(cells, "flat"));
  assert.deepEqual(flat.symbols, ["\\vvvL", ">###<", ">###<", ">###<", "/^^^7"]);
  assert.deepEqual(flat.heights, ["00000", "01110", "01110", "01110", "00000"]);
  // the bent pieces: the same shape, the flat at half a unit
  const bent = draw(cells, planRoof(cells, "bent"));
  assert.deepEqual(bent.symbols, flat.symbols);
  assert.deepEqual(bent.heights, ["00000", "0hhh0", "0hhh0", "0hhh0", "00000"]);
  assert.equal(pieceAt(planRoof(cells, "bent"), 2, 0).prop, "roof_slope_flat");
}

// a long roof: a ridge of flats at the height the slopes reach (hips at the ends)
{
  const cells = rect(7, 3);
  const d = draw(cells, planRoof(cells, "slope"));
  assert.deepEqual(d.symbols, ["\\vvvvvL", ">#####<", "/^^^^^7"]);
  assert.deepEqual(d.heights, ["0000000", "0111110", "0000000"]);
  // an even width: the two slopes meet at a ridge line, no flat needed
  const even = rect(4, 4);
  const e = draw(even, planRoof(even, "slope"));
  assert.deepEqual(e.symbols, ["\\vvL", ">\\L<", ">/7<", "/^^7"]);
  assert.deepEqual(e.heights, ["0000", "0110", "0110", "0000"]);
  assert.equal(e.symbols[1][1] === "\\", true);
}

// ---- the outline's shape: an L has an inner corner, a hole is rounded by a valley

{
  const l = cellsOf("####\n####\n##..\n##..");
  const d = draw(l, planRoof(l, "slope"));
  // the cell next to the notch's corner is an inner piece, its eaves at that corner
  assert.equal(d.symbols[1][1], "J");
  assert.equal(pieceAt(planRoof(l, "slope"), 1, 1).prop, "roof_inner");
  assert.equal(pieceAt(planRoof(l, "slope"), 1, 1).rotation, 0);
  assert.deepEqual(d.symbols, ["\\vvL", ">J^7", "><..", "/7.."]);
  assert.deepEqual(d.heights, ["0000", "0000", "00..", "00.."]);
  // a hole in a roof: its edges are eaves too, valleys at its corners
  const hole = cellsOf("#####\n#####\n##.##\n#####\n#####");
  const h = draw(hole, planRoof(hole, "slope"));
  assert.deepEqual(h.symbols, ["\\vvvL", ">J^b<", "><.><", ">qvr<", "/^^^7"]);
}

// ---- a roof one cell wide (or two): nothing to climb, then a ridge

{
  const strip = rect(5, 1);
  const flats = planRoof(strip, "slope");
  assert.ok(flats.every((p) => p.prop === "roof_flat" && p.elevation === 0));
  const two = rect(5, 2);
  assert.deepEqual(draw(two, planRoof(two, "slope")).symbols, ["\\vvvL", "/^^^7"]);
  const single = planRoof(rect(1, 1), "bent");
  assert.deepEqual(single.map((p) => [p.prop, p.elevation]), [["roof_flat", 0]]);
}

// ---- floor heights: each level is a roof area of its own, eaves where the floor steps

{
  // two raised blocks side by side, one storey apart: each is a roof of its own
  const cells = cellsOf("11122\n11122\n11122");
  const plan = planRoof(cells, "slope");
  const left = planRoof(rect(3, 3), "slope");
  for (const p of left) {
    const q = pieceAt(plan, p.x, p.y);
    assert.deepEqual([q.prop, q.rotation, q.elevation], [p.prop, p.rotation, p.elevation]);
  }
  // (the same shape, the eaves at the step: the right block's pieces match a 2x3 roof)
  const right = planRoof(rect(2, 3), "slope");
  for (const p of right) {
    const q = pieceAt(plan, p.x + 3, p.y);
    assert.deepEqual([q.prop, q.rotation, q.elevation], [p.prop, p.rotation, p.elevation]);
  }
  // the level only separates areas: elevations stay relative to each cell's own floor
  assert.ok(plan.every((p) => p.elevation <= 1));
}

// ---- an area that isn't a rectangle: an L and a plus, every cell gets a piece

{
  const plus = cellsOf(".###.\n#####\n#####\n#####\n.###.");
  const plan = planRoof(plus, "flat");
  assert.equal(plan.length, plus.length);
  // (the plus' notches are inner corners)
  assert.ok(plan.some((p) => p.prop === "roof_inner"));
}

// ---- the surface: the corners match the heights, the edges meet, the field is followed

function field(cells: RoofCell[], level: number) {
  return cells.filter((c) => c.level === level);
}
const dir = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const;
let seed = 12345;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
let saddles = 0;
let checked = 0;
let shaved = 0;
for (let trial = 0; trial < 300; trial++) {
  const w = 1 + Math.floor(random() * 9);
  const h = 1 + Math.floor(random() * 9);
  const density = 0.55 + random() * 0.45;
  const cells: RoofCell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (random() < density) cells.push({ x, y, level: random() < 0.15 ? 1 : 0 });
  if (!cells.length) continue;
  // (the three forms of the slope family: the others have their own checks in roofForms.test.ts)
  for (const form of ROOF_FORMS.filter((f) => f === "slope" || f === "flat" || f === "bent")) {
    const plan = planRoof(cells, form);
    assert.equal(plan.length, cells.length);
    plan.forEach((p, i) => assert.deepEqual([p.x, p.y], [cells[i].x, cells[i].y]));
    const level = (x: number, y: number) => cells.find((c) => c.x === x && c.y === y)?.level;
    for (const p of plan) {
      const area = field(cells, level(p.x, p.y)!);
      const cap = form === "slope" ? Infinity : form === "flat" ? 1 : 0.5;
      const distance = outlineDistances(area);
      assert.ok(p.elevation >= 0 && p.elevation * 2 === Math.round(p.elevation * 2), "elevations are multiples of a half");
      assert.ok(p.rotation === 0 || p.rotation === 90 || p.rotation === 180 || p.rotation === 270);
      if (p.approx) {
        saddles++;
        continue;
      }
      checked++;
      // the four corners are at the outline distance (capped by the form)
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const want = Math.min(distance(p.x + u, p.y + v), cap);
        const got = roofPieceHeightAt(p, u, v);
        assert.ok(Math.abs(got - want) < 1e-9, `${form} corner ${u},${v} of ${p.x},${p.y}: ${got} vs ${want}`);
      }
      // inside the cell the surface follows the true distance to within half a unit
      let worst = 0;
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
        const want = roofFieldAt(area, form, p.x + a / 8, p.y + b / 8);
        worst = Math.max(worst, Math.abs(roofPieceHeightAt(p, a / 8, b / 8) - want));
      }
      if (worst > 1e-9) {
        // (a ridge flat's peak; or an outline touching the cell only at a corner, where the true distance would
        // bulge between two outline points - the roof stays level there)
        shaved++;
        assert.ok(worst <= 0.5 + 1e-9, `the surface is off by ${worst} at ${p.x},${p.y}`);
      }
    }
    // the neighbouring pieces meet along the edge they share (unless one is a saddle's stand-in)
    for (const p of plan) {
      for (const [side, [dx, dy]] of Object.entries(dir)) {
        const q = plan.find((o) => o.x === p.x + dx && o.y === p.y + dy);
        if (!q || p.approx || q.approx || level(p.x, p.y) !== level(q.x, q.y)) continue;
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          const [pu, pv] = side === "N" ? [t, 0] : side === "S" ? [t, 1] : side === "W" ? [0, t] : [1, t];
          const [qu, qv] = side === "N" ? [t, 1] : side === "S" ? [t, 0] : side === "W" ? [1, t] : [0, t];
          // (a flat on a ridge has its edges at the ridge's corner heights: they meet too)
          const a = roofPieceHeightAt(p, pu, pv);
          const b = roofPieceHeightAt(q, qu, qv);
          assert.ok(Math.abs(a - b) < 1e-9, `${form}: ${p.x},${p.y} ${side} edge ${a} vs ${b}`);
        }
      }
    }
  }
}
assert.ok(checked > 3000, "the random roofs were really checked");
console.log(`random roofs: ${checked} pieces checked (${shaved} off the true distance field inside the cell by up to half a unit), ${saddles} saddles stood in for by a flat`);

// ---- changing the area changes the neighbours (what the editor relies on)

{
  const small = rect(3, 3);
  const before = planRoof(small, "slope");
  const grown = planRoof([...small, ...rect(1, 3, 3)], "slope");
  // the right edge of the 3x3 was the edge, now it is inside a longer roof: its slopes and hips turn into
  // a ridge row and hips at the new end
  assert.equal(pieceAt(before, 2, 1).prop, "roof_slope");
  assert.equal(pieceAt(grown, 2, 1).prop, "roof_flat");
  assert.equal(pieceAt(grown, 3, 1).prop, "roof_slope");
  assert.equal(pieceAt(grown, 3, 1).rotation, 270);
  // taking one back out restores it
  assert.deepEqual(planRoof(grown.slice(0, 9).map(({ x, y }) => ({ x, y, level: 0 })), "slope"), before);
}

// ---- the raised floor's footprint

{
  // floor heights: a 3x2 block at 1 in a field at 0, walls (null) round the map
  const floors: Record<string, number> = {};
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) floors[`${x},${y}`] = x >= 2 && x <= 4 && y >= 2 && y <= 3 ? 1 : 0;
  const floorAt = (x: number, y: number) => (x < 0 || y < 0 || x > 6 || y > 5 ? null : floors[`${x},${y}`]);
  const block = raisedFootprint({ x: 3, y: 2 }, floorAt)!;
  assert.equal(block.length, 6);
  assert.ok(block.every((c) => floors[`${c.x},${c.y}`] === 1));
  // the level ground isn't a raised block
  assert.equal(raisedFootprint({ x: 0, y: 0 }, floorAt), null);
  // a wall isn't a floor
  assert.equal(raisedFootprint({ x: -1, y: 0 }, floorAt), null);
  // one too big: refused
  assert.equal(raisedFootprint({ x: 3, y: 2 }, floorAt, 5), null);
  // a block next to a higher one: its own level only
  floors["5,2"] = 2;
  floors["5,3"] = 2;
  assert.equal(raisedFootprint({ x: 3, y: 2 }, floorAt)!.length, 6);
  assert.equal(raisedFootprint({ x: 5, y: 2 }, floorAt)!.length, 2);
}

console.log("roofAutotile ok");

