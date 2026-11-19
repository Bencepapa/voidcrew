/*
 * Worker that runs the Depth Anything V2 Small model (Apache-2.0) through Transformers.js.
 * The library is imported dynamically, only when a run starts, so it is a separate chunk that the game never loads.
 * WebGPU (fp16) first; if it is missing or fails, WASM (q8, smaller and slower) is tried and the main thread is told.
 * The image never leaves the computer; only the model files are downloaded (and cached by the browser).
 */

export const AI_DEPTH_MODEL = "onnx-community/depth-anything-v2-small";

export interface AiDepthWorkerRequest { rgba: Uint8ClampedArray; width: number; height: number }
export type AiDepthDevice = "webgpu" | "wasm";
export type AiDepthWorkerReply =
  | { type: "backend"; device: AiDepthDevice }
  | { type: "download"; loaded: number; total: number }
  | { type: "stage"; stage: "load" | "run" }
  | { type: "done"; depth: Uint8Array; width: number; height: number; device: AiDepthDevice }
  | { type: "error"; message: string };

const post = (reply: AiDepthWorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);

interface ProgressInfo { status?: string; file?: string; loaded?: number; total?: number }

async function run(device: AiDepthDevice, req: AiDepthWorkerRequest) {
  const { pipeline, RawImage, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false; // never look for the model on our own server
  post({ type: "backend", device });
  // per-file byte counts -> one overall download figure
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: ProgressInfo) => {
    if (info.status === "progress" && info.file && info.total) {
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      post({ type: "download", loaded, total });
    }
  };
  post({ type: "stage", stage: "load" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estimator: any = await pipeline("depth-estimation", AI_DEPTH_MODEL, { device, dtype: device === "webgpu" ? "fp16" : "q8", progress_callback } as any);
  try {
    post({ type: "stage", stage: "run" });
    const n = req.width * req.height;
    const rgb = new Uint8ClampedArray(n * 3);
    for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { rgb[k] = req.rgba[j]; rgb[k + 1] = req.rgba[j + 1]; rgb[k + 2] = req.rgba[j + 2]; }
    const out = await estimator(new RawImage(rgb, req.width, req.height, 3));
    const img = out.depth as { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number };
    const gray = new Uint8Array(img.width * img.height);
    for (let i = 0; i < gray.length; i++) gray[i] = img.data[i * img.channels];
    post({ type: "done", depth: gray, width: img.width, height: img.height, device }, [gray.buffer]);
  } finally {
    try { await estimator.dispose?.(); } catch { /* the worker is terminated right after */ }
  }
}

self.onmessage = async (event: MessageEvent<AiDepthWorkerRequest>) => {
  const req = event.data;
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  try {
    if (hasGpu) {
      try { await run("webgpu", req); return; } catch { /* fall back to WASM below */ }
    }
    await run("wasm", req);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
