// Run: npx tsx src/game/fenceLayers.test.ts
import assert from "node:assert/strict";
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
const {
  FENCE_JITTER,
  FENCE_PROP,
  FENCE_SPACING,
  FENCE_VARIANTS,
  cleanFenceStyle,
  edgeFenceBetween,
  fenceBlocksSight,
  fenceBoxes,
  fenceClosesCell,
  fenceFaces,
  fenceIndex,
  fenceMarks,
  fenceModelSpec,
  fencePieceOf,
  fenceProblems,
  fenceVariant,
  isFoliageSpec,
  midArms,
} = await import("./fences");
const { FOLIAGE_MIN_GAP, FOLIAGE_SHIFTS, foliageFloorMark, foliagePlanes, unitHash } = await import("./fenceLayers");
const { parseMap } = await import("./mapFormat");
const { passage } = await import("./heights");
const { propBlocks, propBoxes } = await import("./props");
type FenceProp = import("./fences").FenceProp;
type FenceStyle = import("./fences").FenceStyle;
type FenceModelSpec = import("./fences").FenceModelSpec;
type Direction = import("./types").Direction;

const piece = (form: "block" | "edge" | "mid", x: number, y: number, extra: Partial<FenceProp> = {}): FenceProp => ({ prop: FENCE_PROP[form], cell: { x, y }, at: "center", ...extra });
const edge = (x: number, y: number, side: Direction, fence?: FenceStyle): FenceProp => piece("edge", x, y, { at: side, fence });
const mid = (x: number, y: number, fence?: FenceStyle): FenceProp => piece("mid", x, y, { fence });
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const specOf = (props: FenceProp[], index = 0): FenceModelSpec => {
  const idx = fenceIndex(props);
  return fenceModelSpec(idx, idx.byIndex.get(index)!);
};

// ---- the style: the new fields pulled in, defaults left out, idempotent
{
  assert.equal(cleanFenceStyle({ layers: 1 }), undefined, "one layer is the plain fence");
  assert.equal(cleanFenceStyle({ layers: 0.4 }), undefined);
  assert.deepEqual(cleanFenceStyle({ layers: 3.4 }), { layers: 3 });
  assert.deepEqual(cleanFenceStyle({ layers: 99 }), { layers: 8 });
  assert.deepEqual(cleanFenceStyle({ layers: "3" as never }), undefined, "a string is junk");
  assert.deepEqual(cleanFenceStyle({ spacing: 0.01 }), { spacing: 0.04 });
  assert.deepEqual(cleanFenceStyle({ spacing: 9 }), { spacing: 0.5 });
  assert.equal(cleanFenceStyle({ spacing: FENCE_SPACING }), undefined, "the default spacing is left out");
  assert.equal(cleanFenceStyle({ spacing: 0.151 }), undefined, "and so is one that rounds to it");
  assert.deepEqual(cleanFenceStyle({ jitter: 0 }), { jitter: 0 }, "no jitter at all is a setting: the default is not 0");
  assert.deepEqual(cleanFenceStyle({ jitter: 5 }), { jitter: 0.5 });
  assert.equal(cleanFenceStyle({ jitter: FENCE_JITTER }), undefined);
  assert.deepEqual(cleanFenceStyle({ cross: "axes" }), { cross: "axes" });
  assert.deepEqual(cleanFenceStyle({ cross: "diagonal" }), { cross: "diagonal" });
  assert.equal(cleanFenceStyle({ cross: "none" }), undefined);
  assert.equal(cleanFenceStyle({ cross: true }), undefined);
  assert.deepEqual(cleanFenceStyle({ solid: false }), { solid: false });
  assert.equal(cleanFenceStyle({ solid: true }), undefined, "solid is the default");
  const once = cleanFenceStyle({ layers: 4, spacing: 0.234, jitter: 0.333, cross: "diagonal", solid: false, opaque: false, height: 1.5 });
  assert.deepEqual(once, { height: 1.5, opaque: false, layers: 4, spacing: 0.23, jitter: 0.33, cross: "diagonal", solid: false });
  assert.deepEqual(cleanFenceStyle(JSON.parse(JSON.stringify(once))), once, "a round trip through the map file changes nothing");
  assert.deepEqual(cleanFenceStyle(once), once, "and cleaning twice is cleaning once");
  // an old style is read as it always was
  assert.deepEqual(cleanFenceStyle({ height: 2, thickness: 0.2, top: "wall4", opaque: true }), { height: 2, thickness: 0.2, top: "wall4", opaque: true });
}

// ---- the piece: foliage when it has layers or an X; single sheets; solid by default
{
  const plain = fencePieceOf(edge(3, 3, "N"), 0)!;
  assert.equal(plain.layers, 1);
  assert.equal(plain.foliage, false);
  assert.equal(plain.solid, true, "every old piece stops bodies");
  const layered = fencePieceOf(edge(3, 3, "N", { layers: 3, thickness: 0.3, top: "wall4" }), 0)!;
  assert.equal(layered.foliage, true);
  assert.equal(layered.thickness, 0, "a foliage plane is a single sheet");
  const x = fencePieceOf(mid(3, 3, { cross: "axes", solid: false }), 0)!;
  assert.equal(x.foliage, true);
  assert.equal(x.cross, "axes");
  assert.equal(x.solid, false);
  assert.equal(fencePieceOf(edge(3, 3, "N", { cross: "axes" }), 0)!.foliage, false, "an X is for mid pieces only");
  assert.equal(fencePieceOf(piece("block", 3, 3, { fence: { layers: 4, cross: "axes", solid: false } }), 0)!.foliage, false, "a block is never foliage");
  assert.equal(fencePieceOf(piece("block", 3, 3, { fence: { solid: false } }), 0)!.solid, true, "and always solid");
}

// ---- the planes: counts, determinism, no two alike, never nearer than the least gap
{
  const edgeSpec = (side: Direction, extra: Partial<FenceModelSpec> = {}): FenceModelSpec => ({ form: "edge", height: 1, thickness: 0, side, layers: 3, spacing: 0.15, jitter: 0.1, seed: 2, ...extra });
  const midSpec = (extra: Partial<FenceModelSpec> = {}): FenceModelSpec => ({ form: "mid", height: 1, thickness: 0, arms: [], axis: "x", layers: 3, spacing: 0.15, jitter: 0.1, seed: 2, ...extra });
  const crossSpec = (cross: "axes" | "diagonal", extra: Partial<FenceModelSpec> = {}): FenceModelSpec => midSpec({ cross, ...extra });

  assert.equal(foliagePlanes(edgeSpec("N")).length, 3);
  assert.equal(foliagePlanes(midSpec()).length, 3);
  assert.equal(foliagePlanes(crossSpec("axes")).length, 6, "two families of planes, three layers each");
  assert.equal(foliagePlanes(crossSpec("diagonal", { layers: 5 })).length, 10);
  assert.deepEqual(foliagePlanes(edgeSpec("E")), foliagePlanes(edgeSpec("E")), "deterministic: the same spec, the same planes");
  assert.notDeepEqual(foliagePlanes(edgeSpec("N", { seed: 1 })), foliagePlanes(edgeSpec("N", { seed: 5 })), "another variant, another drawing");

  // the first plane of an edge fence is the edge itself; the others go into the cell
  for (const [side, cx, cz, inward] of [["N", 0, -0.5, [0, 1]], ["S", 0, 0.5, [0, -1]], ["W", -0.5, 0, [1, 0]], ["E", 0.5, 0, [-1, 0]]] as const) {
    const planes = foliagePlanes(edgeSpec(side as Direction));
    near(planes[0].cx, cx);
    near(planes[0].cz, cz);
    assert.equal(planes[0].shift, 0);
    assert.equal(planes[0].flip, false);
    assert.equal(planes[0].sx, 1);
    for (const p of planes.slice(1)) {
      const depth = (p.cx - cx) * inward[0] + (p.cz - cz) * inward[1];
      assert.ok(depth >= FOLIAGE_MIN_GAP - 1e-9, `${side}: layer ${p.layer} is ${depth} into the cell`);
    }
  }
  // a mid fence's layers sit both sides of its line
  {
    const planes = foliagePlanes(midSpec({ jitter: 0 }));
    near(planes[0].cz, -0.15 + 0.0031);
    near(planes[1].cz, 0.0031);
    near(planes[2].cz, 0.15 + 0.0031);
    assert.ok(planes.every((p) => p.shift === 0 && !p.flip && p.sx === 1 && p.sy === 1 && p.cx === 0), "no jitter: regular, plain planes");
    assert.deepEqual(planes.map((p) => p.du), [[1, 0], [1, 0], [1, 0]]);
  }
  // an X: two perpendicular families (the diagonals at 45 degrees), each with a unit direction
  {
    const axes = foliagePlanes(crossSpec("axes", { layers: 1 }));
    assert.deepEqual(axes.map((p) => p.du), [[1, 0], [0, 1]]);
    const diagonal = foliagePlanes(crossSpec("diagonal", { layers: 1 }));
    for (const p of diagonal) near(Math.hypot(p.du[0], p.du[1]), 1, 1e-3);
    near(diagonal[0].du[0] * diagonal[1].du[0] + diagonal[0].du[1] * diagonal[1].du[1], 0, 1e-3);
    assert.equal(diagonal.length, 2);
  }

  // never two planes of one piece nearer than the least gap, over every setting
  let checked = 0;
  for (const form of ["edge", "mid", "axes", "diagonal"] as const) {
    for (let layers = 1; layers <= 8; layers++) {
      for (const spacing of [0.04, 0.05, 0.1, 0.15, 0.3, 0.5]) {
        for (const jitter of [0, 0.05, 0.1, 0.3, 0.5]) {
          for (let seed = 0; seed < FENCE_VARIANTS; seed++) {
            const planes = foliagePlanes(form === "edge" ? edgeSpec("N", { layers, spacing, jitter, seed }) : form === "mid" ? midSpec({ layers, spacing, jitter, seed }) : crossSpec(form, { layers, spacing, jitter, seed }));
            assert.equal(planes.length, layers * (form === "edge" || form === "mid" ? 1 : 2));
            for (const a of planes) {
              for (const b of planes) {
                if (a === b || a.family !== b.family) continue;
                // the distance between two parallel planes, across them
                const across = Math.abs((b.cx - a.cx) * -a.du[1] + (b.cz - a.cz) * a.du[0]);
                // (planes slid along themselves still lie in their own lines)
                assert.ok(across >= FOLIAGE_MIN_GAP - 1e-6, `${form} layers ${layers} spacing ${spacing} jitter ${jitter} seed ${seed}: planes ${a.layer} and ${b.layer} are ${across} apart`);
                checked++;
              }
            }
            if (form === "edge") {
              // the stack stays in its cell, whatever the spacing
              for (const p of planes) assert.ok(p.cz >= -0.5 - 1e-9 && p.cz <= 0.5 + 1e-9 + 0.0053, `edge layer ${p.layer} at ${p.cz}`);
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 10000);
  // and the shifts and flips are ones the relief can be cut for
  for (let seed = 0; seed < FENCE_VARIANTS; seed++) {
    for (const p of foliagePlanes(edgeSpec("N", { layers: 8, jitter: 0.5, seed }))) {
      assert.ok(p.shift >= 0 && p.shift < 1 && Math.abs(p.shift * FOLIAGE_SHIFTS - Math.round(p.shift * FOLIAGE_SHIFTS)) < 1e-9);
      assert.ok(p.sx >= 1 && p.sx <= 1.1 + 1e-9 && p.sy >= 0.9 - 1e-9 && p.sy <= 1.1 + 1e-9);
    }
  }
  // jitter really varies the planes of one piece (the pictures are not the same plane over and over)
  {
    const planes = foliagePlanes(edgeSpec("N", { layers: 8, jitter: 0.5, seed: 3 }));
    assert.ok(new Set(planes.map((p) => p.shift)).size > 1, "several different shifts");
    assert.ok(planes.some((p) => p.flip) && planes.some((p) => !p.flip), "some reversed, some not");
    assert.ok(new Set(planes.map((p) => p.cx)).size > 4, "slid along the edge by different amounts");
  }
  // a corner of a mid fence: its half-length stubs show part of the texture and are not shifted or slid
  {
    const corner = foliagePlanes(midSpec({ arms: ["N", "E"], layers: 3, jitter: 0.5 }));
    assert.equal(corner.length, 6);
    for (const p of corner) {
      assert.equal(p.shift, 0);
      assert.ok(p.u1 - p.u0 <= 0.75);
    }
  }
  // the hash is a function of its three numbers only
  assert.equal(unitHash(1, 2, 3), unitHash(1, 2, 3));
  assert.notEqual(unitHash(1, 2, 3), unitHash(1, 2, 4));
  for (let i = 0; i < 200; i++) assert.ok(unitHash(i, i * 7, 3) >= 0 && unitHash(i, i * 7, 3) < 1);

  // the floor marks follow the planes: one rectangle per family
  {
    const marks = foliageFloorMark(crossSpec("diagonal", { layers: 3 }));
    assert.equal(marks.length, 2);
    for (const m of marks) assert.ok(m.sx > 0 && m.sz > 0.14);
    assert.equal(foliageFloorMark(edgeSpec("S")).length, 1);
  }
}

// ---- the model: what the renderer is told, and the variants
{
  const props = [edge(3, 3, "N", { layers: 3, jitter: 0.2, top: "wall4", thickness: 0.3, deco: { every: 2, post: true } }), mid(5, 5, { cross: "diagonal", layers: 2, solid: false })];
  const a = specOf(props, 0);
  assert.equal(a.layers, 3);
  assert.equal(a.jitter, 0.2);
  assert.equal(a.spacing, FENCE_SPACING);
  assert.equal(a.top, undefined, "no top on foliage");
  assert.equal(a.post, undefined, "no decoration on foliage");
  assert.equal(a.thickness, 0);
  assert.equal(a.seed, fenceVariant(3, 3));
  assert.ok(isFoliageSpec(a));
  assert.deepEqual(fenceFaces(a), [], "its panels are the foliage planes, not flat faces");
  const b = specOf(props, 1);
  assert.equal(b.cross, "diagonal");
  assert.deepEqual(b.arms, []);
  assert.ok(isFoliageSpec(b));
  // a plain piece's spec is as it was: none of the new fields
  const plain = specOf([edge(3, 3, "N", { thickness: 0.2 })]);
  assert.deepEqual(plain, { form: "edge", height: 1, thickness: 0.2, side: "N" });
  assert.ok(!isFoliageSpec(plain));
  // the variants: a few, by position, the same every time
  const seen = new Set<number>();
  for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) {
    const v = fenceVariant(x, y);
    assert.ok(v >= 0 && v < FENCE_VARIANTS && Number.isInteger(v));
    assert.equal(v, fenceVariant(x, y));
    seen.add(v);
  }
  assert.equal(seen.size, FENCE_VARIANTS, "every variant comes up");
  // neighbours mostly differ (not the same picture row after row)
  let same = 0;
  for (let x = 0; x < 30; x++) if (fenceVariant(x, 4) === fenceVariant(x + 1, 4)) same++;
  assert.ok(same < 12, `${same} of 30 neighbours alike`);
}

// ---- how foliage sits among the other pieces
{
  // an X is no arm of a fence line: a mid fence next to one runs on its own
  const idx = fenceIndex([mid(3, 3), mid(4, 3, { cross: "axes", solid: false }), mid(2, 3)]);
  assert.deepEqual(midArms(idx, { x: 3, y: 3 }), ["W"], "the plain neighbour is an arm, the X is not");
  assert.deepEqual(fenceModelSpec(idx, idx.byIndex.get(1)!).arms, []);
  // the marks: a line with its layers, an X with its kind
  const marks = fenceMarks(fenceIndex([edge(3, 3, "N", { layers: 3 }), mid(5, 5, { cross: "diagonal", layers: 2 }), mid(6, 5, { cross: "axes" }), mid(7, 7)]));
  const lines = marks.filter((m) => m.kind === "line");
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((m) => (m.kind === "line" ? m.layers : 0)).sort(), [1, 3]);
  const crosses = marks.filter((m) => m.kind === "cross");
  assert.deepEqual(crosses.map((m) => (m.kind === "cross" ? [m.diagonal, m.layers] : null)), [[true, 2], [false, 1]]);
  // a duplicate edge is still one: foliage lives by the same one-id-per-edge rule
  const dup = fenceIndex([edge(3, 3, "N", { layers: 3 }), edge(3, 2, "S", { layers: 5 })]);
  assert.equal(dup.edges.size, 1);
  assert.equal(dup.edges.get("H3,3")!.layers, 3, "the first one keeps the edge");
  assert.equal(fenceProblems([edge(3, 3, "N", { layers: 3 }), edge(3, 2, "S")]).filter((p) => p.kind === "doubleEdge").length, 1);
}

// ---- walking through foliage: only `solid` pieces stop bodies; sight follows `opaque` alone
{
  const walk = fenceIndex([edge(3, 3, "E", { layers: 3, solid: false }), edge(3, 5, "E", { layers: 3 }), mid(6, 3, { cross: "axes", solid: false }), mid(6, 5, { cross: "axes" }), mid(8, 3, { layers: 2, solid: false })]);
  assert.equal(edgeFenceBetween(walk, { x: 3, y: 3 }, { x: 4, y: 3 }), undefined, "walkable foliage on an edge: no fence between the cells");
  assert.ok(edgeFenceBetween(walk, { x: 3, y: 5 }, { x: 4, y: 5 }), "a solid layered fence still shuts its edge");
  assert.equal(fenceClosesCell(walk, 6, 3), false);
  assert.equal(fenceClosesCell(walk, 6, 5), true, "a solid X is a bush filling its cell");
  assert.equal(fenceClosesCell(walk, 8, 3), false);
  assert.equal(fenceBoxes(walk, 3, 3).length, 0);
  assert.equal(fenceBoxes(walk, 4, 3).length, 0);
  assert.equal(fenceBoxes(walk, 6, 3).length, 0);
  assert.equal(fenceBoxes(walk, 6, 5).length, 1);
  assert.equal(fenceBoxes(walk, 8, 3).length, 0);
  assert.equal(fenceBoxes(walk, 3, 5).length, 1);
  // an opaque, walkable X hides what is behind it while bodies pass through
  const hedge = fenceIndex([mid(6, 3, { cross: "axes", solid: false, opaque: true })]);
  assert.equal(fenceBoxes(hedge, 6, 3).length, 0);
  assert.equal(fenceBlocksSight(hedge, 4, 3, 8, 3), true);
  const see = fenceIndex([mid(6, 3, { cross: "axes", solid: false })]);
  assert.equal(fenceBlocksSight(see, 4, 3, 8, 3), false, "see-through by default");
  // the warning for layers that block sight
  assert.deepEqual(fenceProblems([edge(3, 3, "N", { layers: 3, opaque: true })]).map((p) => p.kind), ["layeredOpaque"]);
  assert.deepEqual(fenceProblems([edge(3, 3, "N", { opaque: true })]), [], "a plain opaque fence is fine");
  assert.deepEqual(fenceProblems([edge(3, 3, "N", { layers: 3 })]), [], "see-through layers are fine");
  assert.deepEqual(fenceProblems([mid(3, 3, { cross: "axes", opaque: true })]), [], "(an X with one layer: the same as a plain one)");
}

// ---- in the game: the map file round trip, grid movement, free movement
{
  type Props = NonNullable<MapFile["props"]>;
  const file = (props: Props): MapFile => ({
    name: "t",
    deck: 1,
    start: { x: 1, y: 1, facing: "E" },
    layout: Array.from({ length: 9 }, (_, y) => Array.from({ length: 11 }, (_, x) => (x === 0 || y === 0 || x === 10 || y === 8 ? "W" : ".")).join("")),
    props,
  } as unknown as MapFile);
  const props: Props = [
    { prop: "fence_edge", x: 3, y: 3, at: "E", fence: { layers: 4, spacing: 0.2, jitter: 0.3, solid: false } },
    { prop: "fence_mid", x: 6, y: 3, fence: { cross: "diagonal", layers: 2, solid: false } },
    { prop: "fence_mid", x: 6, y: 5, fence: { cross: "axes" } },
    { prop: "fence_edge", x: 3, y: 6, at: "E", fence: { layers: 3 } },
    { prop: "fence_mid", x: 8, y: 6 },
  ];
  const map = parseMap("foliage", file(props));
  assert.deepEqual(map.props!.map((p) => p.fence), props.map((p) => p.fence), "the new fields are kept as written");
  const again = parseMap("again", file(map.props!.map((p) => ({ prop: p.prop, x: p.cell.x, y: p.cell.y, at: p.at, rotation: p.rotation, texture: p.texture, fence: p.fence })) as Props));
  assert.deepEqual(again.props!.map((p) => p.fence), map.props!.map((p) => p.fence));
  const soft = parseMap("soft", file([{ prop: "fence_mid", x: 3, y: 5, fence: { layers: 40, spacing: 0, jitter: 9, cross: "star" } as never }]));
  assert.deepEqual(soft.props![0].fence, { layers: 8, spacing: 0.04, jitter: 0.5 });

  const from = (x: number, y: number) => ({ x, y });
  const step = (a: { x: number; y: number }, b: { x: number; y: number }) => passage(map, a, 0, b, b.x > a.x ? "E" : b.x < a.x ? "W" : b.y > a.y ? "S" : "N");
  assert.equal(step(from(3, 3), from(4, 3)).kind, "walk", "through the walkable layered edge");
  assert.equal(step(from(4, 3), from(3, 3)).kind, "walk");
  assert.equal(step(from(5, 3), from(6, 3)).kind, "walk", "into a walkable X");
  assert.equal(step(from(6, 3), from(7, 3)).kind, "walk", "and out the other side");
  assert.equal(propBlocks(map, from(6, 3)), false);
  assert.deepEqual(step(from(5, 5), from(6, 5)), { kind: "blocked", reason: "prop" }, "a solid X closes its cell");
  assert.equal(propBlocks(map, from(6, 5)), true);
  assert.deepEqual(step(from(3, 6), from(4, 6)), { kind: "blocked", reason: "prop" }, "a solid layered edge still shuts");
  assert.deepEqual(step(from(7, 6), from(8, 6)), { kind: "blocked", reason: "prop" }, "an old mid fence still closes its cell");
  assert.equal(propBlocks(map, from(8, 6)), true);
  // free movement: no bars for the walkable ones
  assert.equal(propBoxes(map, 3, 3).length, 0);
  assert.equal(propBoxes(map, 4, 3).length, 0);
  assert.equal(propBoxes(map, 6, 3).length, 0);
  assert.equal(propBoxes(map, 6, 5).length, 1);
  assert.equal(propBoxes(map, 3, 6).length, 1);
}

console.log("fenceLayers.test.ts: ok");
