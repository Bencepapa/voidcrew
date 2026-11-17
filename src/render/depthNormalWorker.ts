/*
 * Web Worker entry for the depth/normal generator. Vite loads it with
 *   new Worker(new URL("./depthNormalWorker.ts", import.meta.url), { type: "module" })
 * (see depthNormalAsync.ts). Request/response types are mirrored there; keep
 * them in sync.
 */
import { generateMapsWithProgress, type DepthNormalParams } from "./depthNormal";

export interface DepthNormalWorkerRequest {
  id: number;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  params?: Partial<DepthNormalParams>;
}

export type DepthNormalWorkerReply =
  | { id: number; type: "progress"; progress: number }
  | { id: number; type: "result"; depth: Uint8ClampedArray; normal: Uint8ClampedArray }
  | { id: number; type: "error"; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DepthNormalWorkerRequest>) => void) | null;
  postMessage: (message: DepthNormalWorkerReply, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const { id, rgba, width, height, params } = event.data;
  try {
    const result = generateMapsWithProgress(rgba, width, height, params, (progress) => {
      scope.postMessage({ id, type: "progress", progress });
    });
    scope.postMessage(
      { id, type: "result", depth: result.depth, normal: result.normal },
      [result.depth.buffer as ArrayBuffer, result.normal.buffer as ArrayBuffer],
    );
  } catch (err) {
    scope.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
