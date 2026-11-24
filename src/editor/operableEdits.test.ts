// Run: npx tsx src/editor/operableEdits.test.ts
import assert from "node:assert/strict";
import type { MapFile } from "../game/mapFormat";
import { addTarget, cleanSpec, linkTargetFor, operableInfo, removeTarget, setOperable, updateTarget } from "./operableEdits";
import type { OperableMap } from "../game/operables";

const file = (): MapFile =>
  ({
    name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
    layout: ["WWWWWWW", "W..D..W", "W.....W", "WWWWWWW"],
    props: [{ prop: "lever1", x: 1, y: 1, at: "N" }, { prop: "arrowslit1", x: 5, y: 2, at: "E" }, { prop: "crate1", x: 2, y: 2 }],
    decals: [{ decal: "button_red", x: 1, y: 2, surface: "W", px: 3, py: 4 }],
  }) as unknown as MapFile;
const lever = { from: "prop", index: 0 } as const;

// ---- cleaning a block: nothing set is nothing
assert.equal(cleanSpec({}), undefined);
assert.equal(cleanSpec({ targets: [], hold: undefined }), undefined);
assert.deepEqual(cleanSpec({ hold: false, delay: undefined }), { hold: false });

// ---- settings: set, change, drop
{
  const f = file();
  setOperable(f, lever, { mode: "momentary", delay: 4 });
  assert.deepEqual(f.props![0].operable, { mode: "momentary", delay: 4 });
  setOperable(f, lever, { delay: undefined });
  assert.deepEqual(f.props![0].operable, { mode: "momentary" });
  setOperable(f, lever, { mode: undefined });
  assert.equal("operable" in f.props![0], false, "an empty block is left out of the file");
  setOperable(f, lever, { mode: "toggle" });
  setOperable(f, lever, null);
  assert.equal("operable" in f.props![0], false);
  assert.equal(setOperable(f, { from: "prop", index: 9 }, { mode: "toggle" }), f, "no such entry: nothing happens");
  // a decal's too
  setOperable(f, { from: "decal", index: 0 }, { kind: "button", targets: [{ kind: "door", x: 3, y: 1 }] });
  assert.deepEqual(f.decals![0].operable, { kind: "button", targets: [{ kind: "door", x: 3, y: 1 }] });
}

// ---- targets: add (once), update, remove
{
  const f = file();
  addTarget(f, lever, { kind: "door", x: 3, y: 1 });
  addTarget(f, lever, { kind: "door", x: 3, y: 1 });
  addTarget(f, lever, { kind: "trap", x: 5, y: 2, side: "E" });
  addTarget(f, lever, { kind: "trap", x: 5, y: 2 });
  assert.deepEqual(f.props![0].operable?.targets, [{ kind: "door", x: 3, y: 1 }, { kind: "trap", x: 5, y: 2, side: "E" }, { kind: "trap", x: 5, y: 2 }]);
  updateTarget(f, lever, 0, { action: "toggle", force: true });
  assert.deepEqual(f.props![0].operable?.targets?.[0], { kind: "door", x: 3, y: 1, action: "toggle", force: true });
  updateTarget(f, lever, 0, { action: "open", force: false });
  assert.deepEqual(f.props![0].operable?.targets?.[0], { kind: "door", x: 3, y: 1 }, "the defaults are left out");
  removeTarget(f, lever, 1);
  assert.equal(f.props![0].operable?.targets?.length, 2);
  removeTarget(f, lever, 0);
  removeTarget(f, lever, 0);
  assert.equal("operable" in f.props![0], false, "the last one out takes the block with it");
  assert.equal(removeTarget(f, lever, 5), f);
  // the file stays what the map parser reads
  addTarget(f, lever, { kind: "door", x: 3, y: 1 });
}

// ---- what a click in link mode points at
{
  const rows = ["WWWWWWW", "W..D..W", "W.....W", "WWWWWWW"];
  const map: OperableMap = {
    width: 7, height: 4,
    cells: rows.map((r) => r.split("").map((c) => (c === "W" ? "wall" : c === "D" ? "door" : "floor") as "wall" | "door" | "floor")),
    props: [
      { prop: "lever1", cell: { x: 1, y: 1 }, at: "N" },
      { prop: "arrowslit1", cell: { x: 5, y: 2 }, at: "E" },
      { prop: "glyph1", cell: { x: 2, y: 2 }, at: "S" },
      { prop: "glyph1", cell: { x: 2, y: 2 }, at: "W" },
      { prop: "crate1", cell: { x: 4, y: 1 }, at: "center" },
    ],
  };
  assert.deepEqual(linkTargetFor(map, { door: { x: 3, y: 1 }, cell: { x: 3, y: 1 } }), { kind: "door", x: 3, y: 1 });
  assert.equal(linkTargetFor(map, { door: { x: 2, y: 1 }, cell: { x: 2, y: 1 } }), undefined, "a floor cell is no door");
  assert.deepEqual(linkTargetFor(map, { prop: 1, cell: { x: 5, y: 2 } }), { kind: "trap", x: 5, y: 2, side: "E" });
  assert.equal(linkTargetFor(map, { prop: 0, cell: { x: 1, y: 1 } }), undefined, "a lever is no target");
  assert.equal(linkTargetFor(map, { prop: 4, cell: { x: 4, y: 1 } }), undefined, "nor is a crate (even next to a door)");
  assert.deepEqual(linkTargetFor(map, { cell: { x: 3, y: 1 } }), { kind: "door", x: 3, y: 1 }, "a click on the door cell itself");
  assert.deepEqual(linkTargetFor(map, { cell: { x: 5, y: 2 } }), { kind: "trap", x: 5, y: 2, side: "E" }, "a click on the floor of a cell with one trap");
  assert.equal(linkTargetFor(map, { cell: { x: 2, y: 2 } }), undefined, "two traps in the cell: it has to be one of them pointed at");
  assert.equal(linkTargetFor(map, { cell: { x: 4, y: 2 } }), undefined);
}

// ---- the panel's info
assert.deepEqual(operableInfo({ prop: "lever1", at: "N" }), { kind: "lever", spec: {}, at: "N", rotation: 0 });
assert.deepEqual(operableInfo({ prop: "plate1", at: "center", rotation: 90, operable: { hold: false } }), { kind: "plate", spec: { hold: false }, at: "center", rotation: 90 });
assert.equal(operableInfo({ prop: "crate1", at: "center" }), undefined);

console.log("operableEdits: ok");
