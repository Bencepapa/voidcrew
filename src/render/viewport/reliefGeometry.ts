import * as THREE from "three";
import { createReliefWallGeometry, downsampleHeightGrid, loadHeightGrid, type EdgeSegment } from "../reliefMesh";
import { textureTuning } from "../textureTuning";
import type { DecalLibrary } from "../decals";
import type { ViewportSettings } from "./settings";
import { type WallKit, kitMaterials, LOD_DISTANCE, LOD_FACTOR, SMOOTH_LODS, SMOOTH_LOD_MIN_CELLS, type FarLevel } from "./walls";
import type { SceneCache } from "./sceneCache";

interface ReliefGeometryContext {
  settings: ViewportSettings;
  settingsRef: { readonly current: ViewportSettings };
  disposed: boolean;
  tick: (name: string, since: number, end?: number) => void;
  cache: SceneCache;
  reliefDepth: number;
  decals: DecalLibrary;
}

export function createReliefGeometry(context: ReliefGeometryContext) {
  const { settings, settingsRef, tick, cache, reliefDepth, decals } = context;

  // a height map caught mid-save by an image editor (hot reload) or
  // fetched while the dev server restarts fails to decode - retry briefly
  const loadWithRetry = async (url: string, attempts: number): Promise<Awaited<ReturnType<typeof loadHeightGrid>>> => {
    try {
      return await loadHeightGrid(url);
    } catch (err) {
      if (attempts <= 1 || context.disposed) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return loadWithRetry(url, attempts - 1);
    }
  };

  // height maps by URL, each loaded once per scene
  const coarseGrids = new Map<string, Awaited<ReturnType<typeof loadWithRetry>>>();
  // what each detailed relief panel was built from - for the props' distant
  // versions (see addPropLods)
  const reliefSources = new WeakMap<THREE.BufferGeometry, { kit: WallKit; shape: Parameters<typeof buildRelief>[1] }>();

  // builds a kit's relief geometry from its depth map and hooks up its AO
  // (a partial panel - `rows` - shares the whole panel's); resolves to null
  // if the scene was torn down meanwhile
  async function buildRelief(
    kit: WallKit,
    shape: {
      width?: number;
      height: number;
      flushEdges: boolean;
      holeBackZ?: number;
      rows?: [number, number];
      cols?: [number, number];
      holeLevels?: number;
      // relief depth (default: the settings')
      depth?: number;
      // a low-detail version: from a grid this many times coarser (see
      // LOD_FACTOR), without its own AO map (the full panel's is used)
      coarse?: number;
      // a second version of a surface whose full one set the AO map
      lodOnly?: boolean;
      // a smooth relief's distant version: this many times fewer cells each
      // way (see SMOOTH_LODS) - the grid isn't made coarser for it then
      smoothLod?: number;
      // a cutout's hybrid build: smooth whatever
      // the wall relief mode, with the holes' quads left out
      hybrid?: boolean;
      smoothCells?: number;
      // the cell count is taken as it is (not capped by the wall detail): a door's own detail setting
      exactCells?: boolean;
      outwardRelief?: boolean;
      // side edges left for corner joins (ReliefOptions.joinEdges), and
      // the corners they land on (ReliefOptions.edgeModes)
      joinEdges?: number;
      floorEdges?: boolean;
      flushRows?: boolean;
      edgeModes?: [number, number];
    },
  ) {
    type Shape = typeof shape;
    // built once for the same depth map, shape and relief settings (see
    // SceneCache)
    const keyOf = (s: Shape) =>
      [
        kit.depthUrl,
        JSON.stringify(s),
        reliefDepth,
        textureTuning(kit.id)?.relief ?? 1,
        settings.reliefLevels,
        settings.reliefMinIsland,
        settings.reliefMode,
        kit.smooth ? "smooth" : "",
        settings.wallDetail,
      settings.doorDetail,
        settings.aoRadius,
      ].join("|");
    const cached = (shape: Shape): Promise<ReturnType<typeof createReliefWallGeometry> | null> => {
      const key = keyOf(shape);
      let built = cache.reliefs.get(key);
      if (built) return built;
      built = (async () => {
        let gridPromise = cache.grids.get(kit.depthUrl);
        if (!gridPromise) {
          gridPromise = loadWithRetry(kit.depthUrl, 4);
          cache.grids.set(kit.depthUrl, gridPromise);
        }
        const gridFrom = performance.now();
        let grid = await gridPromise;
        tick("height map load (wait)", gridFrom);
        // (a map with holes or cut-out levels is never built smooth - see
        // ReliefOptions.smooth - so its distant version gets the coarser grid)
        const smooth = shape.hybrid || ((kit.smooth || settings.reliefMode === "smooth") && !grid.solid && !shape.holeLevels);
        const smoothLod = smooth ? shape.smoothLod : undefined;
        let edgeProfile: EdgeSegment[] | undefined;
        if (shape.coarse && shape.coarse > 1 && !smoothLod) {
          const coarseKey = `${kit.depthUrl}|${shape.coarse}`;
          let coarse = coarseGrids.get(coarseKey);
          if (!coarse) {
            const coarseFrom = performance.now();
            coarse = downsampleHeightGrid(grid, shape.coarse);
            tick("coarse height grids", coarseFrom);
            coarseGrids.set(coarseKey, coarse);
          }
          grid = coarse;
          // a stepped distant version with joined edges ends on its
          // detailed version's edge profile (its own levels differ), so the
          // join strips fit both
          if (shape.joinEdges) {
            const detailed = { ...shape };
            delete detailed.coarse;
            delete detailed.lodOnly;
            delete detailed.smoothLod;
            edgeProfile = (await cached(detailed))?.edge;
          }
        }
        const reliefFrom = performance.now();
        const made = createReliefWallGeometry(grid, {
          wallWidth: shape.width ?? 1,
          wallHeight: shape.height,
          // (the texture's own relief tuning on top)
          depth: (shape.depth ?? reliefDepth) * (textureTuning(kit.id)?.relief ?? 1),
          levels: settings.reliefLevels,
          minIsland: settings.reliefMinIsland,
          smooth: shape.hybrid || kit.smooth || settings.reliefMode === "smooth",
          smoothHoles: shape.hybrid,
          smoothCells: shape.exactCells && shape.smoothCells ? shape.smoothCells : Math.min(settings.wallDetail, shape.smoothCells ?? (shape.hybrid && !grid.solid ? 32 : Infinity)),
          outwardRelief: shape.outwardRelief,
          smoothLod,
          aoRadius: settings.aoRadius,
          flushEdges: shape.flushEdges,
          holeBackZ: shape.holeBackZ,
          rows: shape.rows,
          cols: shape.cols,
          holeLevels: shape.holeLevels,
          joinEdges: shape.joinEdges,
          floorEdges: shape.floorEdges,
          flushRows: shape.flushRows,
          edgeModes: shape.edgeModes,
          edgeProfile,
        });
        tick(shape.lodOnly ? "relief geometry (far versions)" : "relief geometry", reliefFrom);
        // a partial panel or a far version uses its full panel's AO map (a part cut by columns too: its
        // second UV set runs over the whole panel - see reliefMesh)
        if (shape.rows || shape.cols || shape.lodOnly) made.aoMap.dispose();
        return made;
      })();
      cache.reliefs.set(key, built);
      built.catch(() => cache.reliefs.delete(key));
      return built;
    };
    const built = cached(shape);
    const relief = await built;
    if (context.disposed || !relief) return null;
    if (!shape.lodOnly) reliefSources.set(relief.geometry, { kit, shape });
    if (shape.rows || shape.cols || shape.lodOnly) return relief;
    for (const mat of kitMaterials(kit)) {
      mat.aoMap = relief.aoMap;
      mat.aoMapIntensity = settingsRef.current.aoIntensity;
      mat.needsUpdate = true;
    }
    return relief;
  }

  // how much farther than usual the distant versions take over (see
  // Graphics.lodScale; 0: never)
  const lodScale = settings.lodScale;
  // A surface's distant versions (after its full one, whose AO map they
  // use): a stepped relief's from a grid LOD_FACTOR times coarser, a
  // smooth one's with fewer cells (SMOOTH_LODS - no more levels than the
  // wall detail setting leaves room for above SMOOTH_LOD_MIN_CELLS).
  // Their distances are the graphics setting's lodScale times the usual
  // ones (0: no distant versions at all - nothing built for them either).
  async function farReliefLevels(kit: WallKit, shape: Parameters<typeof buildRelief>[1]): Promise<FarLevel[]> {
    if (!lodScale) return [];
    const levels: { distance: number; smoothLod?: number }[] = [];
    if (settings.reliefMode === "smooth") {
      const cells = Math.min(settings.wallDetail, shape.smoothCells ?? Infinity);
      const most = Math.max(1, Math.floor(cells / SMOOTH_LOD_MIN_CELLS));
      let last = 1;
      for (const { distance, divisor } of SMOOTH_LODS) {
        const d = Math.min(divisor, most);
        if (d > last) levels.push({ distance: distance * lodScale, smoothLod: d });
        last = Math.max(last, d);
      }
    } else {
      levels.push({ distance: LOD_DISTANCE * lodScale });
    }
    const out: FarLevel[] = [];
    let previous: THREE.BufferGeometry | null = null;
    for (const level of levels) {
      const relief = await buildRelief(kit, { ...shape, coarse: LOD_FACTOR, lodOnly: true, smoothLod: level.smoothLod });
      if (!relief) return [];
      // (a kit that can't be smooth gets the coarse grid at every level:
      // the same mesh - the first one does)
      if (previous && relief.triangles >= previous.index!.count / 3) continue;
      out.push({ geometry: relief.geometry, distance: level.distance });
      previous = relief.geometry;
      // decals painted on the detailed surface would sink into this one
      // where it bridges hollows: they're pulled over it from its distance
      decals.setFarPull([{ distance: level.distance, rise: relief.lodRise ?? 0 }]);
    }
    return out;
  }

  // A prop's relief faces get distant versions like the walls (a pillar or
  // a crate is as finely built as a wall, several faces of it): each face
  // becomes a level-of-detail set in the face's place, the same transform,
  // the same materials (cloned with the prop, see LOD.copy).
  async function addPropLods(root: THREE.Object3D) {
    const faces: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && reliefSources.has(mesh.geometry)) faces.push(mesh);
    });
    for (const mesh of faces) {
      const source = reliefSources.get(mesh.geometry)!;
      const far = await farReliefLevels(source.kit, source.shape);
      const parent = mesh.parent;
      if (!far.length || !parent) continue;
      const lod = new THREE.LOD();
      lod.position.copy(mesh.position);
      lod.quaternion.copy(mesh.quaternion);
      lod.scale.copy(mesh.scale);
      // (in the face's place among its siblings: a box's lid is its last)
      const index = parent.children.indexOf(mesh);
      parent.remove(mesh);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      lod.addLevel(mesh, 0);
      for (const level of far) lod.addLevel(new THREE.Mesh(level.geometry, mesh.material), level.distance);
      parent.add(lod);
      parent.children.splice(parent.children.length - 1, 1);
      parent.children.splice(index, 0, lod);
    }
  }

  return { buildRelief, lodScale, farReliefLevels, addPropLods, loadWithRetry };
}
