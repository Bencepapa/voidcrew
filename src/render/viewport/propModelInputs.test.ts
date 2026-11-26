import assert from "node:assert/strict";
import type { PropType } from "../../game/props";
import type { PropSpec } from "../../game/types";
import { propBuildKey, propSets } from "./propModelInputs";

const pillar: PropSpec = { prop: "pillar1", cell: { x: 0, y: 0 }, at: "center" };
const fence: PropSpec = { ...pillar, prop: "fence_edge" };
const map = {
  props: [pillar, fence],
  floorHeights: [[0]],
  ceilingHeights: [[2]],
  wallTextureAt: (x: number, y: number) => x === 1 && y === 0 ? "nearby" : undefined,
};
const inputs = {
  wallHeight: 3,
  primarySet: "deck",
  isTextureSetId: (id: string | undefined) => id === "nearby" || id === "painted",
  propTypes: { pillar1: { kind: "pillar", size: [0.26, 1, 0.26], shaft: 0.16, flare: 0.1 } satisfies PropType },
  propHeight: () => 2,
};

assert.equal(propBuildKey(map, pillar, 0, inputs), "pillar1||6|nearby");
assert.equal(propBuildKey(map, { ...pillar, texture: "painted" }, 0, inputs), "pillar1|painted|6|painted");
assert.equal(propBuildKey(map, { ...pillar, texture: "missing" }, 0, inputs), "pillar1|missing|6|deck");

const fenceKey = propBuildKey(map, fence, 1, inputs);
assert.match(fenceKey, /^fence\|/);
const paintedFence = { ...fence, texture: "painted" };
assert.notEqual(propBuildKey({ ...map, props: [pillar, paintedFence] }, paintedFence, 1, inputs), fenceKey);
assert.deepEqual(propSets({ kind: "box", size: [1, 1, 1], side: "side", top: "top" }, "deck"), ["side", "top"]);
