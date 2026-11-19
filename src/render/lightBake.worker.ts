import { bakeLightGrid, packLightGrid, type LightBakeMap } from "./lightGrid";

export interface LightBakeRequest {
  map: LightBakeMap;
  lights: Parameters<typeof bakeLightGrid>[1];
  wallHeight: number;
  options: NonNullable<Parameters<typeof bakeLightGrid>[3]>;
  ambientDensity?: number;
}

export interface LightBakeResult {
  data: ReturnType<typeof packLightGrid>;
  ambient?: ReturnType<typeof packLightGrid>;
  timing?: {
    receivedAt: number;
    computedAt: number;
    packedAt: number;
  };
}

self.onmessage = ({ data: { map, lights, wallHeight, options, ambientDensity } }: MessageEvent<LightBakeRequest>) => {
  const now = () => performance.timeOrigin + performance.now();
  const receivedAt = now();
  const grid = bakeLightGrid(map, lights, wallHeight, options);
  const ambientGrid = ambientDensity === undefined
    ? undefined
    : bakeLightGrid(map, lights, wallHeight, { ...options, perCell: ambientDensity });
  const computedAt = now();
  const data = packLightGrid(grid);
  const ambient = ambientGrid && packLightGrid(ambientGrid, true);
  const result: LightBakeResult = { data, ambient, timing: { receivedAt, computedAt, packedAt: now() } };
  const transfer = [...data.faces, ...(ambient?.faces ?? [])].map((face) => face.buffer as ArrayBuffer);
  self.postMessage(result, { transfer });
};
