import type { ViewportSettings } from "./settings";
import * as THREE from "three";
import type { DoorSpec } from "../../game/types";
import { doorLeafMotion, type DoorType } from "../../game/doorTypes";
import type { TextureSetId } from "../textureSets";
import { type WallKit, LOD_DISTANCE, LOD_FACTOR } from "./walls";
import { FACING_ROTATION, DOOR_FRAME_HALF_DEPTH, DOOR_PANEL_HALF_DEPTH, DOOR_PANEL_OVERLAP } from "./constants";
import type { createReliefGeometry } from "./reliefGeometry";

export interface DoorCell {
  x: number;
  z: number;
  spec: DoorSpec;
  key: string;
  frameKit: WallKit;
  leafKit: WallKit;
  motion: Pick<DoorType, "motion" | "hinge" | "swingTo" | "angle">;
}

interface StructuralDoorsContext {
  settings: ViewportSettings;
  doorPanelsRef: { readonly current: Map<string, THREE.Object3D> };
  openDoorsRef: { readonly current: ReadonlySet<string> };
  disposed: boolean;
  group: THREE.Group;
  track: <T>(work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  wallHeight: number;
  reliefDepth: number;
  frameKits: Map<TextureSetId, WallKit>;
  panelKits: Map<TextureSetId, WallKit>;
  doorCells: DoorCell[];
  floorY: (x: number, y: number) => number;
  buildRelief: ReturnType<typeof createReliefGeometry>["buildRelief"];
  lodScale: number;
  labeledPanelMaterial: (spec: DoorSpec, kit: WallKit) => Promise<THREE.MeshStandardMaterial>;
  doorGroups: Map<string, THREE.Object3D<THREE.Object3DEventMap>>;
}

export function createStructuralDoors(context: StructuralDoorsContext) {
  const {
    settings,
    doorPanelsRef, openDoorsRef, group, track, wallHeight, reliefDepth, frameKits, panelKits, doorCells,
    floorY, buildRelief, lodScale, labeledPanelMaterial,
  } = context;

  // Doors are always relief (a frame needs its cut-out opening), whatever
  // the wall type. The frame is built first: the panel is sized to fit its
  // opening.
  // A frame (and often a panel) has holes, so it's built stepped from the
  // full height grid whatever the smooth wall detail - a door cost as much
  // as several walls at any graphics setting. Its grid is made coarser
  // with the setting instead (none at the highest: 64 cells), and it gets
  // a distant version like the walls (a grid LOD_FACTOR times coarser
  // still) - the opening stays crisp: a coarser cell is a hole when most
  // of it is. (64: the highest wall detail setting)
  const doorCoarse = Math.max(1, Math.round(64 / (settings.doorDetail > 0 ? settings.doorDetail : settings.wallDetail)));
  const doorFarCoarse = doorCoarse * LOD_FACTOR;
  // a door part: its mesh, or the near/far pair when it has a far version
  const doorPart = (geo: THREE.BufferGeometry, far: THREE.BufferGeometry | null, mat: THREE.Material[]) => {
    const mesh = new THREE.Mesh(geo, mat);
    if (!far) return mesh;
    const lod = new THREE.LOD();
    lod.addLevel(mesh, 0);
    lod.addLevel(new THREE.Mesh(far, mat), LOD_DISTANCE * lodScale);
    return lod;
  };
  // The hybrid experiment (the map's relief mode: smooth): doors and frames as
  // smooth meshes with the holes' quads left out and the pixel edge cut by
  // the diffuse's alpha - the same mesh builder for near and far, the far
  // one with fewer cells (never below 8).
  const hybrid = settings.reliefMode === "smooth";
  const hybridFarLod = Math.max(1, Math.min(LOD_FACTOR, Math.floor(settings.wallDetail / 8)));
  // (the door kits are the doors' own: no wall shares their materials)
  const cutout = (mat: THREE.Material) => {
    mat.alphaTest = 0.5;
    mat.needsUpdate = true;
  };
  // Prop and item kits are separate from the walls. A smooth cutout
  // keeps the original silhouette, even on a small relief grid.
  function buildPropRelief(kit: WallKit, shape: Parameters<typeof buildRelief>[1], cells = 32) {
    if (!hybrid) return buildRelief(kit, shape);
    if (!kit.wallMat.alphaTest) cutout(kit.wallMat);
    return buildRelief(kit, { ...shape, coarse: undefined, hybrid: true, smoothCells: cells });
  }
  if (hybrid) {
    for (const kit of frameKits.values()) cutout(kit.wallMat);
    for (const kit of panelKits.values()) cutout(kit.wallMat);
  }
  // a door part's relief shape: stepped (a grid made coarser with the graphics
  // setting, and a still coarser one far) or hybrid
  const doorShape = <S extends object>(shape: S, far: boolean) =>
    hybrid
      ? { ...shape, hybrid: true, ...(settings.doorDetail > 0 ? { smoothCells: settings.doorDetail, exactCells: true } : {}), ...(far ? { lodOnly: true, smoothLod: hybridFarLod } : {}) }
      : { ...shape, coarse: far ? doorFarCoarse : doorCoarse, ...(far ? { lodOnly: true } : {}) };
  if (doorCells.length) {
    track(async () => {
      const frameShape = {
        height: wallHeight,
        flushEdges: false,
        // the opening's jambs reach back to the center plane, where they
        // meet the other half's
        holeBackZ: -DOOR_FRAME_HALF_DEPTH,
      };
      const withFar = lodScale && !(hybrid && hybridFarLod <= 1);
      const frames = new Map<WallKit, {
        near: THREE.BufferGeometry; far: THREE.BufferGeometry | null;
        width: number; height: number; centerX: number;
      }>();
      for (const kit of frameKits.values()) {
        const frame = await buildRelief(kit, doorShape(frameShape, false));
        if (!frame || context.disposed) continue;
        const far = withFar ? await buildRelief(kit, doorShape(frameShape, true)) : null;
        const hole = frame.holeBounds ?? { minX: -0.35, maxX: 0.35, maxY: wallHeight * 0.3 };
        frames.set(kit, {
          near: frame.geometry, far: far?.geometry ?? null,
          width: hole.maxX - hole.minX + 2 * DOOR_PANEL_OVERLAP,
          height: wallHeight / 2 + hole.maxY + DOOR_PANEL_OVERLAP,
          centerX: (hole.minX + hole.maxX) / 2,
        });
      }
      // Keep the leaf clear of the floor relief when shut.
      const panelLift = reliefDepth / 2 + 0.005;
      const panelGeos = new Map<WallKit, Map<WallKit, { near: THREE.BufferGeometry; far: THREE.BufferGeometry | null }>>();

      for (const cell of doorCells) {
        if (context.disposed) return;
        const { spec, frameKit, leafKit } = cell;
        const frame = frames.get(frameKit);
        if (!frame) continue;
        let leaves = panelGeos.get(frameKit);
        if (!leaves) panelGeos.set(frameKit, leaves = new Map());
        let leaf = leaves.get(leafKit);
        if (!leaf) {
          const shape = { width: frame.width, height: Math.max(0.01, frame.height - panelLift), flushEdges: false };
          const near = await buildRelief(leafKit, doorShape(shape, false));
          if (!near || context.disposed) continue;
          const far = withFar ? await buildRelief(leafKit, doorShape(shape, true)) : null;
          leaf = { near: near.geometry, far: far?.geometry ?? null };
          leaves.set(leafKit, leaf);
        }
        if (context.disposed) return;
        const front = spec.label || spec.kind === "lift" ? await labeledPanelMaterial(spec, leafKit) : leafKit.wallMat;
        if (context.disposed) return;
        const door = new THREE.Group();
        door.position.set(cell.x, floorY(cell.x, cell.z), cell.z);
        // local +Z = the side the door faces; moved that way to where it
        // stands in its cell (see DoorSpec.offset)
        door.rotation.y = FACING_ROTATION[spec.facing];
        door.translateZ(spec.offset ?? 0);
        // the map editor picks it by this
        door.userData.doorCell = { x: cell.x, y: cell.z };
        context.doorGroups.set(cell.key, door);

        // two halves back to back, each facing out of one side
        for (const side of [1, -1]) {
          const frameHalf = doorPart(frame.near, frame.far, [frameKit.wallMat, frameKit.sideMat]);
          frameHalf.position.set(0, wallHeight / 2, side * DOOR_FRAME_HALF_DEPTH);
          frameHalf.rotation.y = side === 1 ? 0 : Math.PI;
          door.add(frameHalf);
        }

        const motion = doorLeafMotion(cell.motion, frame.width, frame.height, frame.centerX);
        const slider = new THREE.Group();
        for (const side of [1, -1]) {
          const panelHalf = doorPart(leaf.near, leaf.far, [front, leafKit.sideMat]);
          panelHalf.position.set(frame.centerX - motion.closedX, (frame.height + panelLift) / 2, side * DOOR_PANEL_HALF_DEPTH);
          panelHalf.rotation.y = side === 1 ? 0 : Math.PI;
          slider.add(panelHalf);
        }
        const closedPos = new THREE.Vector3(motion.closedX, 0, 0);
        const openPos = new THREE.Vector3(motion.openX, motion.openY, 0);
        const open = openDoorsRef.current.has(cell.key);
        slider.position.copy(open ? openPos : closedPos);
        slider.rotation.y = open ? motion.openYaw : 0;
        slider.userData = { open, openPos, closedPos, openYaw: motion.openYaw };
        door.add(slider);

        group.add(door);
        doorPanelsRef.current.set(cell.key, slider);
      }
    }).catch((err) => console.error("Door build failed:", err));
  }

  return { hybrid, buildPropRelief };
}
