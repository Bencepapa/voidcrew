// Background loading of the latest shared content for
// the active world. It runs only after the first scene is ready, off the
// critical path (a delay, then an idle callback), with a timeout and at most
// one retry a minute. The Debug panel's switch turns it off.

import type { WorldId } from "../game/worlds";
import { autoLoadShared, subscribeAutoLoadShared } from "./autoSharedPrefs";
import { sharedConfigured, sharedProject } from "./sharedAuth";
import { applyCachedSharedMapHeads, refreshSharedMapHeads } from "./sharedMapHeads";
import { applyCachedSharedTextures, loadSharedTextures } from "./sharedTextures";
import { loadSharedImages } from "./sharedImages";

const IDLE_DELAY_MS = 1200;
const TIMEOUT_MS = 10_000;
const RETRY_MS = 60_000;

let world: WorldId | null = null;
let sceneReady = false;
let generation = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let stopWaiting: (() => void) | null = null;
let controller: AbortController | null = null;
let running = -1;
let retried = false;

const canRun = () => autoLoadShared() && sharedConfigured && sceneReady && world !== null;

function clearPending() {
  if (pending !== null) { clearTimeout(pending); pending = null; }
}

function clearRetry() {
  if (retry !== null) { clearTimeout(retry); retry = null; }
}

function stopVisibilityWait() {
  stopWaiting?.();
  stopWaiting = null;
}

// Stops everything in flight and forgets the retry budget (a new world, or
// the switch going off).
function invalidate() {
  generation++;
  clearPending();
  clearRetry();
  stopVisibilityWait();
  controller?.abort();
  controller = null;
  running = -1;
  retried = false;
}

function requestCount(): number {
  if (!sharedProject) return 0;
  try {
    return performance.getEntriesByType("resource").filter(entry => entry.name.startsWith(sharedProject)).length;
  } catch {
    return 0;
  }
}

function schedule(delay = IDLE_DELAY_MS) {
  if (!canRun()) return;
  clearPending();
  const forGeneration = generation;
  pending = setTimeout(() => {
    pending = null;
    if (forGeneration !== generation || !canRun()) return;
    const start = () => { if (forGeneration === generation) void execute(forGeneration); };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(start, { timeout: 2_000 });
    else start();
  }, delay);
}

async function execute(forGeneration: number) {
  if (forGeneration !== generation || !canRun() || !world) return;
  if (running === forGeneration) return;
  running = forGeneration;
  const activeWorld = world;
  const current = new AbortController();
  controller = current;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    current.abort();
  }, TIMEOUT_MS);
  const started = performance.now();
  const requestsBefore = requestCount();
  let loaded = false;
  try {
    // Stale-while-revalidate: the cached lists show at once, then the network refreshes them.
    applyCachedSharedTextures(activeWorld);
    applyCachedSharedMapHeads(activeWorld);
    await Promise.all([
      loadSharedTextures(activeWorld, { signal: current.signal }),
      refreshSharedMapHeads(activeWorld, { signal: current.signal }),
      loadSharedImages(activeWorld, { signal: current.signal }),
    ]);
    loaded = true;
    retried = false;
  } catch (error) {
    if (forGeneration === generation && autoLoadShared()) {
      if (timedOut) console.warn(`[shared] automatic load of ${activeWorld} timed out`);
      else if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("[shared] automatic load failed:", error);
      scheduleRetry(forGeneration);
    }
  } finally {
    clearTimeout(timeout);
    if (running === forGeneration) running = -1;
    if (controller === current) controller = null;
    if (loaded && import.meta.env.DEV) {
      const ms = Math.round(performance.now() - started);
      const requests = Math.max(0, requestCount() - requestsBefore);
      console.info(`[shared] automatic load of ${activeWorld}: ${ms} ms, ${requests} request${requests === 1 ? "" : "s"}`);
    }
  }
}

function waitForVisible(forGeneration: number) {
  stopVisibilityWait();
  const onChange = () => {
    if (forGeneration !== generation) { stopVisibilityWait(); return; }
    if (document.visibilityState !== "visible") return;
    stopVisibilityWait();
    schedule(0);
  };
  document.addEventListener("visibilitychange", onChange);
  stopWaiting = () => document.removeEventListener("visibilitychange", onChange);
}

function scheduleRetry(forGeneration: number) {
  if (forGeneration !== generation || retried || !canRun()) return;
  retried = true;
  retry = setTimeout(() => {
    retry = null;
    if (forGeneration !== generation || !canRun()) return;
    if (document.visibilityState === "hidden") waitForVisible(forGeneration);
    else schedule(0);
  }, RETRY_MS);
}

// The world the game is showing now (a change reloads that world's lists).
export function setAutoSharedWorld(next: WorldId) {
  if (world === next) return;
  world = next;
  invalidate();
  schedule();
}

// The first scene is up: nothing that follows can delay it.
export function autoSharedSceneReady() {
  if (sceneReady) return;
  sceneReady = true;
  schedule();
}

subscribeAutoLoadShared(() => {
  if (autoLoadShared()) schedule();
  else invalidate();
});
