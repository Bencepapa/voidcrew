/*
 * Main-thread wrapper around depthNormalWorker.ts. Keeps one module worker
 * alive, transfers the pixel buffers both ways, and falls back to running the
 * generator synchronously on the main thread when Workers are unavailable
 * (old browsers, bundled in a non-browser context, worker construction fails).
 */
import {
  generateMapsWithProgress,
  type DepthNormalMaps,
  type DepthNormalParams,
} from "./depthNormal";
import type { DepthNormalWorkerReply, DepthNormalWorkerRequest } from "./depthNormalWorker";

export interface PreviewSize {
  width: number;
  height: number;
  /** width / source width; scale pixel radii (oilRadius, blur, preBlur) with it for matching previews. */
  scale: number;
}

/** Size of a live preview: the image at most `max` px on its longest side. */
export function previewSize(width: number, height: number, max = 640): PreviewSize {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1, scale: 1 };
  const scale = Math.min(1, max / Math.max(width, height));
  const pw = Math.max(1, Math.round(width * scale));
  const ph = Math.max(1, Math.round(height * scale));
  return { width: pw, height: ph, scale: pw / width };
}

interface Pending {
  resolve: (maps: { depth: ImageData; normal: ImageData }) => void;
  reject: (err: Error) => void;
  onProgress?: (fraction: number) => void;
  width: number;
  height: number;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  return new ImageData(data, width, height);
}

function failAll(err: Error): void {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./depthNormalWorker.ts", import.meta.url), { type: "module" });
  } catch {
    workerUnavailable = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<DepthNormalWorkerReply>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(Math.min(1, Math.max(0, msg.progress)));
      return;
    }
    pending.delete(msg.id);
    if (msg.type === "error") {
      p.reject(new Error(msg.message));
      return;
    }
    try {
      p.resolve({
        depth: makeImageData(msg.depth, p.width, p.height),
        normal: makeImageData(msg.normal, p.width, p.height),
      });
    } catch (err) {
      p.reject(err instanceof Error ? err : new Error(String(err)));
    }
  };
  worker.onerror = (event: ErrorEvent) => {
    workerUnavailable = true;
    worker?.terminate();
    worker = null;
    failAll(new Error(event.message || "Depth/normal worker failed"));
  };
  return worker;
}

function runLocal(
  image: ImageData,
  params: Partial<DepthNormalParams> | undefined,
  onProgress?: (fraction: number) => void,
): { depth: ImageData; normal: ImageData } {
  const maps: DepthNormalMaps = generateMapsWithProgress(
    image.data,
    image.width,
    image.height,
    params,
    onProgress,
  );
  return {
    depth: makeImageData(maps.depth, image.width, image.height),
    normal: makeImageData(maps.normal, image.width, image.height),
  };
}

/**
 * Generate the depth and normal map off the main thread. Resolves to ImageData
 * for both, alpha copied from the diffuse. Falls back to the main thread if
 * Workers cannot be created.
 */
export function generateMapsAsync(
  image: ImageData,
  params?: Partial<DepthNormalParams>,
  onProgress?: (fraction: number) => void,
): Promise<{ depth: ImageData; normal: ImageData }> {
  onProgress?.(0);
  const w = getWorker();
  if (!w) {
    return Promise.resolve().then(() => runLocal(image, params, onProgress));
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress, width: image.width, height: image.height });
    // copy: transferring would detach the caller's ImageData
    const rgba = new Uint8ClampedArray(image.data);
    const request: DepthNormalWorkerRequest = {
      id,
      rgba,
      width: image.width,
      height: image.height,
      params,
    };
    try {
      w.postMessage(request, [rgba.buffer as ArrayBuffer]);
    } catch (err) {
      pending.delete(id);
      workerUnavailable = true;
      worker?.terminate();
      worker = null;
      try {
        resolve(runLocal(image, params, onProgress));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  });
}
