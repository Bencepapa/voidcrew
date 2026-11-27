import { bakeLightGrid, packLightGrid } from "./lightGrid";
import type { LightBakeRequest, LightBakeResult } from "./lightBake.worker";
import { packReflectionProbe } from "./reflectionProbe";

export function computeLightBake({ map, lights, wallHeight, options, ambientDensity, reflectionDensity }: LightBakeRequest): LightBakeResult {
  const now = () => performance.timeOrigin + performance.now();
  const receivedAt = now();
  const grid = bakeLightGrid(map, lights, wallHeight, options);
  const ambientGrid = ambientDensity === undefined ? undefined
    : bakeLightGrid(map, lights, wallHeight, { ...options, perCell: ambientDensity });
  const reflectionGrid = reflectionDensity === undefined ? undefined
    : bakeLightGrid(map, lights, wallHeight, { ...options, mode: "cube", perCell: reflectionDensity, bounce: 0 });
  const computedAt = now();
  const data = packLightGrid(grid);
  const ambient = ambientGrid && packLightGrid(ambientGrid, true);
  const reflection = reflectionGrid && packReflectionProbe(packLightGrid(reflectionGrid));
  return { data, ambient, reflection, timing: { receivedAt, computedAt, packedAt: now() } };
}
