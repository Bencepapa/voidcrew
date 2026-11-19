/*
 * Editor-only AI depth: runs Depth Anything V2 Small in a Web Worker (aiDepthWorker.ts, which loads Transformers.js lazily)
 * and turns the model's relative inverse depth (bright = near) into a depth map in our convention (bright = high; the
 * generated Auto depth is a luma height, so "near = high" matches and Invert is OFF by default).
 * Nothing here runs unless generateAiDepth() is called from a click; the game never imports this file.
 */
import type { AiDepthDevice, AiDepthWorkerReply, AiDepthWorkerRequest } from "./aiDepthWorker";

export interface AiDepthOptions {
  invert: boolean;
  /** 0..1: strength of a local-contrast (unsharp) step; 0 = the model output as it is. */
  detail: number;
  /** copy the diffuse alpha into the depth alpha (transparent pixels stay transparent) */
  keepAlpha: boolean;
  /** nearest instead of bilinear when scaling the result up (texture sets flagged pixelArt) */
  pixelArt: boolean;
}
export const defaultAiDepthOptions: AiDepthOptions = { invert: false, detail: 0.25, keepAlpha: true, pixelArt: false };

export type AiDepthProgress =
  | { stage: "start"; device?: undefined; fraction?: undefined }
  | { stage: "backend"; device: AiDepthDevice; fraction?: undefined }
  | { stage: "download"; fraction: number; device?: undefined }
  | { stage: "load" | "run" | "post"; fraction?: undefined; device?: undefined };

// the model resizes to about 518 px by itself; more than this only costs time and memory
export const AI_DEPTH_MAX_INPUT = 1024;
const CACHED_KEY = "voidcrew-ai-depth-cached";

export function isAiDepthCached(): boolean {
  try { return localStorage.getItem(CACHED_KEY) === "1"; } catch { return false; }
}
function markCached() { try { localStorage.setItem(CACHED_KEY, "1"); } catch { /* private mode: no flag */ } }

export class AiDepthAborted extends Error { constructor() { super("aborted"); this.name = "AbortError"; } }

// the diffuse scaled so its long side is at most `max` (smoothing on: it is only the model's input)
function scaledInput(image: ImageData, max: number): ImageData {
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
  const src = document.createElement("canvas");
  src.width = image.width; src.height = image.height;
  src.getContext("2d")!.putImageData(image, 0, 0);
  const dst = document.createElement("canvas");
  dst.width = w; dst.height = h;
  const ctx = dst.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function resizeGray(src: Uint8Array, sw: number, sh: number, w: number, h: number, nearest: boolean): Uint8Array {
  if (sw === w && sh === h) return src;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = nearest ? Math.min(sh - 1, Math.floor((y + 0.5) * sh / h)) : Math.max(0, Math.min(sh - 1, (y + 0.5) * sh / h - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      if (nearest) { out[y * w + x] = src[fy * sw + Math.min(sw - 1, Math.floor((x + 0.5) * sw / w))]; continue; }
      const fx = Math.max(0, Math.min(sw - 1, (x + 0.5) * sw / w - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * w + x] = a * (1 - ty) + b * ty + 0.5;
    }
  }
  return out;
}

// separable box blur (two passes ~ a soft blur), edges clamped
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / span;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / span;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// invert + detail (unsharp mask) + a stretch back to the full 0..255 range; alpha from the diffuse
function finish(gray: Uint8Array, w: number, h: number, diffuse: ImageData, o: AiDepthOptions): ImageData {
  const n = w * h;
  let v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = o.invert ? 255 - gray[i] : gray[i];
  const detail = Math.max(0, Math.min(1, o.detail));
  if (detail > 0) {
    const r = Math.max(2, Math.round(Math.max(w, h) / 100));
    const blur = boxBlur(boxBlur(v, w, h, r), w, h, r);
    const amount = detail * 2.5;
    const sharp = new Float32Array(n);
    for (let i = 0; i < n; i++) sharp[i] = v[i] + amount * (v[i] - blur[i]);
    v = sharp;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  const range = hi - lo || 1;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    data[j] = data[j + 1] = data[j + 2] = (v[i] - lo) * 255 / range + 0.5;
    data[j + 3] = o.keepAlpha ? diffuse.data[j + 3] : 255;
  }
  return new ImageData(data, w, h);
}

/**
 * Makes a depth map (RGBA grayscale, the diffuse's size) from the diffuse with the AI model.
 * Aborting the signal terminates the worker and rejects with AiDepthAborted.
 */
export function generateAiDepth(
  image: ImageData,
  options: AiDepthOptions,
  onProgress: (progress: AiDepthProgress) => void,
  signal?: AbortSignal,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new AiDepthAborted()); return; }
    let worker: Worker;
    try { worker = new Worker(new URL("./aiDepthWorker.ts", import.meta.url), { type: "module" }); }
    catch (error) { reject(error instanceof Error ? error : new Error(String(error))); return; }
    const end = () => { signal?.removeEventListener("abort", onAbort); worker.terminate(); };
    const onAbort = () => { end(); reject(new AiDepthAborted()); };
    signal?.addEventListener("abort", onAbort);
    onProgress({ stage: "start" });
    worker.onmessage = (event: MessageEvent<AiDepthWorkerReply>) => {
      const msg = event.data;
      if (msg.type === "backend") onProgress({ stage: "backend", device: msg.device });
      else if (msg.type === "download") onProgress({ stage: "download", fraction: msg.total > 0 ? Math.min(1, msg.loaded / msg.total) : 0 });
      else if (msg.type === "stage") onProgress({ stage: msg.stage });
      else if (msg.type === "error") { end(); reject(new Error(msg.message)); }
      else {
        end();
        markCached();
        try {
          onProgress({ stage: "post" });
          const gray = resizeGray(msg.depth, msg.width, msg.height, image.width, image.height, options.pixelArt);
          resolve(finish(gray, image.width, image.height, image, options));
        } catch (error) { reject(error instanceof Error ? error : new Error(String(error))); }
      }
    };
    worker.onerror = event => { end(); reject(new Error(event.message || "AI depth worker failed")); };
    const input = scaledInput(image, AI_DEPTH_MAX_INPUT);
    const rgba = new Uint8ClampedArray(input.data); // a copy: transferring would detach the caller's ImageData
    const request: AiDepthWorkerRequest = { rgba, width: input.width, height: input.height };
    worker.postMessage(request, [rgba.buffer as ArrayBuffer]);
  });
}
