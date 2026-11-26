import * as THREE from "three";
import { beginWorldDrag, justDragged } from "../../components/slotDrag";
import type { ActorState } from "../../game/actors";
import type { EditTool } from "../../editor/mapEdits";
import { ownCeilingLight } from "../../game/lights";
import { DOOR_EDGE_OFFSET, doorAt, doorFacingAt, doorFits } from "../../game/map";
import { DIR_VECTOR } from "../../game/movement";
import { PROP_TYPES } from "../../game/props";
import type { GameMap, Vec2 } from "../../game/types";
import { FACING_ROTATION, TOUCH_REACH } from "./constants";
import type { EditDragKind, EditTarget, GameViewportProps, ViewportRef } from "./contracts";
import { STROKE_TOOLS } from "./editor";
import type { createInteractionRaycasts } from "./interactionRaycasts";
import type { createMapLightState } from "./lightFixtures";
import { raycastDrawn } from "./raycastObjects";

interface PointerInputContext {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  group: THREE.Group;
  topdown: { readonly on: boolean };
  map: GameMap;
  latestMapRef: ViewportRef<GameMap>;
  cameraPullback: number;
  wallHeight: number;
  floorY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  levelPoint(ndc: THREE.Vector2, y: number): THREE.Vector3 | null;
  editTargetAt(ndc: THREE.Vector2): EditTarget | null;
  toolLocked(): boolean;
  actorsRef: ViewportRef<readonly ActorState[]>;
  actorMeshes: ReadonlyMap<number, { mesh: THREE.Object3D }>;
  looseItems: ReadonlyMap<number, { taken: boolean }>;
  lootRef: ViewportRef<Pick<GameViewportProps, "takenItems">>;
  mapLightState: ReturnType<typeof createMapLightState>;
  propObjects: ReadonlyMap<number, THREE.Object3D>;
  doorGroups: ReadonlyMap<string, THREE.Object3D>;
  interactionCallbacks: ViewportRef<Pick<GameViewportProps, "interactionOpen" | "onEditInteraction">>;
  interactionRaycasts: Pick<ReturnType<typeof createInteractionRaycasts>, "pickEventMarker" | "activateInteraction" | "findInteractionHit">;
  editModeRef: ViewportRef<boolean | undefined>;
  editToolRef: ViewportRef<EditTool>;
  editHoverRef: { current: THREE.Vector2 | null };
  onTouchRef: ViewportRef<GameViewportProps["onTouch"]>;
  onEditRef: ViewportRef<GameViewportProps["onEdit"]>;
  onEditPaintRef: ViewportRef<GameViewportProps["onEditPaint"]>;
  onEditDragRef: ViewportRef<GameViewportProps["onEditDrag"]>;
  onEditAdjustRef: ViewportRef<GameViewportProps["onEditAdjust"]>;
  selectedLightRef: ViewportRef<number | null>;
  selectedPropRef: ViewportRef<number | null>;
  selectedDecalRef: ViewportRef<number | null>;
  selectedItemRef: ViewportRef<number | null>;
}

export function createPointerInput(ctx: PointerInputContext) {
  const {
    canvas, camera, group, topdown, map, latestMapRef, cameraPullback, wallHeight, floorY, ceilingY, levelPoint,
    editTargetAt, toolLocked, actorsRef, actorMeshes, looseItems, lootRef, mapLightState, propObjects, doorGroups,
    interactionCallbacks, interactionRaycasts, editModeRef, editToolRef, editHoverRef, onTouchRef, onEditRef,
    onEditPaintRef, onEditDragRef, onEditAdjustRef, selectedLightRef, selectedPropRef, selectedDecalRef, selectedItemRef,
  } = ctx;
  const { pickEventMarker, activateInteraction, findInteractionHit } = interactionRaycasts;

  // Touching an interactive decal: a click or tap (not a drag) whose ray
  // meets one within reach, in front of whatever else it meets. The press
  // starts on the canvas; the release is heard on the window, since the
  // view controls capture the pointer.
  const raycaster = new THREE.Raycaster();
  raycaster.far = TOUCH_REACH + cameraPullback;
  let press: { id: number; x: number; y: number; at: number; ndc: THREE.Vector2 } | null = null;
  // Something grabbed in the editor and dragged. Props, lights, robots and
  // doors slide over the level they stand on (their floor; a ceiling lamp's
  // or a hung robot's ceiling), their spot there kept where it was on the
  // screen from the pointer (`grab`): moved by as much as the pointer moves,
  // wherever on the thing it was grabbed (a pillar by its head as by its
  // foot) - not put where the pointer meets whatever surface is under it,
  // which is often the thing itself (a pillar's side put it back in its
  // cell's middle every other step). (Not the point grabbed slid on its own
  // level either: near eye height that level is seen edge on, and the
  // slightest move threw the thing far off.)
  // Decals, items, smoke and wall-hung props go over the surfaces pointed
  // at, the dragged one itself looked through. A door slides along its
  // passage inside its cell (its offset); with Shift or Ctrl (a copy) it's
  // moved to another cell.
  let dragItem: {
    kind: EditDragKind;
    index: number;
    door?: Vec2;
    copy: boolean;
    first: boolean;
    x: number;
    y: number;
    moved: boolean;
    // (one undo step per drag)
    id: number;
    // the thing's spot (world x, z) and the level it slides on; null: it
    // goes over surfaces
    anchor: [number, number] | null;
    planeY: number;
    // how the level follows the floor (or ceiling) it is over: its height above it, so the
    // plane the pointer is taken to stays at the thing's height when it moves to a cell of
    // another height; null: it does not follow
    level: { base: "floor" | "ceiling"; offset: number } | null;
    // from the pointer to the thing's spot on the screen (view coordinates)
    grab: THREE.Vector2 | null;
    // a door: where it's shown while dragged (moved into the map on release)
    // and where it stood
    doorTo?: Vec2;
    doorAcross?: boolean;
    doorOffset?: number;
    doorHome?: { position: THREE.Vector3; rotation: number };
  } | null = null;
  let dragSerial = 0;
  // The Roof tool's stroke: cells painted (or, the right button, taken off) as the pointer
  // moves over them with a button held; `last` is the cell it reached last
  let roofStroke: { pointer: number; id: number; erase: boolean; last: string; shift: boolean; ctrl: boolean } | null = null;
  // whether a hit is on the thing being dragged (looked through while it is)
  function dragOwn(o: THREE.Object3D): boolean {
    const d = dragItem;
    if (!d) return false;
    const u = o.userData;
    switch (d.kind) {
      case "prop":
        return u.propIndex === d.index;
      case "item":
        return u.itemIndex === d.index;
      case "smoke":
        return u.smokeIndex === d.index;
      case "sound":
        return u.soundIndex === d.index;
      case "light":
        return u.mapLight === d.index;
      case "actor":
        return u.actorId === d.index;
      case "door":
        return !!u.doorCell && u.doorCell.x === d.door?.x && u.doorCell.y === d.door?.y;
      default:
        return false;
    }
  }
  // the spot of the thing grabbed that the drag moves (world x, z) and the
  // height of the level it slides on - null for the ones dragged over
  // surfaces
  function dragAnchor(kind: EditDragKind, index: number, door?: Vec2): [number, number, number] | null {
    if (kind === "prop") {
      const spec = latestMapRef.current.props?.[index];
      const obj = propObjects.get(index);
      return spec && obj && !PROP_TYPES[spec.prop]?.wall ? [obj.position.x, obj.position.z, obj.position.y] : null;
    }
    if (kind === "light") {
      const l = mapLightState.mapLights.find((m) => m.source === index);
      if (!l) return null;
      const cx = Math.round(l.x);
      const cz = Math.round(l.z);
      // (a free-standing light slides on its own level: the pointer's ray meets that, not the floor under it)
      return [l.x, l.z, l.kind === "ceiling" ? ceilingY(cx, cz) : l.y * wallHeight];
    }
    if (kind === "actor") {
      const actor = actorsRef.current.find((a) => a.id === index);
      if (!actor) return null;
      // (a turret, a camera: hung from the ceiling, above the eye)
      const mesh = actorMeshes.get(index)?.mesh;
      const hung = !!mesh && mesh.position.y > camera.position.y;
      return [actor.cell.x, actor.cell.y, hung ? ceilingY(actor.cell.x, actor.cell.y) : floorY(actor.cell.x, actor.cell.y)];
    }
    if (kind === "door" && door) {
      // (where it stands in its cell, not the cell's middle)
      const obj = doorGroups.get(`${door.x},${door.y}`);
      return [obj?.position.x ?? door.x, obj?.position.z ?? door.y, floorY(door.x, door.y)];
    }
    return null;
  }
  // the loose item (not taken yet) the nearest thing under a point of the view is, with what it is
  function pressedItem(ndc: THREE.Vector2): { index: number; slot: { item: string; qty: number } } | null {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycastDrawn(raycaster, group.children);
    if (!hits.length) return null;
    // (a decal on a wall counts if it is as near as the nearest hit: that is its click)
    if (hits.some((h) => h.object.userData.action && h.distance <= hits[0].distance + 0.02)) return null;
    for (let o: THREE.Object3D | null = hits[0].object; o; o = o.parent) {
      if (typeof o.userData.itemIndex !== "number") continue;
      const index = o.userData.itemIndex as number;
      const spec = latestMapRef.current.items?.[index];
      if (!spec || looseItems.get(index)?.taken || lootRef.current.takenItems?.has(index)) return null;
      return { index, slot: { item: spec.item, qty: spec.count ?? 1 } };
    }
    return null;
  }
  const onPress = (e: PointerEvent) => {
    // The canvas handles editing in top-down view. Keep the outer
    // first-person pointer controls from starting a look drag.
    if (topdown.on) e.stopPropagation();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), ndc: viewNdc(e.clientX, e.clientY) };
    dragItem = null;
    roofStroke = null;
    // A loose item pressed while playing: dragged on, it goes to the screen's hand boxes, cards and
    // backpack (slotDrag's beginWorldDrag); released without moving, it is the click pickup below.
    // (The press is the item's: the view's own drag - peeking round - mustn't start on it.)
    if (!editModeRef.current && !interactionCallbacks.current.interactionOpen && (e.pointerType !== "mouse" || e.button === 0)) {
      const grabbed = pressedItem(press.ndc);
      if (grabbed) {
        e.stopPropagation();
        beginWorldDrag(e, grabbed.index, grabbed.slot);
      }
    }
    // the Roof tool: a press starts a stroke (either button); the cell under it is the first
    if (editModeRef.current && STROKE_TOOLS.has(editToolRef.current) && (e.button === 0 || e.button === 2) && !toolLocked()) {
      const hit = editTargetAt(viewNdc(e.clientX, e.clientY));
      if (hit && onEditPaintRef.current) {
        const stroke = { pointer: e.pointerId, id: ++dragSerial, erase: e.button === 2, last: `${hit.cell.x},${hit.cell.y}`, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
        roofStroke = stroke;
        onEditPaintRef.current(hit, { id: stroke.id, first: true, erase: stroke.erase, shift: stroke.shift, ctrl: stroke.ctrl });
      }
      return;
    }
    if (!editModeRef.current || e.button !== 0) return;
    const tool = editToolRef.current;
    if (toolLocked()) return;
    if (tool === "select" && pickEventMarker(press.ndc)) return;
    // each tool grabs only its own kind of thing; Select any kind, the nearest
    let kind: EditDragKind | null =
      tool === "prop" || tool === "decal" || tool === "item" || tool === "smoke" || tool === "sound" || tool === "light" || tool === "door"
        ? tool
        : tool === "robot"
          ? "actor"
          : null;
    if (!kind && tool !== "select") return;
    const hit = editTargetAt(viewNdc(e.clientX, e.clientY));
    if (!hit) return;
    if (tool === "select")
      kind = hit.actor !== undefined ? "actor" : hit.item !== undefined ? "item" : hit.prop !== undefined ? "prop" : hit.decal !== undefined ? "decal" : hit.light !== undefined ? "light" : hit.smoke !== undefined ? "smoke" : hit.sound !== undefined ? "sound" : null;
    if (!kind) return;
    let index: number | undefined;
    let door: Vec2 | undefined;
    if (kind === "prop") index = hit.prop;
    else if (kind === "decal") index = hit.decal;
    else if (kind === "item") index = hit.item;
    else if (kind === "smoke") index = hit.smoke;
    else if (kind === "sound") index = hit.sound;
    else if (kind === "actor") index = hit.actor;
    else if (kind === "light") {
      // a bulb or a lamp panel; or a ceiling with its lamp in it (a lit
      // ceiling texture has no panel of its own to grab)
      const own = hit.light ?? (hit.kind === "ceiling" ? ownCeilingLight(latestMapRef.current, hit.cell) : -1);
      index = own >= 0 && latestMapRef.current.lights?.[own]?.pos ? own : undefined;
    } else if (kind === "door" && hit.door) {
      door = hit.door;
      index = -1;
    }
    if (index === undefined) return;
    const anchor = dragAnchor(kind, index, door);
    const spot = anchor && new THREE.Vector3(anchor[0], anchor[2], anchor[1]).project(camera);
    const doorObj = door && doorGroups.get(`${door.x},${door.y}`);
    dragItem = {
      kind,
      index,
      door,
      copy: e.ctrlKey || e.metaKey,
      first: true,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      id: ++dragSerial,
      anchor: anchor && [anchor[0], anchor[1]],
      planeY: anchor ? anchor[2] : 0,
      level: anchor
        ? (() => {
            const cx = Math.round(anchor[0]);
            const cz = Math.round(anchor[1]);
            // (a ceiling lamp, a hung turret: its level is the ceiling's)
            const hung = ceilingY(cx, cz) - anchor[2] < anchor[2] - floorY(cx, cz);
            return hung ? { base: "ceiling" as const, offset: anchor[2] - ceilingY(cx, cz) } : { base: "floor" as const, offset: anchor[2] - floorY(cx, cz) };
          })()
        : null,
      doorAcross: e.shiftKey || e.ctrlKey || e.metaKey,
      grab: spot && new THREE.Vector2(spot.x, spot.y).sub(viewNdc(e.clientX, e.clientY)),
      doorHome: doorObj ? { position: doorObj.position.clone(), rotation: doorObj.rotation.y } : undefined,
    };
  };
  // (heard on the window, in the capture phase: while a drag is on, the view
  // controls underneath mustn't turn the view too)
  const onDragMove = (e: PointerEvent) => {
    const stroke = roofStroke;
    if (stroke && stroke.pointer === e.pointerId) {
      if (!editModeRef.current || !(e.buttons & (stroke.erase ? 2 : 1))) {
        roofStroke = null;
        return;
      }
      // (the view underneath mustn't turn with it)
      e.stopPropagation();
      const target = editTargetAt(viewNdc(e.clientX, e.clientY));
      const key = target && `${target.cell.x},${target.cell.y}`;
      if (target && key !== stroke.last) {
        stroke.last = key!;
        onEditPaintRef.current?.(target, { id: stroke.id, first: false, erase: stroke.erase, shift: stroke.shift, ctrl: stroke.ctrl });
      }
      return;
    }
    const d = dragItem;
    if (!d || !editModeRef.current || !(e.buttons & 1)) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    e.stopPropagation();
    if (e.shiftKey) {
      // Shift + drag: up and down raises or lowers
      onEditAdjustRef.current?.({ what: "height", delta: -e.movementY * 0.004 });
      return;
    }
    const ndc = viewNdc(e.clientX, e.clientY);
    // where the grabbed spot is taken to, on its level
    let at: [number, number] | undefined;
    if (d.anchor && d.grab) {
      const grabbed = ndc.clone().add(d.grab);
      let p = levelPoint(grabbed, d.planeY);
      // The level moves with the floor under the spot: over a cell of another height the
      // thing is higher or lower, and the pointer's ray must meet THAT height (a few steps
      // settle it: the cell it lands in may change with the height).
      for (let i = 0; p && d.level && i < 4; i++) {
        const cx = Math.round(p.x);
        const cz = Math.round(p.z);
        const y = (d.level.base === "ceiling" ? ceilingY(cx, cz) : floorY(cx, cz)) + d.level.offset;
        if (Math.abs(y - d.planeY) < 1e-4) break;
        d.planeY = y;
        p = levelPoint(grabbed, d.planeY);
      }
      // (its spot taken over the horizon, or far off: nowhere to put it)
      if (!p) return;
      at = [p.x, p.z];
    }
    if (d.kind === "door") {
      if (at && d.doorAcross) previewDoor(d, { x: Math.round(at[0]), y: Math.round(at[1]) });
      else if (at) slideDoor(d, at);
      return;
    }
    const target = at ? { kind: "floor" as const, cell: { x: Math.round(at[0]), y: Math.round(at[1]) } } : editTargetAt(ndc);
    if (!target) return;
    const index = onEditDragRef.current?.({ kind: d.kind, index: d.index, copy: d.copy, first: d.first, id: d.id, at }, target);
    if (index === false) return;
    d.first = false;
    if (typeof index === "number") d.index = index;
  };
  // A door dragged: shown where it'd go (a cell it fits in - see doorFits -
  // facing along that passage) - the map takes it on release: it changes
  // the deck's structure, a rebuild that's too slow for every step.
  function previewDoor(d: NonNullable<typeof dragItem>, cell: Vec2) {
    const from = d.door;
    const obj = from && doorGroups.get(`${from.x},${from.y}`);
    if (!from || !obj || !d.doorHome) return;
    const m = latestMapRef.current;
    const home = cell.x === from.x && cell.y === from.y;
    if (!home && !doorFits(m, cell, d.copy ? undefined : from)) return;
    d.doorTo = home ? undefined : cell;
    const spec = doorAt(m, from.x, from.y);
    const facing = home ? spec.facing : doorFacingAt(m, cell, spec.facing);
    obj.position.set(cell.x, floorY(cell.x, cell.y), cell.y);
    obj.rotation.y = FACING_ROTATION[facing];
    obj.translateZ(spec.offset ?? 0);
  }
  // A door slid inside its cell: along its passage (the way it faces), up
  // to flush with the cell's edge (see DoorSpec.offset) - shown as it goes,
  // taken into the map on release (as a door moved to another cell).
  function slideDoor(d: NonNullable<typeof dragItem>, at: [number, number]) {
    const cell = d.door;
    const obj = cell && doorGroups.get(`${cell.x},${cell.y}`);
    if (!cell || !obj) return;
    const spec = doorAt(latestMapRef.current, cell.x, cell.y);
    const v = DIR_VECTOR[spec.facing];
    const along = (at[0] - cell.x) * v.x + (at[1] - cell.y) * v.y;
    const offset = Math.round(Math.max(-DOOR_EDGE_OFFSET, Math.min(DOOR_EDGE_OFFSET, along)) * 100) / 100;
    d.doorOffset = offset;
    obj.position.set(cell.x, floorY(cell.x, cell.y), cell.y);
    obj.rotation.y = FACING_ROTATION[spec.facing];
    obj.translateZ(offset);
  }
  window.addEventListener("pointermove", onDragMove, true);
  // the wheel over the view, while a prop, decal, item or free-standing
  // light is selected: height, Ctrl: scale, Alt: turn
  const onWheel = (e: WheelEvent) => {
    if (!editModeRef.current || !onEditAdjustRef.current) return;
    const tool = editToolRef.current;
    // (Select: the selected one, whatever its kind)
    const sel = tool === "select";
    const pointLight = (tool === "light" || sel) && selectedLightRef.current !== null && !!latestMapRef.current.lights?.[selectedLightRef.current]?.pos;
    const selected = (kind: EditTool, picked: number | null) => tool === kind || (sel && picked !== null);
    if (!selected("prop", selectedPropRef.current) && !selected("decal", selectedDecalRef.current) && !selected("item", selectedItemRef.current) && !pointLight) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    if (e.ctrlKey || e.metaKey) onEditAdjustRef.current({ what: "scale", delta: dir * 0.05 });
    else if (e.altKey) onEditAdjustRef.current({ what: "rotate", delta: dir * 15 });
    else onEditAdjustRef.current({ what: "height", delta: dir * 0.05 });
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });
  // a point of the view in normalized device coordinates - its center
  // while the pointer is locked (free mouselook)
  const viewNdc = (clientX: number, clientY: number) => {
    if (document.pointerLockElement) return new THREE.Vector2(0, 0);
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  };
  const onRelease = (e: PointerEvent) => {
    const p = press;
    if (p && p.id !== e.pointerId) return;
    press = null;
    // a loose item dragged to the screen and let go (slotDrag's beginWorldDrag): not a click
    if (justDragged()) return;
    // the Roof tool's strokes did it all (the minimap's clicks reach the tool on their own)
    if (roofStroke?.pointer === e.pointerId) {
      roofStroke = null;
      return;
    }
    if (editModeRef.current && STROKE_TOOLS.has(editToolRef.current)) return;
    // a drag just ended: not a click
    const d = dragItem;
    if (d?.moved) {
      dragItem = null;
      // a door: into the map where it was shown, if it takes it there - else
      // back where it stood (on success the deck is rebuilt around it)
      if (d.kind === "door" && d.door) {
        const drop = { kind: "door" as const, index: -1, door: d.door, copy: d.copy, first: true, id: d.id, drop: true };
        const taken = d.doorAcross
          ? d.doorTo && onEditDragRef.current?.(drop, { kind: "floor", cell: d.doorTo })
          : d.doorOffset !== undefined && onEditDragRef.current?.({ ...drop, copy: false, offset: d.doorOffset }, { kind: "floor", cell: d.door });
        const obj = doorGroups.get(`${d.door.x},${d.door.y}`);
        if ((taken !== true || d.copy) && obj && d.doorHome) {
          obj.position.copy(d.doorHome.position);
          obj.rotation.y = d.doorHome.rotation;
        }
      }
      return;
    }
    dragItem = null;
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8 || performance.now() - p.at > 500) return;
    const ndc = viewNdc(e.clientX, e.clientY);
    if (editModeRef.current) {
      if (toolLocked()) return;
      const marker = (editToolRef.current === "event" || (editToolRef.current === "select" && e.button === 0))
        ? pickEventMarker(ndc)
        : null;
      if (marker) {
        interactionCallbacks.current.onEditInteraction?.(marker, e.button === 2);
        return;
      }
      if (editToolRef.current === "event") {
        interactionCallbacks.current.onEditInteraction?.(findInteractionHit(ndc, true)?.target ?? null, e.button === 2);
        return;
      }
      const target = editTargetAt(ndc);
      if (target) onEditRef.current?.(target, e.button === 2, e.shiftKey, e.ctrlKey || e.metaKey);
      return;
    }
    if (interactionCallbacks.current.interactionOpen) return;
    if (e.button === 0 && activateInteraction(p.ndc, "pointer")) return;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycastDrawn(raycaster, group.children);
    if (!hits.length) return;
    // a decal lies on its wall: count it if it's as near as the nearest hit
    const touched = hits.find((h) => h.object.userData.action && h.distance <= hits[0].distance + 0.02);
    if (touched) {
      onTouchRef.current?.(touched.object.userData.action);
      return;
    }
    // a container or a wreck, nearest: the same as Use (handy on a phone)
    for (let o: THREE.Object3D | null = hits[0].object; o; o = o.parent) {
      // a loose item: picked up if it is within reach (see pickupMode.ts)
      if (typeof o.userData.itemIndex === "number") {
        onTouchRef.current?.(`pickup:${o.userData.itemIndex}`);
        return;
      }
      if (o.userData.propIndex !== undefined) {
        const spec = map.props?.[o.userData.propIndex as number];
        if (spec && PROP_TYPES[spec.prop]?.container) onTouchRef.current?.("use");
        return;
      }
      if (o.userData.actorId !== undefined) {
        const actor = actorsRef.current.find((a) => a.id === o.userData.actorId);
        if (actor && actor.diedAt !== null) onTouchRef.current?.("use");
        return;
      }
    }
  };
  canvas.addEventListener("pointerdown", onPress);
  window.addEventListener("pointerup", onRelease);

  const onHover = (e: PointerEvent) => {
    editHoverRef.current = viewNdc(e.clientX, e.clientY);
  };
  // leaving the view (for the toolbar, say) keeps the last point: the
  // highlight mustn't jump to whatever is in the middle of the view
  const onLeave = () => {};
  // no context menu over the view while editing: the right button fills
  const onContextMenu = (e: Event) => {
    if (editModeRef.current) e.preventDefault();
  };
  canvas.addEventListener("pointermove", onHover);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("contextmenu", onContextMenu);

  function ownsDrag(obj: THREE.Object3D) {
    if (!dragItem?.moved) return false;
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (dragOwn(o)) return true;
    return false;
  }

  function dispose() {
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("pointermove", onHover);
    window.removeEventListener("pointerup", onRelease);
    canvas.removeEventListener("pointerdown", onPress);
    canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("pointermove", onDragMove, true);
  }
  return { ownsDrag, isDragging: () => !!dragItem?.moved, dispose };
}
