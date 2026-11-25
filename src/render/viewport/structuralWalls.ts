import type { DoorType } from "../../game/doorTypes";
import type { ViewportSettings } from "./settings";
import * as THREE from "three";
import type { EdgeSegment } from "../reliefMesh";
import { buildCornerJoins, edgeModes, mergeCornerJoins, type JoinedStrips, type JoinPanel } from "../cornerJoins";
import { type PanelVariant, variantRows, variantHeight, createBandPlane, type WallSlot, type WallKit, LOD_FACTOR, SMOOTH_LODS, SMOOTH_LOD_MIN_CELLS, CORNER_JOINS, type FarLevel } from "./walls";
import type { ReliefStats } from "./contracts";
import type { createStructuralSurfaces } from "./structuralSurfaces";
import type { createReliefGeometry } from "./reliefGeometry";

interface StructuralWallsContext {
  settings: ViewportSettings;
  doorPreview: DoorType | undefined;
  disposed: boolean;
  group: THREE.Group;
  track: <T>(work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  wallHeight: number;
  primaryKit: WallKit;
  geometries: THREE.BufferGeometry[];
  wallGeo: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap> | null;
  reliefStats: ReliefStats | null;
  placeWalls: ReturnType<typeof createStructuralSurfaces>["placeWalls"];
  kits: WallKit[];
  buildRelief: ReturnType<typeof createReliefGeometry>["buildRelief"];
  farReliefLevels: ReturnType<typeof createReliefGeometry>["farReliefLevels"];
  culledCount: number;
}

export function createStructuralWalls(context: StructuralWallsContext) {
  const {
    settings, doorPreview,
    group, track, wallHeight, primaryKit, geometries, wallGeo, placeWalls, kits, buildRelief,
    farReliefLevels,
  } = context;

  // Wall panels' side edges: joined to their neighbors' (CORNER_JOINS) -
  // a stepped relief's profile a step every this many cells (its distant
  // version's grid is LOD_FACTOR times coarser, so both end on the same
  // line) - or eased flush the old way.
  const joinWalls =
    CORNER_JOINS && !(import.meta.env.DEV && (window as { __voidcrewNoJoins?: boolean }).__voidcrewNoJoins);
  const joinEdgeCells = (() => {
    if (settings.reliefMode !== "smooth") return LOD_FACTOR;
    const most = Math.max(1, Math.floor(settings.wallDetail / SMOOTH_LOD_MIN_CELLS));
    return SMOOTH_LODS.reduce((d, level) => Math.max(d, Math.min(level.divisor, most)), 1);
  })();
  // (`modes`: the corners its edges were picked to land on - see edgeModes)
  const wallShape = (height: number, rows: [number, number] | undefined, modes: [number, number] = [0, 0]) =>
    joinWalls
      ? { height, flushEdges: false, joinEdges: joinEdgeCells, rows, ...(modes[0] || modes[1] ? { edgeModes: modes } : {}) }
      : { height, flushEdges: true, rows };
  // each kit's panel edge profiles per variant, for the joins
  const wallEdges = new Map<WallKit, Map<PanelVariant, EdgeSegment[]>>();

  // a kit's wall panel geometry per variant (and corner modes), built once
  const wallGeometries = new Map<WallKit, Map<string, Promise<THREE.BufferGeometry | null>>>();
  function wallGeometry(kit: WallKit, variant: PanelVariant, modes: [number, number] = [0, 0]): Promise<THREE.BufferGeometry | null> {
    let byVariant = wallGeometries.get(kit);
    if (!byVariant) {
      byVariant = new Map();
      wallGeometries.set(kit, byVariant);
    }
    let geo = byVariant.get(`${variant}|${modes}`);
    if (!geo) {
      const rows = variantRows(variant);
      const height = variantHeight(variant) * wallHeight;
      if (wallGeo) {
        // flat/beveled walls: partial panels are flat bands
        const band = rows ? createBandPlane(height, rows) : wallGeo;
        if (rows) geometries.push(band);
        geo = Promise.resolve(band);
      } else {
        const keepEdge = (relief: Awaited<ReturnType<typeof buildRelief>>) => {
          if (relief?.edge) {
            if (!wallEdges.has(kit)) wallEdges.set(kit, new Map());
            wallEdges.get(kit)!.set(variant, relief.edge);
          }
          return relief;
        };
        if (!rows) {
          geo = buildRelief(kit, wallShape(height, undefined, modes)).then((relief) => {
            if (!keepEdge(relief)) return null;
            if (kit === primaryKit && !modes[0] && !modes[1]) {
              context.reliefStats = { trianglesPerWall: relief!.triangles, levelCount: relief!.levelCount, baked: relief!.baked };
            }
            return relief!.geometry;
          });
        } else {
          // after the whole panel, whose AO map the band borrows
          geo = wallGeometry(kit, "full")
            .then((full) => (full ? buildRelief(kit, wallShape(height, rows, modes)) : null))
            .then((relief) => keepEdge(relief)?.geometry ?? null);
        }
      }
      byVariant.set(`${variant}|${modes}`, geo);
    }
    return geo;
  }
  // ... and its distant, low-detail relief (none for flat walls)
  const farWallGeometries = new Map<WallKit, Map<string, Promise<FarLevel[]>>>();
  function farWallGeometry(kit: WallKit, variant: PanelVariant, modes: [number, number] = [0, 0]): Promise<FarLevel[]> {
    if (wallGeo) return Promise.resolve([]);
    let byVariant = farWallGeometries.get(kit);
    if (!byVariant) {
      byVariant = new Map();
      farWallGeometries.set(kit, byVariant);
    }
    let geo = byVariant.get(`${variant}|${modes}`);
    if (!geo) {
      const rows = variantRows(variant);
      const height = variantHeight(variant) * wallHeight;
      geo = farReliefLevels(kit, wallShape(height, rows, modes));
      byVariant.set(`${variant}|${modes}`, geo);
    }
    return geo;
  }

  const joinPanels: JoinPanel[] = [];
  const wallsPlaced: Promise<unknown>[] = [];
  const joinedStrips: JoinedStrips[] = [];
  // Every wall panel's corner modes, from where the panels stand alone (so
  // each corner's two faces are built to meet on their mitre)
  const panelModes = new Map<WallSlot, [number, number]>();
  if (joinWalls && !wallGeo) {
    const all = kits.flatMap((kit) => kit.slots);
    const modes = edgeModes(all.map((slot) => ({ ...slot, width: 1, height: variantHeight(slot.variant ?? "full") * wallHeight })));
    all.forEach((slot, i) => panelModes.set(slot, modes[i]));
  }
  for (const kit of kits) {
    const byForm = new Map<string, { variant: PanelVariant; modes: [number, number]; slots: WallSlot[] }>();
    for (const slot of kit.slots) {
      const variant = slot.variant ?? "full";
      const modes = panelModes.get(slot) ?? [0, 0];
      const key = `${variant}|${modes}`;
      if (!byForm.has(key)) byForm.set(key, { variant, modes, slots: [] });
      byForm.get(key)!.slots.push(slot);
    }
    for (const { variant, modes, slots } of byForm.values()) {
      const placed = track(
        Promise.all([wallGeometry(kit, variant, modes), wallGeometry(kit, variant, modes).then(() => farWallGeometry(kit, variant, modes))]),
      )
        .then(([geo, far]) => {
          if (!geo) return;
          placeWalls(geo, far, wallGeo ? kit.wallMat : [kit.wallMat, kit.sideMat], slots);
          const edge = wallEdges.get(kit)?.get(variant);
          if (!edge) return;
          for (const slot of slots) {
            joinPanels.push({
              x: slot.x,
              z: slot.z,
              y: slot.y,
              rotY: slot.rotY,
              width: 1,
              edge,
              modes,
              material: kit.wallMat,
            });
          }
        })
        .catch((err) => console.error("Wall build failed:", err));
      wallsPlaced.push(placed);
    }
  }
  // Once every wall panel is up: the strips joining their side edges
  // (cornerJoins.ts), one merged mesh per material. A meeting point's strip
  // is drawn while any of the (up to four) cells round it is in sight (see
  // applySight) - not with its panels' facing: it turns round a corner,
  // seen from either side.
  if (joinWalls && !wallGeo) {
    track(Promise.all(wallsPlaced))
      .then(() => {
        if (context.disposed) return;
        const joins = buildCornerJoins(joinPanels);
        let triangles = 0;
        for (const strips of mergeCornerJoins(joins)) {
          strips.mesh.userData.joinStrips = strips;
          joinedStrips.push(strips);
          geometries.push(strips.mesh.geometry);
          group.add(strips.mesh);
          triangles += strips.triangles;
        }
        // (drawn from the next sight pass on)
        context.culledCount = -1;
        if (import.meta.env.DEV && !doorPreview) Object.assign(window, { __voidcrewJoins: { points: joins.length, triangles } });
      })
      .catch((err) => console.error("Corner joins failed:", err));
  }

  return { joinEdgeCells, wallGeometry, joinedStrips };
}
