// Run: npx tsx src/game/roofForms.test.ts
// The pyramid, pyramid-per-cell and gable forms of the roof autotile (see concept/editor-ui/NOTES-roof-forms.md)
import assert from "node:assert/strict";
import { parseRoofGroup, planRoof, roofFieldAt, roofGroupId, roofPieceHeightAt, ROOF_FORMS, type RoofCell, type RoofPiece } from "./roofAutotile";

const rect = (w: number, h: number, ox = 0, oy = 0): RoofCell[] =>
  Array.from({ length: w * h }, (_, i) => ({ x: ox + (i % w), y: oy + Math.floor(i / w), level: 0 }));
function cellsOf(art: string): RoofCell[] {
  const cells: RoofCell[] = [];
  art.trim().split("\n").forEach((row, y) => [...row.trim()].forEach((ch, x) => {
    if (/[0-9]/.test(ch)) cells.push({ x, y, level: Number(ch) });
    else if (ch === "#") cells.push({ x, y, level: 0 });
  }));
  return cells;
}

// one symbol per piece: ^ > v < slopes (pointing uphill), \ L 7 / hips (by their high corner SE SW NW NE),
// J b r q valleys, # flat, ~ a saddle's flat; A pyramid; = and | a ridge running east-west / north-south;
// E S W N the end of a ridge, by the side the ridge goes on to
function symbol(p: RoofPiece): string {
  const slope = { 0: "^", 90: ">", 180: "v", 270: "<" } as const;
  const hip = { 0: "/", 90: "\\", 180: "L", 270: "7" } as const;
  const valley = { 0: "J", 90: "b", 180: "r", 270: "q" } as const;
  const end = { 0: "E", 90: "S", 180: "W", 270: "N" } as const;
  switch (p.prop) {
    case "roof_flat": return p.approx ? "~" : "#";
    case "roof_slope": case "roof_slope_flat": return slope[p.rotation];
    case "roof_corner": case "roof_corner_flat": return hip[p.rotation];
    case "roof_ridge": return p.rotation === 0 || p.rotation === 180 ? "=" : "|";
    case "roof_hipend": return end[p.rotation];
    case "roof_pyramid": return "A";
    default: return valley[p.rotation];
  }
}
function draw(cells: RoofCell[], plan: RoofPiece[]) {
  const w = Math.max(...cells.map((c) => c.x)) + 1;
  const h = Math.max(...cells.map((c) => c.y)) + 1;
  const sym = Array.from({ length: h }, () => Array(w).fill("."));
  const hei = Array.from({ length: h }, () => Array(w).fill("."));
  plan.forEach((p) => {
    sym[p.y][p.x] = symbol(p);
    hei[p.y][p.x] = String(p.elevation);
  });
  return { symbols: sym.map((r) => r.join("")), heights: hei.map((r) => r.join("")) };
}
const show = (w: number, h: number, form: "pyramid" | "pyramidcell" | "gable") => {
  const cells = rect(w, h);
  return draw(cells, planRoof(cells, form));
};

// ---- the group ids

for (const form of ROOF_FORMS) assert.deepEqual(parseRoofGroup(roofGroupId(form, 7)), { form, n: 7 });
assert.deepEqual(parseRoofGroup("pyramidcell-2"), { form: "pyramidcell", n: 2 });
assert.deepEqual(parseRoofGroup("pyramid-10"), { form: "pyramid", n: 10 });
assert.deepEqual(parseRoofGroup("gable-1"), { form: "gable", n: 1 });
assert.equal(parseRoofGroup("pyramidcell"), null);
assert.equal(parseRoofGroup("pyramids-1"), null);
assert.equal(parseRoofGroup("gable-"), null);

// ---- the pyramid form: hips as before, the true peak where the slope form shaves it flat

{
  // one cell: a one-cell pyramid
  assert.deepEqual(show(1, 1, "pyramid"), { symbols: ["A"], heights: ["0"] });
  // 2x2: four hips meeting in a point (already a pyramid)
  assert.deepEqual(show(2, 2, "pyramid").symbols, ["\\L", "/7"]);
  // 3x3: one pyramid in the middle, a storey up, the ring of slopes round it
  assert.deepEqual(show(3, 3, "pyramid"), { symbols: ["\\vL", ">A<", "/^7"], heights: ["000", "010", "000"] });
  assert.deepEqual(show(4, 4, "pyramid").symbols, ["\\vvL", ">\\L<", ">/7<", "/^^7"]);
  assert.deepEqual(show(5, 5, "pyramid"), {
    symbols: ["\\vvvL", ">\\vL<", ">>A<<", ">/^7<", "/^^^7"],
    heights: ["00000", "01110", "01210", "01110", "00000"],
  });
  // the slope form is the same but for the middle cell
  const cells = rect(5, 5);
  const slope = planRoof(cells, "slope");
  const pyramid = planRoof(cells, "pyramid");
  slope.forEach((p, i) => { if (p.x !== 2 || p.y !== 2) assert.deepEqual(pyramid[i], p); });
  assert.equal(slope[12].prop, "roof_flat");
  assert.equal(pyramid[12].prop, "roof_pyramid");
  assert.equal(pyramid[12].elevation, 2);
}

{
  // a roof one cell wide: a ridge with hipped ends, in both orientations (the old forms made flats)
  assert.deepEqual(show(5, 1, "pyramid"), { symbols: ["E===W"], heights: ["00000"] });
  assert.deepEqual(show(1, 5, "pyramid").symbols, ["S", "|", "|", "|", "N"]);
  assert.deepEqual(show(2, 1, "pyramid").symbols, ["EW"]);
  assert.deepEqual(show(1, 2, "pyramid").symbols, ["S", "N"]);
  // two wide: nothing new is needed
  assert.deepEqual(show(6, 2, "pyramid").symbols, ["\\vvvvL", "/^^^^7"]);
  assert.deepEqual(show(2, 6, "pyramid").symbols, ["\\L", "><", "><", "><", "><", "/7"]);
  // an odd width on a long roof: the ridge row is a ridge now, with the hipped ends
  assert.deepEqual(show(5, 3, "pyramid"), { symbols: ["\\vvvL", ">E=W<", "/^^^7"], heights: ["00000", "01110", "00000"] });
  assert.deepEqual(show(3, 5, "pyramid").symbols, ["\\vL", ">S<", ">|<", ">N<", "/^7"]);
  assert.deepEqual(show(7, 5, "pyramid").symbols, ["\\vvvvvL", ">\\vvvL<", ">>E=W<<", ">/^^^7<", "/^^^^^7"]);
}

// floors: each level is a roof of its own, as in the other forms
{
  const cells = cellsOf("11122\n11122\n11122");
  const plan = planRoof(cells, "pyramid");
  const left = planRoof(rect(3, 3), "pyramid");
  const right = planRoof(rect(2, 3), "pyramid");
  for (const p of left) assert.deepEqual(plan.find((q) => q.x === p.x && q.y === p.y), p);
  for (const p of right) assert.deepEqual(plan.find((q) => q.x === p.x + 3 && q.y === p.y), { ...p, x: p.x + 3 });
}

// ---- pyramid per cell

{
  assert.deepEqual(show(1, 1, "pyramidcell"), { symbols: ["A"], heights: ["0"] });
  assert.deepEqual(show(3, 2, "pyramidcell"), { symbols: ["AAA", "AAA"], heights: ["000", "000"] });
  const ragged = cellsOf("##.\n.##");
  assert.deepEqual(draw(ragged, planRoof(ragged, "pyramidcell")).symbols, ["AA.", ".AA"]);
  // every cell on its own floor
  const two = cellsOf("12");
  assert.ok(planRoof(two, "pyramidcell").every((p) => p.prop === "roof_pyramid" && p.elevation === 0 && p.rotation === 0));
}

// ---- gable: a ridge along the longer side, two slopes, open ends

{
  // (the cells are w across by h down; a square has its ridge east-west)
  assert.deepEqual(show(1, 1, "gable"), { symbols: ["="], heights: ["0"] });
  // one cell wide, any length, both ways
  assert.deepEqual(show(5, 1, "gable"), { symbols: ["====="], heights: ["00000"] });
  assert.deepEqual(show(1, 5, "gable"), { symbols: ["|", "|", "|", "|", "|"], heights: ["0", "0", "0", "0", "0"] });
  // two wide: two slopes meeting on the line between the cells
  assert.deepEqual(show(6, 2, "gable"), { symbols: ["vvvvvv", "^^^^^^"], heights: ["000000", "000000"] });
  assert.deepEqual(show(2, 6, "gable").symbols, ["><", "><", "><", "><", "><", "><"]);
  // three wide: a ridge piece in the middle, a storey up
  assert.deepEqual(show(3, 3, "gable"), { symbols: ["vvv", "===", "^^^"], heights: ["000", "111", "000"] });
  assert.deepEqual(show(3, 7, "gable"), { symbols: Array(7).fill(">|<"), heights: Array(7).fill("010") });
  assert.deepEqual(show(9, 3, "gable").symbols, ["vvvvvvvvv", "=========", "^^^^^^^^^"]);
  // four wide
  assert.deepEqual(show(4, 9, "gable"), { symbols: Array(9).fill(">><<"), heights: Array(9).fill("0110") });
  // a ragged area: every line across the ridge has its own run (here the column at the west is three
  // cells across, the rest one)
  const l = cellsOf("####\n#...\n#...");
  assert.deepEqual(draw(l, planRoof(l, "gable")), { symbols: ["v===", "=...", "^..."], heights: ["0000", "1...", "0..."] });
  // floors: each is a roof of its own
  const steps = cellsOf("111000\n111000\n111000");
  const plan = planRoof(steps, "gable");
  assert.deepEqual(draw(steps, plan).symbols, ["vvvvvv", "======", "^^^^^^"]);
}

// ---- the surfaces: rectangles are exact, ragged areas are continuous where they should be

const dir = [[0, -1, "N"], [1, 0, "E"], [0, 1, "S"], [-1, 0, "W"]] as const;
function edgesMeet(plan: RoofPiece[], form: string, skip: (p: RoofPiece, q: RoofPiece) => boolean = () => false) {
  for (const p of plan) {
    for (const [dx, dy, side] of dir) {
      const q = plan.find((o) => o.x === p.x + dx && o.y === p.y + dy);
      if (!q || p.approx || q.approx || skip(p, q)) continue;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const [pu, pv] = side === "N" ? [t, 0] : side === "S" ? [t, 1] : side === "W" ? [0, t] : [1, t];
        const [qu, qv] = side === "N" ? [t, 1] : side === "S" ? [t, 0] : side === "W" ? [1, t] : [0, t];
        const a = roofPieceHeightAt(p, pu, pv);
        const b = roofPieceHeightAt(q, qu, qv);
        assert.ok(Math.abs(a - b) < 1e-9, `${form}: ${p.x},${p.y} ${side} edge ${a} vs ${b}`);
      }
    }
  }
}

// every rectangle of the pyramid form is the true hip roof: the surface is the distance to the rectangle's
// outline everywhere in it (no flat shaved off the ridge), and the pieces meet
for (let w = 1; w <= 9; w++) {
  for (let h = 1; h <= 9; h++) {
    const cells = rect(w, h);
    const plan = planRoof(cells, "pyramid");
    assert.ok(plan.every((p) => !p.approx));
    for (const p of plan) {
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
        const want = roofFieldAt(cells, "pyramid", p.x + a / 8, p.y + b / 8);
        const got = roofPieceHeightAt(p, a / 8, b / 8);
        assert.ok(Math.abs(got - want) < 1e-9, `pyramid ${w}x${h}: ${p.x},${p.y} at ${a / 8},${b / 8}: ${got} vs ${want}`);
      }
    }
    edgesMeet(plan, `pyramid ${w}x${h}`);
    // a square has exactly one pyramid when it is odd, none when even (four hips meet in a point)
    if (w === h) assert.equal(plan.filter((p) => p.prop === "roof_pyramid").length, w % 2 === 1 ? 1 : 0);
  }
}

// every rectangle of the gable form is a tent across its shorter side: the height is the distance to the
// two long edges, exactly
for (let w = 1; w <= 9; w++) {
  for (let h = 1; h <= 9; h++) {
    const cells = rect(w, h);
    const plan = planRoof(cells, "gable");
    const alongX = w >= h;
    for (const p of plan) {
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
        const px = p.x + a / 8;
        const py = p.y + b / 8;
        const want = alongX ? Math.min(py, h - py) : Math.min(px, w - px);
        const got = roofPieceHeightAt(p, a / 8, b / 8);
        assert.ok(Math.abs(got - want) < 1e-9, `gable ${w}x${h}: ${p.x},${p.y} at ${a / 8},${b / 8}: ${got} vs ${want}`);
      }
    }
    edgesMeet(plan, `gable ${w}x${h}`);
  }
}

// random ragged areas, pyramid form: every piece sits on its corners' heights, ridge/end/pyramid pieces
// are exactly the true surface, the rest is within half a unit of it, and the pieces meet
let seed = 4242;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
let peaks = 0;
for (let trial = 0; trial < 300; trial++) {
  const w = 1 + Math.floor(random() * 9);
  const h = 1 + Math.floor(random() * 9);
  const density = 0.55 + random() * 0.45;
  const cells: RoofCell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (random() < density) cells.push({ x, y, level: 0 });
  if (!cells.length) continue;
  const plan = planRoof(cells, "pyramid");
  assert.equal(plan.length, cells.length);
  for (const p of plan) {
    if (p.approx) continue;
    let worst = 0;
    for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
      worst = Math.max(worst, Math.abs(roofPieceHeightAt(p, a / 8, b / 8) - roofFieldAt(cells, "pyramid", p.x + a / 8, p.y + b / 8)));
    }
    if (p.prop === "roof_ridge" || p.prop === "roof_hipend" || p.prop === "roof_pyramid") {
      peaks++;
      assert.ok(worst < 1e-9, `${p.prop} at ${p.x},${p.y} is off the surface by ${worst}`);
    } else assert.ok(worst <= 0.5 + 1e-9, `off by ${worst} at ${p.x},${p.y}`);
  }
  edgesMeet(plan, "pyramid ragged");
}
assert.ok(peaks > 100, "the random roofs had peaks");

// random ragged areas, gable form: continuous across the ridge and along it wherever the run is the same
for (let trial = 0; trial < 200; trial++) {
  const w = 1 + Math.floor(random() * 9);
  const h = 1 + Math.floor(random() * 9);
  const cells: RoofCell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (random() < 0.8) cells.push({ x, y, level: 0 });
  if (!cells.length) continue;
  const plan = planRoof(cells, "gable");
  assert.equal(plan.length, cells.length);
  const alongX = Math.max(...cells.map((c) => c.x)) - Math.min(...cells.map((c) => c.x)) >= Math.max(...cells.map((c) => c.y)) - Math.min(...cells.map((c) => c.y));
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  // the run of a cell: the cells across the ridge it is joined to
  const run = (c: { x: number; y: number }) => {
    let a = alongX ? c.y : c.x;
    while (has.has(alongX ? `${c.x},${a - 1}` : `${a - 1},${c.y}`)) a--;
    let b = alongX ? c.y : c.x;
    while (has.has(alongX ? `${c.x},${b + 1}` : `${b + 1},${c.y}`)) b++;
    return `${a}-${b}`;
  };
  edgesMeet(plan, "gable ragged", (p, q) => run(p) !== run(q) && (alongX ? p.x !== q.x : p.y !== q.y));
  // (every cell: its eaves are at its run's ends, level with its floor)
  for (const p of plan) {
    const [first, last] = run(p).split("-").map(Number);
    const across = alongX ? p.y : p.x;
    const edge = (u: number) => roofPieceHeightAt(p, alongX ? 0.5 : u, alongX ? u : 0.5);
    if (across === first) assert.equal(edge(0), 0);
    if (across === last) assert.equal(edge(1), 0);
  }
}

console.log("roofForms ok");
