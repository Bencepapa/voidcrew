import { createSkyRayTest, SKY_CEILING, type LightBakeMap, type Occluders } from "./bakeOcclusion";
import { QUICK_SKY_DOME_DIRECTIONS, SKY_DOME_DIRECTIONS, sampleSkyDome, sunDirection, type SkyLight } from "./skySampling";

export const AMBIENT_SHARE = 0.3;
export type { SkyLight } from "./skySampling";

export function createSkyBake(
  map: LightBakeMap,
  occluders: Occluders,
  wallHeight: number,
  sky: SkyLight,
  [r, g, b]: readonly [number, number, number],
  faces: Float32Array[],
  mainDir: Float32Array | null,
  bounce: boolean,
) {
  const clearSkyLine = createSkyRayTest(map, occluders);
  const [dx, dy, dz] = sunDirection(sky.azimuth, sky.elevation);
  const sunRay = [dx, dy / wallHeight, dz] as const;
  const domeDirections = sky.domeIntensity <= 0 ? [] : sky.quick ? QUICK_SKY_DOME_DIRECTIONS : SKY_DOME_DIRECTIONS;
  const domeRays = domeDirections.map(([x, y, z]) => [x, y / wallHeight, z] as const);
  const sunlight = mainDir && sky.intensity > 0 ? new Uint8Array(mainDir.length / 3) : undefined;
  const lum = sky.intensity * (0.3 * r + 0.59 * g + 0.11 * b);
  const incident = bounce ? new Float32Array(map.width * map.height) : undefined;
  const probes = bounce ? new Uint32Array(map.width * map.height) : undefined;

  function add(face: Float32Array, n: number, strength: number) {
    face[n * 3] += r * strength;
    face[n * 3 + 1] += g * strength;
    face[n * 3 + 2] += b * strength;
  }

  function sample(n: number, x: number, y: number, z: number) {
    const cell = Math.round(z) * map.width + Math.round(x);
    if (!((map.skySurfaces?.[cell] ?? 0) & SKY_CEILING)) return;
    const sun = sky.intensity > 0 && clearSkyLine(x, y, z, sunRay) ? sky.intensity : 0;
    if (sun > 0) {
      if (mainDir && sunlight) {
        sunlight[n] = 1;
        mainDir[n * 3] += lum * dx;
        mainDir[n * 3 + 1] += lum * dy;
        mainDir[n * 3 + 2] += lum * dz;
      } else {
        add(faces[0], n, sun * Math.max(0, dx));
        add(faces[1], n, sun * Math.max(0, -dx));
        add(faces[2], n, sun * dy);
        add(faces[4], n, sun * Math.max(0, dz));
        add(faces[5], n, sun * Math.max(0, -dz));
      }
    }

    let dome = 0;
    if (domeRays.length) {
      const visible = sampleSkyDome(domeDirections, (i) => clearSkyLine(x, y, z, domeRays[i]));
      const strength = sky.domeIntensity * visible.fraction;
      dome = strength * (0.5 + visible.y);
      if (mainDir) {
        // The directional grid stores diffuse ambient as RGB. Use the mean
        // elevation to weight it while keeping the sun in the direct lobe.
        add(faces[0], n, dome);
      } else {
        // A broad diffuse lobe around the mean visible direction.
        const { x, y, z } = visible;
        const directions = [x, -x, y, -y, z, -z];
        for (let a = 0; a < 6; a++) {
          add(faces[a], n, strength * (0.35 + 0.65 * Math.max(0, directions[a])));
        }
      }
    }
    if (incident && probes) {
      incident[cell] += sun * dy + dome;
      probes[cell]++;
    }
  }

  function applySun() {
    if (!mainDir || !sunlight) return;
    for (let n = 0; n < sunlight.length; n++) {
      if (!sunlight[n]) continue;
      const mx = mainDir[n * 3];
      const my = mainDir[n * 3 + 1];
      const mz = mainDir[n * 3 + 2];
      const alignment = (mx * dx + my * dy + mz * dz) / (Math.hypot(mx, my, mz) || 1);
      const weight = Math.max(0, Math.min(1, alignment));
      add(faces[0], n, sky.intensity * (1 - weight) * AMBIENT_SHARE);
      add(faces[1], n, sky.intensity * weight);
    }
  }

  function addBounce(cellLight: Float32Array, steps: number, falloff: number) {
    if (!incident || !probes) return;
    for (let cell = 0; cell < incident.length; cell++) {
      if (probes[cell]) incident[cell] /= probes[cell];
    }
    const bounced = spreadSkyBounce(incident, map.cells, map.width, steps, falloff);
    for (let cell = 0; cell < bounced.length; cell++) add(cellLight, cell, bounced[cell]);
  }

  return { sample, applySun, addBounce };
}

// Keep one attenuated contribution from the brightest nearby cell so many
// neighboring outdoor cells never stack their energy. No surface colors
// are fetched for bounce.
function spreadSkyBounce(
  incident: Float32Array, cells: LightBakeMap["cells"], width: number, steps: number, falloff: number,
) {
  let light = incident;
  let next = new Float32Array(light.length);
  for (let step = 0; step < steps; step++) {
    for (let z = 0; z < cells.length; z++) {
      for (let x = 0; x < width; x++) {
        if (cells[z][x] === "wall") continue;
        const c = z * width + x;
        const strongest = Math.max(
          x > 0 ? light[c - 1] : 0, x + 1 < width ? light[c + 1] : 0,
          light[c - width] ?? 0, light[c + width] ?? 0,
        );
        next[c] = Math.max(light[c], strongest * falloff);
      }
    }
    [light, next] = [next, light];
  }
  return light;
}
