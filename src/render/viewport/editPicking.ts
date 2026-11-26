import * as THREE from "three";
import { operableLink } from "../../editor/operableLink";
import type { EditTool } from "../../editor/mapEdits";
import type { ActorState } from "../../game/actors";
import { cellAt, ceilingHeight, floorHeight } from "../../game/map";
import type { Direction, GameMap, Vec2 } from "../../game/types";
import { surfaceFrame } from "../surfaces";
import { TOPDOWN_REACH } from "./camera";
import { LIGHT_SPOT_GAP, ORIGIN_NDC, SURFACE_PIXELS } from "./constants";
import type { EditTarget, ViewportRef } from "./contracts";
import { EDIT_REACH, TOOL_LAYER } from "./editor";
import { drawnChain, isItemObject, seeThrough } from "./raycastObjects";

// The editor layer a picked object belongs to (a locked one is looked
// through: what's behind it can still be clicked).
export const objectLayer = (obj: THREE.Object3D): string | undefined => {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const u = o.userData;
    if (u.propIndex !== undefined) return "prop";
    if (u.decalIndex !== undefined) return "decal";
    if (u.itemIndex !== undefined) return "item";
    if (u.actorId !== undefined) return "robot";
    if (u.smokeIndex !== undefined) return "smoke";
    if (u.soundIndex !== undefined) return "sound";
    if (u.mapLight !== undefined) return "light";
  }
  return undefined;
};

interface EditPickingContext {
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  topdown: { readonly on: boolean };
  wallHeight: number;
  reliefDepth: number;
  getLiveMap(): GameMap;
  floorY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  latestMapRef: ViewportRef<GameMap>;
  lockedLayersRef: ViewportRef<ReadonlySet<string>>;
  actorsRef: ViewportRef<readonly ActorState[]>;
  editToolRef: ViewportRef<EditTool>;
  editHoverRef: ViewportRef<THREE.Vector2 | null>;
  ownsDrag(obj: THREE.Object3D): boolean;
  isDragging(): boolean;
}

export function createEditPicking({
  camera, group, topdown, wallHeight, reliefDepth, getLiveMap, floorY, ceilingY,
  latestMapRef, lockedLayersRef, actorsRef, editToolRef, editHoverRef, ownsDrag, isDragging,
}: EditPickingContext) {

  const editRaycaster = new THREE.Raycaster();
  editRaycaster.far = EDIT_REACH;
  const editNormal = new THREE.Vector3();

  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();

  // where a point of the view meets a level (world height y), if it does
  // within reach
  function levelPoint(ndc: THREE.Vector2, y: number): THREE.Vector3 | null {
    editRaycaster.setFromCamera(ndc, camera);
    dragPlane.set(new THREE.Vector3(0, 1, 0), -y);
    const p = editRaycaster.ray.intersectPlane(dragPlane, dragPoint);
    // (the top-down camera floats high above the map: its reach is its own)
    return p && p.distanceTo(editRaycaster.ray.origin) <= (topdown.on ? TOPDOWN_REACH : EDIT_REACH) ? p : null;
  }

  // The cell a point of the view shows: the first solid surface there - a
  // wall's face (the wall cell behind it, dug from the open cell in front),
  // else the floor or ceiling of the cell it's in: floors face up, ceiling
  // geometry is turned to face down.
  const decalIndexOf = (h: THREE.Intersection | undefined) => h?.object.userData.decalIndex as number | undefined;
  // a world point on a cell's surface in that surface's pixels (see
  // DecalSpec and surfaceFrame)
  const surfaceInverse = new THREE.Quaternion();
  const surfaceLocal = new THREE.Vector3();
  function surfacePointAt(cell: Vec2, surface: Direction | "floor" | "ceiling", point: THREE.Vector3): EditTarget["surfacePoint"] {
    const frame = surfaceFrame(cell, surface, wallHeight, { floor: floorY(cell.x, cell.y), ceiling: ceilingY(cell.x, cell.y) });
    surfaceInverse.copy(frame.quaternion).invert();
    surfaceLocal.copy(point).sub(frame.position).applyQuaternion(surfaceInverse);
    return {
      cell,
      surface,
      u: Math.round(((surfaceLocal.x + frame.width / 2) / frame.width) * SURFACE_PIXELS),
      v: Math.round(((frame.height / 2 - surfaceLocal.y) / frame.height) * SURFACE_PIXELS),
    };
  }
  const toolLocked = () => {
    const layer = TOOL_LAYER[editToolRef.current];
    return !!layer && lockedLayersRef.current.has(layer);
  };
  let cursorLamp: THREE.Vector3 | null = null;
  function editTargetAt(ndc: THREE.Vector2, updateLamp = false): EditTarget | null {
    editRaycaster.setFromCamera(ndc, camera);
    editRaycaster.far = topdown.on ? TOPDOWN_REACH : EDIT_REACH;
    // (the Select tool points at any kind: the nearest thing under the pointer)
    const selecting = editToolRef.current === "select";
    const lightTool = editToolRef.current === "light" || selecting;
    const locked = lockedLayersRef.current;
    const intersections = editRaycaster.intersectObjects(group.children, true);
    if (updateLamp) {
      for (const hit of intersections) {
        if (!hit.face || !drawnChain(hit.object) || seeThrough(hit.object)) continue;
        const layer = objectLayer(hit.object);
        if (layer === "light" || layer === "smoke" || layer === "sound" || layer === "actor" || layer === "decal") continue;
        // Nudge off vertical faces into the adjacent open cell.
        editNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        const x = hit.point.x + editNormal.x * 0.05;
        const z = hit.point.z + editNormal.z * 0.05;
        const cx = Math.round(x);
        const cz = Math.round(z);
        if (cellAt(getLiveMap(), cx, cz) === "wall") continue;
        cursorLamp ??= new THREE.Vector3();
        cursorLamp.set(x, Math.min(hit.point.y + 0.75, ceilingY(cx, cz) - 0.08), z);
        break;
      }
    }
    const hits = intersections
      .filter((h) => {
        if (!h.face) return false;
        const layer = objectLayer(h.object);
        if (locked.size && layer && locked.has(layer)) return false;
        return (
          (h.object.userData.actorId === undefined || editToolRef.current === "robot" || selecting) &&
          (lightTool || h.object.userData.mapLight === undefined) &&
          drawnChain(h.object) &&
          // (the loose items are see-through sprites, but the Item tool can point at them)
          (!seeThrough(h.object) || ((editToolRef.current === "item" || selecting || operableLink.active()) && isItemObject(h.object))) &&
          // (a fence's floor mark: the Select tool and the fence tools point at it, the others see the floor under it)
          (h.object.parent?.name !== "fenceMarker" || selecting || editToolRef.current.startsWith("fence")) &&
          // (the thing being dragged is looked through: what's behind it is
          // where it goes)
          !(ownsDrag(h.object))
        );
      });
    const hit = hits[0];
    if (!hit?.face) return null;
    // the Decal tool: a decal lies on its surface - it counts if it's as
    // near as the nearest hit
    const decalHit =
      editToolRef.current === "decal" || selecting
        ? hits.find((h) => h.object.userData.decalIndex !== undefined && h.distance <= hit.distance + 0.02)
        : undefined;
    // the Robot tool: an actor pointed at
    const actorId = hit.object.userData.actorId as number | undefined;
    if (actorId !== undefined) {
      const actor = actorsRef.current.find((a) => a.id === actorId);
      return actor ? { kind: "floor", cell: { ...actor.cell }, actor: actorId } : null;
    }
    // the Door tool: a door pointed at (any part of it) - and the operable props' link mode, which picks doors too
    if (editToolRef.current === "door" || operableLink.active()) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const at = o.userData.doorCell as Vec2 | undefined;
        if (at) return { kind: "floor", cell: { ...at }, door: { ...at } };
      }
    }
    // the Smoke tool: an emitter's marker pointed at
    if (editToolRef.current === "smoke" || ((selecting || operableLink.active()) && hit.object.userData.smokeIndex !== undefined)) {
      const at = hits.find((h) => h.object.userData.smokeIndex !== undefined);
      const spec = at && latestMapRef.current.smokes?.[at.object.userData.smokeIndex as number];
      if (at && spec) return { kind: "floor", cell: { ...spec.cell }, smoke: at.object.userData.smokeIndex as number };
    }
    // the Sound tool: a sound emitter's marker pointed at
    // (as near as the nearest thing: a marker behind a wall is not the one a click is meant for)
    if (editToolRef.current === "sound" || selecting || operableLink.active()) {
      const at = hits.find((h) => h.object.userData.soundIndex !== undefined && h.distance <= hit.distance + 0.25);
      const spec = at && latestMapRef.current.sounds?.[at.object.userData.soundIndex as number];
      if (at && spec) return { kind: "floor", cell: { x: spec.x, y: spec.y }, sound: at.object.userData.soundIndex as number };
    }
    // the Item tool: an item pointed at
    if (editToolRef.current === "item" || selecting || operableLink.active()) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (o.userData.itemIndex === undefined) continue;
        const spec = latestMapRef.current.items?.[o.userData.itemIndex as number];
        if (spec) return { kind: "floor", cell: { ...spec.cell }, item: o.userData.itemIndex as number };
      }
    }
    // the Prop tool: a prop pointed at (any part of it)
    if (editToolRef.current === "prop" || selecting) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (o.userData.propIndex === undefined) continue;
        const spec = latestMapRef.current.props?.[o.userData.propIndex as number];
        if (spec) return { kind: "floor", cell: { ...spec.cell }, prop: o.userData.propIndex as number };
      }
    }
    const lightIndex = hit.object.userData.mapLight as number | undefined;
    const own = lightIndex === undefined ? undefined : latestMapRef.current.lights?.[lightIndex];
    if (lightIndex !== undefined && own) {
      return { kind: "floor", cell: { x: own.x, y: own.y }, light: lightIndex };
    }
    editNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    const p = hit.point;
    // a free-standing light's spot: just off the surface, in its cell
    const sx0 = p.x + editNormal.x * LIGHT_SPOT_GAP;
    const sy0 = p.y + editNormal.y * LIGHT_SPOT_GAP;
    const sz0 = p.z + editNormal.z * LIGHT_SPOT_GAP;
    const spotCell = { x: Math.round(sx0), y: Math.round(sz0) };
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const spot: EditTarget["spot"] =
      cellAt(getLiveMap(), spotCell.x, spotCell.y) === "wall"
        ? undefined
        : {
            cell: spotCell,
            pos: [round2(sx0 - spotCell.x), round2(sy0 / wallHeight - floorHeight(getLiveMap(), spotCell.x, spotCell.y)), round2(sz0 - spotCell.y)],
          };
    const flat = Math.abs(editNormal.y) >= Math.max(Math.abs(editNormal.x), Math.abs(editNormal.z));
    if (!flat) {
      // the side it faces, on the grid
      const sx = Math.abs(editNormal.x) > Math.abs(editNormal.z) ? Math.sign(editNormal.x) : 0;
      const sz = sx ? 0 : Math.sign(editNormal.z);
      const behind = { x: Math.round(p.x - sx * 0.05), y: Math.round(p.z - sz * 0.05) };
      if (cellAt(getLiveMap(), behind.x, behind.y) === "wall") {
        const from = { x: behind.x + sx, y: behind.y + sz };
        const side: Direction = sx > 0 ? "W" : sx < 0 ? "E" : sz > 0 ? "N" : "S";
        return { kind: "wall", cell: behind, from, spot, decal: decalIndexOf(decalHit), surfacePoint: surfacePointAt(from, side, p) };
      }
      // A step face: the plane between two open cells where the far one's floor
      // is higher (a riser, up to that floor) or its ceiling lower (a header,
      // from that ceiling up). It's seen from the near cell, and is addressed
      // like a wall face: that cell and the side toward the far one. (The
      // point has to be on the plane itself: the sides of a relief's steps
      // face sideways too, and mustn't count.)
      const from = { x: behind.x + sx, y: behind.y + sz };
      const planeAt = sx ? (behind.x + from.x) / 2 : (behind.y + from.y) / 2;
      if (
        cellAt(getLiveMap(), behind.x, behind.y) !== "wall" &&
        cellAt(getLiveMap(), from.x, from.y) !== "wall" &&
        Math.abs((sx ? p.x : p.z) - planeAt) <= reliefDepth + 0.08
      ) {
        const side: Direction = sx > 0 ? "W" : sx < 0 ? "E" : sz > 0 ? "N" : "S";
        const slack = 0.05;
        const part: "riser" | "header" | null =
          floorHeight(getLiveMap(), behind.x, behind.y) > floorHeight(getLiveMap(), from.x, from.y) && p.y <= floorY(behind.x, behind.y) + slack
            ? "riser"
            : ceilingHeight(getLiveMap(), behind.x, behind.y) < ceilingHeight(getLiveMap(), from.x, from.y) && p.y >= ceilingY(behind.x, behind.y) - slack
              ? "header"
              : null;
        if (part) {
          return { kind: "floor", cell: from, spot, decal: decalIndexOf(decalHit), surfacePoint: surfacePointAt(from, side, p), face: { cell: from, side, part } };
        }
      }
    }
    const cell = { x: Math.round(p.x), y: Math.round(p.z) };
    if (cellAt(getLiveMap(), cell.x, cell.y) === "wall") return null;
    // floor or ceiling by which the hit is nearer to (a relief's step
    // sides face sideways, so the normal can't tell)
    const nearCeiling = ceilingY(cell.x, cell.y) - p.y < p.y - floorY(cell.x, cell.y);
    const surface = nearCeiling ? "ceiling" : "floor";
    // an upward face (a floor, a table's top): the point itself
    const point: EditTarget["point"] =
      editNormal.y > 0.7 ? { cell, pos: [round2(p.x - cell.x), round2((p.y - floorY(cell.x, cell.y)) / wallHeight), round2(p.z - cell.y)] } : undefined;
    return { kind: surface, cell, spot, point, at: [round2(p.x), round2(p.z)], decal: decalIndexOf(decalHit), surfacePoint: surfacePointAt(cell, surface, p) };
  }

  // What is under the pointer is found with a ray (through thousands of triangles); it only changes when the pointer,
  // the view, the tool, the map or a drag does - not worked out again every frame while all of those stand still.
  let hoverCache: { map: GameMap; tool: string; locked: ReadonlySet<string>; x: number; y: number; dragging: boolean; lamp: boolean; aspect: number; pos: THREE.Vector3; quat: THREE.Quaternion; target: EditTarget | null } | null = null;
  function hoverTarget(lamp: boolean): EditTarget | null {
    const at = editHoverRef.current ?? ORIGIN_NDC;
    const dragging = isDragging();
    const locked = lockedLayersRef.current;
    const c = hoverCache;
    if (c && c.map === latestMapRef.current && c.tool === editToolRef.current && c.locked === locked && c.x === at.x && c.y === at.y && c.dragging === dragging && c.lamp === lamp && c.aspect === camera.aspect && c.pos.equals(camera.position) && c.quat.equals(camera.quaternion)) return c.target;
    const target = editTargetAt(at, lamp);
    hoverCache = { map: latestMapRef.current, tool: editToolRef.current, locked, x: at.x, y: at.y, dragging, lamp, aspect: camera.aspect, pos: camera.position.clone(), quat: camera.quaternion.clone(), target };
    return target;
  }

  return { editTargetAt, hoverTarget, levelPoint, toolLocked, getCursorLamp: () => cursorLamp };
}
