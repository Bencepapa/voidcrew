import assert from "node:assert/strict";
import { SKY_CEILING, type LightBakeMap } from "./bakeOcclusion";
import { createSkyBake, type SkyLight } from "./skyBake";

const map: LightBakeMap = {
  width: 6,
  height: 1,
  cells: [["floor", "floor", "wall", "floor", "floor", "floor"]],
  floorHeights: [[0, 0, 0, 0, 0, 0]],
  ceilingHeights: [[1, 1, 1, 1, 1, 1]],
  skySurfaces: Uint8Array.of(SKY_CEILING, SKY_CEILING, 0, SKY_CEILING, SKY_CEILING, 0),
};
const sky: SkyLight = { color: 0xffffff, intensity: 1, domeIntensity: 0.45, azimuth: 90, elevation: 25 };
const probes = [[1, 0.25], [0, 0.5], [0, 0.75], [5, 0.25]] as const;
const target = (directional: boolean, overrides: Partial<SkyLight> = {}) => {
  const faces = Array.from({ length: directional ? 3 : 6 }, () => new Float32Array(probes.length * 3));
  const mainDir = directional ? new Float32Array(probes.length * 3) : null;
  const bake = createSkyBake(map, { width: map.width, cells: [] }, 1, { ...sky, ...overrides }, [1, 0.5, 0.25], faces, mainDir, true);
  probes.forEach(([x, y], n) => bake.sample(n, x, y, 0));
  bake.applySun();
  const bounce = new Float32Array(map.width * 3);
  bake.addBounce(bounce, 6, 0.55);
  return { faces, mainDir, bounce };
};

const directional = target(true);
const [ambient, sun] = directional.faces;
assert.equal(sun[0], 0, "the wall shadows the first probe");
assert.ok(ambient[0] > 0 && ambient[0] < ambient[6], "the shadow sees a fraction of the dome");
assert.equal(sun[3], sun[6], "parallel sunlight has no distance falloff");
assert.deepEqual(directional.mainDir?.slice(3, 6), directional.mainDir?.slice(6, 9));
assert.equal(ambient[9], 0, "a solid ceiling receives no direct dome light");
assert.equal(sun[9], 0, "a solid ceiling receives no direct sun");
assert.ok(directional.bounce[0] > 0);
assert.equal(directional.bounce[1], directional.bounce[0] * 0.5, "bounce retains the light color");
assert.equal(directional.bounce[2 * 3], 0, "bounce stops at the wall");
assert.equal(directional.bounce[5 * 3], 0, "bounce cannot cross a wall to reach the covered cell");

const domeOnly = target(true, { intensity: 0 });
assert.ok(domeOnly.faces[0][0] > 0);
assert.ok(domeOnly.faces[1].every((value) => value === 0));
assert.ok(target(true, { domeIntensity: 0 }).faces[0][0] === 0);
const cube = target(false);
assert.ok(cube.faces[2][0] > cube.faces[3][0], "the dome brightens upward-facing surfaces");
assert.ok(cube.faces[0][3] > cube.faces[1][3], "sun from the east brightens east-facing surfaces");
