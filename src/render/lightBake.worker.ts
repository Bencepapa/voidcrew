import type { bakeLightGrid, packLightGrid, LightBakeMap } from "./lightGrid";
import { computeLightBake } from "./lightBakeJob";
import type { PackedReflectionProbe } from "./reflectionProbe";

export interface LightBakeRequest {
  map: LightBakeMap;
  lights: Parameters<typeof bakeLightGrid>[1];
  wallHeight: number;
  options: NonNullable<Parameters<typeof bakeLightGrid>[3]>;
  ambientDensity?: number;
  reflectionDensity?: number;
}

export interface LightBakeResult {
  data: ReturnType<typeof packLightGrid>;
  ambient?: ReturnType<typeof packLightGrid>;
  reflection?: PackedReflectionProbe;
  timing?: {
    receivedAt: number;
    computedAt: number;
    packedAt: number;
  };
}

self.onmessage = ({ data: request }: MessageEvent<LightBakeRequest>) => {
  const result = computeLightBake(request);
  const transfer = [...result.data.faces, ...(result.ambient?.faces ?? []), ...(result.reflection?.faces ?? [])]
    .map(face => face.buffer as ArrayBuffer);
  self.postMessage(result, { transfer });
};
