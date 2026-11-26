import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { probeColor, probeDirectionOffset, probePosition, type ProbeGrid } from "./probeDebugData";
import { DEFAULT_SETTINGS } from "./settings";

const halfOne = 0x3c00;
const halfHalf = 0x3800;
const face = (r: number, g: number, b: number) =>
  new Uint16Array([0, 0, 0, halfOne, r, g, b, halfOne]);
const cube: ProbeGrid = {
  nx: 2, ny: 2, nz: 3,
  min: { x: -0.5, y: 2, z: -0.5 },
  size: { x: 1, y: 4, z: 1.5 },
  mode: "cube",
  faces: [face(halfOne, 0, 0), face(0, halfHalf, 0), face(0, 0, halfOne),
    face(halfOne, 0, 0), face(0, halfHalf, 0), face(0, 0, 0)],
};

strictEqual(DEFAULT_SETTINGS.showLightProbes, false);
deepStrictEqual(probePosition(cube, 0), { x: -0.25, y: 3, z: -0.25 });
deepStrictEqual(probePosition(cube, 7), { x: 0.25, y: 5, z: -0.25 });
deepStrictEqual(probePosition(cube, 10), { x: -0.25, y: 5, z: 0.75 });
deepStrictEqual(probeColor(cube, 1), { r: 1 / 3, g: 1 / 6, b: 1 / 6 });

const directional: ProbeGrid = {
  ...cube,
  mode: "directional",
  faces: [face(0x0001, halfOne, halfHalf), face(halfHalf, halfHalf, 0), face(0xb800, halfHalf, 0)],
};
deepStrictEqual(probeColor(directional, 1), { r: 0.5 + 2 ** -24, g: 1.5, b: 0.5 });
deepStrictEqual(probeDirectionOffset(directional, 0), { x: 0, y: 0, z: 0 });
const direction = probeDirectionOffset(directional, 1);
ok(direction.x < 0 && direction.y === -direction.x);
ok(Math.abs(Math.hypot(direction.x, direction.y) - 0.175) < 1e-10);
strictEqual(direction.z, 0);
