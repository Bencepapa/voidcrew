import { ceilingHeight, cellAt } from "../../game/map";
import { cellKey, visibleCells } from "../../game/visibility";
import { CULL_MAX_SIZE } from "./constants";
import { type JoinedStrips } from "../cornerJoins";
import { publishSight } from "../sightStore";
import { SIGHT_POINTS } from "./lighting";
import * as THREE from "three";
import type { RefObject } from "react";
import type { GameMap, Vec2 } from "../../game/types";
import type { DecalLibrary } from "../decals";

export interface TopdownState {
  on: boolean;
  x: number;
  z: number;
  h: number;
  tilt: number;
  yaw: number;
  fresh: boolean;
}

interface SightViewDeps {
  getLiveMap: () => GameMap;
  camera: THREE.PerspectiveCamera;
  decals: DecalLibrary;
  facingSurfaces: THREE.Object3D[];
  floorDepth: number;
  group: THREE.Group;
  joinedStrips: JoinedStrips[];
  onTopdownExitRef: RefObject<((cell: Vec2) => void) | undefined>;
  openDoorsRef: RefObject<ReadonlySet<string>>;
  reliefDepth: number;
  scene: THREE.Scene;
  setTopdownOn: (on: boolean) => void;
  topdown: TopdownState;
  topdownToggleRef: RefObject<((on?: boolean) => void) | null>;
  wallHeight: number;
}

export function createSightView(deps: SightViewDeps) {
  const { getLiveMap, camera, decals, facingSurfaces, floorDepth, group, joinedStrips, onTopdownExitRef,
    openDoorsRef, reliefDepth, scene, setTopdownOn, topdown, topdownToggleRef, wallHeight } = deps;
  // The cells seen from the party's cell (see visibility.ts) - from its
  // center and near its corners, so moving about in it (free movement)
  // shows nothing new. Redone when the party changes cell or a door opens
  // or shuts; picks the lights (updateLightPool) and what gets drawn
  // (applySight).
  // the top-down camera (see TOPDOWN_*): what it looks at (x, z), its height
  // above the floor, its tilt (90 degrees: straight down) and heading
  let topCaps: THREE.Group | null = null;
  // the walls seen from above: a dark, see-through cap on each wall cell (the walls
  // are only faces, so they'd be nothing from up here)
  const capMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const capGeometry = new THREE.PlaneGeometry(1, 1);
  function buildCaps() {
    const liveMap = getLiveMap();
    if (topCaps) {
      scene.remove(topCaps);
      topCaps = null;
    }
    const caps = new THREE.Group();
    for (let y = 0; y < liveMap.height; y++) {
      for (let x = 0; x < liveMap.width; x++) {
        if (cellAt(liveMap, x, y) !== "wall") continue;
        let top = 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (cellAt(liveMap, x + dx, y + dy) !== "wall") top = Math.max(top, ceilingHeight(liveMap, x + dx, y + dy));
        }
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.rotation.x = -Math.PI / 2;
        cap.position.set(x, top * wallHeight + 0.01, y);
        caps.add(cap);
      }
    }
    topCaps = caps;
    scene.add(caps);
  }
  function setTopdown(on: boolean) {
    if (on === topdown.on) return;
    topdown.on = on;
    if (on) {
      topdown.fresh = true;
      buildCaps();
    } else {
      if (topCaps) {
        scene.remove(topCaps);
        topCaps = null;
      }
      onTopdownExitRef.current?.({ x: Math.round(topdown.x), y: Math.round(topdown.z) });
    }
    for (const obj of group.children) if (obj.userData.skyCeiling) obj.traverse((o) => o.layers.set(on ? 1 : 0));
    // (every surface is judged again: all in sight up here, back to the party's own sight down there)
    invalidateSight();
    setTopdownOn(on);
  }
  const toggle = (on?: boolean) => setTopdown(on ?? !topdown.on);
  topdownToggleRef.current = toggle;
  // (a rebuild while the view is up: its caps and open skies again)
  if (topdown.on) {
    topdown.fresh = false;
    buildCaps();
    for (const obj of group.children) if (obj.userData.skyCeiling) obj.traverse((o) => o.layers.set(1));
  }
  let sight = { key: "", cells: new Set<string>() };
  function updateSight(party: { x: number; z: number }, range: number) {
    const liveMap = getLiveMap();
    if (topdown.on) {
      if (sight.key === "topdown") return false;
      const all = new Set<string>();
      for (let y = 0; y < liveMap.height; y++) for (let x = 0; x < liveMap.width; x++) all.add(cellKey(x, y));
      sight = { key: "topdown", cells: all };
      publishSight(all);
      return true;
    }
    const doors = openDoorsRef.current;
    const cx = Math.round(party.x);
    const cz = Math.round(party.z);
    const key = `${cx},${cz}|${range}|${[...doors].sort().join(";")}`;
    if (key === sight.key) return false;
    const cells = new Set<string>();
    for (const [ox, oz] of SIGHT_POINTS) {
      for (const c of visibleCells(liveMap, cx + ox, cz + oz, Math.round(range), (k) => doors.has(k))) cells.add(c);
    }
    // a door cell seen shut: the walls on its sides still show around the
    // door (their panels may count as the wall cells beyond, which the
    // shut door hides from the sight lines)
    for (const c of [...cells]) {
      const [x, y] = c.split(",").map(Number);
      if (cellAt(liveMap, x, y) !== "door") continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cells.add(cellKey(x + dx, y + dy));
    }
    sight = { key, cells };
    publishSight(cells);
    return true;
  }

  // Culling: the scene's small objects (a wall panel, a floor tile, a
  // door, a prop...) each belong to the cell their bounding box centers
  // on, and are drawn only while that cell is seen. Big or spread-out
  // ones (a ladder's group, the sky) are always drawn. Actors are culled
  // as they move (updateActors).
  const cullBox = new THREE.Box3();
  const cullCenter = new THREE.Vector3();
  const cullSize = new THREE.Vector3();
  const cullCells = new WeakMap<THREE.Object3D, string | null>();
  let culledCount = -1;
  function cellOf(obj: THREE.Object3D): string | null {
    let key = cullCells.get(obj);
    if (key === undefined && obj.userData.cullCell) key = obj.userData.cullCell as string;
    if (key === undefined) {
      obj.updateMatrixWorld(true);
      cullBox.setFromObject(obj);
      cullBox.getSize(cullSize);
      cullBox.getCenter(cullCenter);
      key =
        cullBox.isEmpty() || cullSize.x > CULL_MAX_SIZE || cullSize.z > CULL_MAX_SIZE
          ? null
          : cellKey(Math.round(cullCenter.x), Math.round(cullCenter.z));
      cullCells.set(obj, key);
    }
    return key;
  }
  // A prop bigger than a cell (a tree's crown, a tall pillar) isn't left
  // always drawn: it's seen while any cell under its footprint is (an
  // object that isn't a prop, and has no footprint, still is).
  const bigPropCells = new WeakMap<THREE.Object3D, string[] | null>();
  function bigPropSeen(obj: THREE.Object3D): boolean {
    let cells = bigPropCells.get(obj);
    if (cells === undefined) {
      cells = null;
      if (obj.userData.prop) {
        obj.updateMatrixWorld(true);
        cullBox.setFromObject(obj);
        if (!cullBox.isEmpty()) {
          const x0 = Math.round(cullBox.min.x);
          const x1 = Math.round(cullBox.max.x);
          const z0 = Math.round(cullBox.min.z);
          const z1 = Math.round(cullBox.max.z);
          // (a runaway size - a sky-high thing - stays always drawn)
          if (x1 - x0 <= 4 && z1 - z0 <= 4) {
            cells = [];
            for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) cells.push(cellKey(cx, cz));
          }
        }
      }
      bigPropCells.set(obj, cells);
    }
    return cells === null || cells.some((c) => sight.cells.has(c));
  }
  // dev: __voidcrewNoCull = true in the console draws everything, to compare
  let cullingOff = false;
  function applySight(changed: boolean) {
    const off = import.meta.env.DEV && !!(window as { __voidcrewNoCull?: boolean }).__voidcrewNoCull;
    // (objects are still being added while the scene builds)
    if (!changed && group.children.length === culledCount && off === cullingOff) return;
    culledCount = group.children.length;
    cullingOff = off;
    for (const obj of group.children) {
      // (a decal is culled with the surface it lies on - see cullFacing)
      if (obj.userData.actor || obj.userData.item || obj.userData.decalHost) continue;
      // (the corner joins: each point's strip is in sight with any of the
      // cells round it; which are drawn is picked in cullFacing)
      if (obj.userData.joinStrips) {
        for (const p of (obj.userData.joinStrips as JoinedStrips).points) {
          const { x, y } = p.point;
          p.inSight =
            off ||
            sight.cells.has(cellKey(Math.floor(x), Math.floor(y))) ||
            sight.cells.has(cellKey(Math.ceil(x), Math.floor(y))) ||
            sight.cells.has(cellKey(Math.floor(x), Math.ceil(y))) ||
            sight.cells.has(cellKey(Math.ceil(x), Math.ceil(y)));
        }
        continue;
      }
      const key = cellOf(obj);
      const seen = off || (key === null ? bigPropSeen(obj) : sight.cells.has(key));
      // (a surface's own pass decides, with its facing - every frame)
      if (obj.userData.facing) obj.userData.inSight = seen;
      else obj.visible = seen;
    }
    cullFacing();
  }
  // Surfaces seen from behind their plane are hidden - by more than a
  // margin: the relief stands out of the plane (up to its depth), and its
  // bumps could catch a grazing look from just behind it. Every frame (it
  // turns with the eye, between cells too); ~a dot product a surface.
  const FACING_MARGIN = 2 * Math.max(reliefDepth, floorDepth) + 0.02;
  const joinFrustum = new THREE.Frustum();
  const joinMatrix = new THREE.Matrix4();
  function cullFacing() {
    const eye = camera.position;
    for (const obj of facingSurfaces) {
      const { n, d } = obj.userData.facing as { n: THREE.Vector3; d: number };
      obj.visible = !!obj.userData.inSight && (topdown.on ? n.y > -0.5 : cullingOff || n.dot(eye) - d > -FACING_MARGIN);
    }
    // the corner joins' strips: those in sight and in view (one merged
    // mesh can't be frustum-culled as a whole)
    if (joinedStrips.length) {
      joinFrustum.setFromProjectionMatrix(joinMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const strips of joinedStrips) strips.mesh.visible = strips.show((p) => p.inSight && joinFrustum.intersectsBox(p.box));
    }
    // the decals with their surfaces, just decided (see DecalLibrary.cull)
    decals.cull(camera);
  }
  function invalidateCulling() {
    culledCount = -1;
  }

  function invalidateSight() {
    sight = { key: "", cells: sight.cells };
    invalidateCulling();
  }

  function dispose() {
    if (topdownToggleRef.current === toggle) topdownToggleRef.current = null;
    if (topCaps) scene.remove(topCaps);
    capMaterial.dispose();
    capGeometry.dispose();
  }

  return { setTopdown, updateSight, applySight, cullFacing, cellOf, getSightCells: () => sight.cells, invalidateSight, invalidateCulling, dispose };
}
