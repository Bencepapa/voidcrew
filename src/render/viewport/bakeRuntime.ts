import type { LightSpec } from "../../game/lights";
import { isSharedPropId, PROP_TYPES } from "../../game/props";
import type { GameMap } from "../../game/types";
import type { LightBakeRequest, LightBakeResult } from "../lightBake.worker";
import { bakeLightGrid, packLightGrid, setLightGrid, type LightGridUniforms } from "../lightGrid";
import { bakeInputs, shouldBakeQuickFirst } from "./bakeInputs";
import { EDIT_SETTLE_MS, LIGHT_EDIT_SETTLE_MS } from "./constants";
import { bakeCache } from "./sceneCache";
import type { ViewportSettings } from "./settings";

interface BakeRuntimeContext {
  map: GameMap;
  settingsRef: { readonly current: ViewportSettings };
  latestMapRef: { readonly current: GameMap };
  rebakeRef: { current: (() => void) | null };
  getLiveMap(): GameMap;
  getMapLights(): LightSpec[];
  lightGrid: LightGridUniforms;
  wallHeight: number;
  isDisposed(): boolean;
  tick(name: string, since: number, end?: number): void;
  track(work: Promise<void>): Promise<void>;
}

export function createBakeRuntime({
  map, settingsRef, latestMapRef, rebakeRef, getLiveMap, getMapLights, lightGrid, wallHeight, isDisposed, tick, track,
}: BakeRuntimeContext) {
  // the bake (and a coarser one for the ambient part, if the map asks)
  let cancelBake: (() => void) | undefined;
  const inputsFor = (m: GameMap, quick: boolean) =>
    bakeInputs(m, quick, getLiveMap() !== map, settingsRef.current, getMapLights(), wallHeight, PROP_TYPES, isSharedPropId);
  const bake = (m: GameMap, quick = false): Promise<void> => {
    cancelBake?.();
    const bakeFrom = performance.now();
    const { options, ambientDensity, lights, sharedPropTypes, cacheKey } = inputsFor(m, quick);
    const applyBake = ({ data, ambient, timing }: LightBakeResult) => {
      bakeCache.set(cacheKey, { data, ambient });
      const applyFrom = performance.now();
      if (timing) {
        const start = performance.timeOrigin + bakeFrom;
        tick("light worker startup and request", start, timing.receivedAt);
        tick("light grid computation", timing.receivedAt, timing.computedAt);
        tick("light grid packing", timing.computedAt, timing.packedAt);
        tick("light worker response", timing.packedAt, performance.timeOrigin + applyFrom);
      }
      setLightGrid(lightGrid, data, ambient);
      tick("light grid texture setup", applyFrom);
      tick("light bake", bakeFrom);
    };
    const fallback = () => applyBake({
      data: packLightGrid(bakeLightGrid({ ...m, sharedPropTypes }, lights, wallHeight, options)),
      ambient: ambientDensity === undefined ? undefined
        : packLightGrid(bakeLightGrid({ ...m, sharedPropTypes }, lights, wallHeight, { ...options, perCell: ambientDensity }), true),
    });
    // the same inputs as a bake before (a rebuild for a texture change, say): its result, at once
    const cached = bakeCache.get(cacheKey);
    if (cached) {
      applyBake(cached);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      let worker: Worker;
      const recover = () => {
        try {
          fallback();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      try {
        worker = new Worker(new URL("../lightBake.worker.ts", import.meta.url), { type: "module" });
      } catch {
        recover();
        return;
      }
      const finish = () => {
        worker.terminate();
        cancelBake = undefined;
      };
      cancelBake = () => {
        finish();
        resolve();
      };
      worker.onmessage = ({ data }: MessageEvent<LightBakeResult>) => {
        finish();
        try {
          applyBake(data);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish();
        recover();
      };
      const { width, height, cells, floorHeights, ceilingHeights, props, bridges } = m;
      const request: LightBakeRequest = {
        map: { width, height, cells, floorHeights, ceilingHeights, props, bridges, sharedPropTypes },
        lights, wallHeight, options, ambientDensity,
      };
      try {
        worker.postMessage(request);
      } catch {
        finish();
        recover();
      }
    }).catch((error) => console.error("Light bake failed:", error));
  };

  function start(settings: Pick<ViewportSettings, "lightGridQuickDensity">) {
    // The scene is ready after a rough bake (a few samples a cell, see lightGridQuickDensity) and the real one follows in
    // the background and replaces it: a big map no longer waits tens of seconds for its light. (Off, or no coarser than the
    // real density: the real bake only; a bake cached from before is used at once.)
    const quickFirst = shouldBakeQuickFirst(settings.lightGridQuickDensity, map, settingsRef.current);
    if (quickFirst && !bakeCache.get(inputsFor(map, false).cacheKey)) {
      // (only the rough one holds the scene back; the real one is not tracked)
      const rough = bake(map, true);
      track(rough);
      void rough.then(() => { if (!isDisposed()) void bake(map); });
    } else {
      track(bake(map));
    }
  }

  // Light edits have a shorter idle window than geometry and prop edits.
  // Either bake uses the latest map, including edits queued on the other timer.
  let bakeTimer: ReturnType<typeof setTimeout> | undefined;
  let lightEditTimer: ReturnType<typeof setTimeout> | undefined;
  const clearBakeTimers = () => {
    clearTimeout(bakeTimer);
    clearTimeout(lightEditTimer);
  };
  // After an edit: a rough bake first (a few samples per cell, on the worker like the real one), so the change shows
  // within moments, then the real one replaces it. A newer edit cancels whichever is running.
  let bakeRun = 0;
  const bakeLatest = () => {
    clearBakeTimers();
    if (isDisposed()) return;
    const run = ++bakeRun;
    const m = latestMapRef.current;
    const quickDensity = settingsRef.current.lightGridQuickDensity;
    const rough = shouldBakeQuickFirst(quickDensity, m, settingsRef.current) && getLiveMap() === map;
    if (!rough) {
      void bake(m);
      return;
    }
    void bake(m, true).then(() => {
      if (!isDisposed() && run === bakeRun) void bake(latestMapRef.current);
    });
  };
  const bakeSoon = () => {
    clearTimeout(bakeTimer);
    bakeTimer = setTimeout(bakeLatest, EDIT_SETTLE_MS);
  };
  const bakeAfterLightEdit = () => {
    // A dragged light or slider restarts its own idle window.
    clearTimeout(bakeTimer);
    clearTimeout(lightEditTimer);
    lightEditTimer = setTimeout(bakeLatest, LIGHT_EDIT_SETTLE_MS);
  };

  function bindRebake() {
    // baked again when its settings change (see the effect on them)
    rebakeRef.current = bakeLatest;
  }

  function dispose() {
    clearBakeTimers();
    cancelBake?.();
    rebakeRef.current = null;
  }

  return { start, bindRebake, bakeSoon, bakeAfterLightEdit, dispose };
}
