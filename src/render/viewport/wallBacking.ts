import * as THREE from "three";
import type { loadHeightGrid } from "../reliefMesh";
import { edgeModes } from "../cornerJoins";
import type { WallKit } from "./walls";
import { WINDOW_DEPTH } from "./constants";
import type { SceneCache } from "./sceneCache";

export interface BackingPanel {
  x: number;
  z: number;
  y: number;
  rotY: number;
  width: number;
  height: number;
  floorTop: boolean;
  deep?: boolean;
  kit: WallKit;
}

interface WallBackingContext {
  disposed: boolean;
  cache: SceneCache;
  group: THREE.Group;
  reliefDepth: number;
  floorDepth: number;
  backingPositions: number[];
  backingPanels: BackingPanel[];
  backingMat: THREE.MeshBasicMaterial;
  backingColor: () => THREE.Color;
  backingColors: number[];
  geometries: THREE.BufferGeometry[];
  backingObject: THREE.Object3D<THREE.Object3DEventMap> | null;
  loadWithRetry: (url: string, attempts: number) => Promise<Awaited<ReturnType<typeof loadHeightGrid>>>;
}

export function createWallBacking(context: WallBackingContext) {
  const {
    cache, group, reliefDepth, floorDepth, backingPositions, backingPanels, backingMat, backingColor,
    backingColors, geometries, loadWithRetry,
  } = context;

  // (the black backing itself is built once the height maps are loaded: see buildBacking below)
  const buildBacking = async () => {
    if (!backingPanels.length) return;
    // A wall texture with holes in it (an arch, a grate, a fence: transparent in its height map) gets no
    // backing - a black plane behind it would fill the holes in; what's behind shows through them instead.
    // (opaque ones keep theirs, against the slivers between their panels)
    const holes = new Map<WallKit, boolean>();
    for (const kit of new Set(backingPanels.map((p) => p.kit))) {
      let gridPromise = cache.grids.get(kit.depthUrl);
      if (!gridPromise) {
        gridPromise = loadWithRetry(kit.depthUrl, 4);
        cache.grids.set(kit.depthUrl, gridPromise);
      }
      // (a map that won't load: kept as opaque, the relief build reports it)
      holes.set(kit, await gridPromise.then((grid) => !!grid.solid, () => false));
    }
    if (context.disposed) return;
    const panels = backingPanels.filter((p) => !holes.get(p.kit));
    // Split at every change in wall height before finding corners. A tall
    // wall can have a straight neighbor below a step and a corner above it.
    // Insetting whole panels leaves holes at every straight seam.
    const backingCuts = [...new Set(panels.flatMap((p) => [p.y - p.height / 2, p.y + p.height / 2]))].sort((a, b) => a - b);
    const backingBands = panels.flatMap((panel) => {
      const bottom = panel.y - panel.height / 2;
      const top = panel.y + panel.height / 2;
      const cuts = backingCuts.filter((y) => y >= bottom - 1e-6 && y <= top + 1e-6);
      const color = backingColor();
      return cuts.slice(1).map((y, i) => ({ ...panel, y: (cuts[i] + y) / 2, height: y - cuts[i], bottom, top, color }));
    });
    const backingModes = edgeModes(backingBands);
    backingBands.forEach((panel, i) => {
      const back = panel.deep ? Math.max(reliefDepth, WINDOW_DEPTH) + 0.02 : reliefDepth + 0.02;
      const nx = Math.sin(panel.rotY), nz = Math.cos(panel.rotY);
      const tx = Math.cos(panel.rotY), tz = -Math.sin(panel.rotY);
      const cx = panel.x - nx * back, cz = panel.z - nz * back;
      const left = -panel.width / 2 + Math.max(0, backingModes[i][0]) * back;
      const right = panel.width / 2 - Math.max(0, backingModes[i][1]) * back;
      // Cover the recess of the lower floor instead of stopping above it.
      // A riser's top stays below the upper floor's deepest recess; an
      // ordinary wall still reaches its ceiling. Internal bands meet flush.
      const y0 = panel.y - panel.height / 2 - (Math.abs(panel.y - panel.height / 2 - panel.bottom) < 1e-6 ? floorDepth + 0.02 : 0);
      const y1 = Math.min(panel.y + panel.height / 2, panel.top - (panel.floorTop ? floorDepth + 0.02 : 0));
      if (right <= left || y1 <= y0) return;
      const lx = cx + tx * left, lz = cz + tz * left;
      const rx = cx + tx * right, rz = cz + tz * right;
      backingPositions.push(
        lx, y0, lz, rx, y0, rz, rx, y1, rz,
        lx, y0, lz, rx, y1, rz, lx, y1, lz,
      );
      const color = panel.color;
      for (let v = 0; v < 6; v++) backingColors.push(color.r, color.g, color.b);
    });
    if (backingPositions.length) {
      const backingGeo = new THREE.BufferGeometry();
      backingGeo.setAttribute("position", new THREE.Float32BufferAttribute(backingPositions, 3));
      backingGeo.setAttribute("color", new THREE.Float32BufferAttribute(backingColors, 3));
      geometries.push(backingGeo);
      context.backingObject = new THREE.Mesh(backingGeo, backingMat);
      group.add(context.backingObject);
    }
  };

  return { buildBacking };
}
