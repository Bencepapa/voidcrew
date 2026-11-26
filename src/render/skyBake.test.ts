import assert from "node:assert/strict";
import { SKY_CEILING, type LightBakeMap, type Occluder } from "./bakeOcclusion";
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

const roof: Occluder = { minX: 1.5, maxX: 2.5, minZ: -0.5, maxZ: 0.5, minY: 1, maxY: 1.6, skyOnly: true };
const overhead = { ...roof, minY: 1.5, maxY: 2 };
const roofBoxes = [[], [], [roof]];
const roofProbes = [[2, 0.75], [2, 1.25], [2, 1.6], [5, 0.75], [5, 1]] as const;
for (const quick of [false, true]) {
  const faces = Array.from({ length: 3 }, () => new Float32Array(roofProbes.length * 3));
  const bake = createSkyBake(map, { width: map.width, cells: roofBoxes }, 1,
    { ...sky, elevation: 90, quick }, [1, 1, 1], faces, new Float32Array(roofProbes.length * 3), false);
  roofProbes.forEach(([x, y], n) => bake.sample(n, x, y, 0));
  bake.applySun();
  for (const face of faces.slice(0, 2)) {
    assert.equal(face[0], 0, "a probe below a wall top receives no sky light");
    assert.ok(face[3] > 0, "a probe inside a roof receives sky light from its surface");
    assert.equal(face[3], face[6], "a probe at the roof top gets the same light");
    assert.equal(face[9], 0, "a probe below a solid ceiling receives no sky light");
    assert.ok(face[12] > 0, "a probe on top of a solid ceiling receives sky light");
  }
}

const blockedFaces = Array.from({ length: 3 }, () => new Float32Array(3));
const blockedRoof = createSkyBake(map, { width: map.width, cells: [[], [], [roof, overhead]] }, 1,
  { ...sky, elevation: 90 }, [1, 1, 1], blockedFaces, new Float32Array(3), false);
blockedRoof.sample(0, 2, 1.25, 0);
blockedRoof.applySun();
assert.equal(blockedFaces[1][0], 0, "a separate overhead box still blocks the sun");
