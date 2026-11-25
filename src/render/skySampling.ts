export type SkyDirection = readonly [x: number, y: number, z: number];

export interface SkyLight {
  color: number;
  intensity: number;
  domeIntensity: number;
  azimuth: number;
  elevation: number;
  quick?: boolean;
}

export function sunDirection(azimuth: number, elevation: number): SkyDirection {
  const az = azimuth * Math.PI / 180;
  const el = Math.max(0, Math.min(90, elevation)) * Math.PI / 180;
  const horizontal = elevation >= 90 ? 0 : Math.cos(el);
  return [Math.sin(az) * horizontal, Math.sin(el), -Math.cos(az) * horizontal];
}

// Equal solid-angle bands. Stagger the rings and balance each one around
// the zenith so a fully open sky has no preferred compass direction.
function hemisphere(perRing: number): SkyDirection[] {
  return [0.25, 0.75].flatMap((y, ring) => Array.from({ length: perRing }, (_, i) => {
    const az = (i + ring * 0.5) * 2 * Math.PI / perRing;
    const horizontal = Math.sqrt(1 - y * y);
    return [Math.sin(az) * horizontal, y, -Math.cos(az) * horizontal] as const;
  }));
}

export const SKY_DOME_DIRECTIONS = hemisphere(6);
export const QUICK_SKY_DOME_DIRECTIONS = hemisphere(4);

// The vector's length retains how concentrated the visible directions are.
// Its components are the mean over the visible rays, or zero in full cover.
export function sampleSkyDome(directions: readonly SkyDirection[], clear: (index: number) => boolean) {
  let count = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < directions.length; i++) {
    if (!clear(i)) continue;
    const direction = directions[i];
    count++;
    x += direction[0];
    y += direction[1];
    z += direction[2];
  }
  const scale = count ? 1 / count : 0;
  return { fraction: count / directions.length, x: x * scale, y: y * scale, z: z * scale };
}
