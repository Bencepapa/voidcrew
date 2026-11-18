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
}

self.onmessage = ({ data: { map, lights, wallHeight, options, ambientDensity } }: MessageEvent<LightBakeRequest>) => {
  const data = packLightGrid(bakeLightGrid(map, lights, wallHeight, options));
  const ambient = ambientDensity === undefined
    ? undefined
    : packLightGrid(bakeLightGrid(map, lights, wallHeight, { ...options, perCell: ambientDensity }), true);
  const result: LightBakeResult = { data, ambient };
  const transfer = [...data.faces, ...(ambient?.faces ?? [])].map((face) => face.buffer as ArrayBuffer);
  self.postMessage(result, { transfer });
};
