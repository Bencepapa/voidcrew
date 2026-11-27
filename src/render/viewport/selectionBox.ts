import * as THREE from "three";
import type { EditTool } from "../../editor/mapEdits";
import { sideFromPoint } from "../../game/fences";
import type { InteractionTarget } from "../../game/interactions";
import { DIR_VECTOR } from "../../game/movement";
import type { Vec2 } from "../../game/types";
import type { EditTarget, GameViewportProps, ViewportRef } from "./contracts";
import type { createEditPicking } from "./editPicking";
import { EDIT_DIG_COLOR, EDIT_FILL_COLOR, EDIT_LIGHT_ADD_COLOR, EDIT_LIGHT_REMOVE_COLOR, EDIT_PAINT_COLOR, EDIT_SELECT_COLOR } from "./editor";
import { SOUND_ICON_SIZE } from "./editorMarkers";
import type { createMapLightState } from "./lightFixtures";
import { expandByPropModel } from "./propShadows";
import type { ViewportSettings } from "./settings";

interface SelectionBoxContext {
  scene: THREE.Scene;
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  topdown: { readonly on: boolean; readonly x: number; readonly z: number };
  settingsRef: ViewportRef<ViewportSettings>;
  wallHeight: number;
  floorY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  pointLight: THREE.PointLight;
  doorPreview: GameViewportProps["doorPreview"];
  getEventMarkers(): THREE.Group;
  actorMeshes: ReadonlyMap<number, { mesh: THREE.Object3D }>;
  looseItems: ReadonlyMap<number, { obj: THREE.Object3D }>;
  doorGroups: ReadonlyMap<string, THREE.Object3D>;
  linkPlates: ReadonlyMap<string, THREE.Object3D>;
  smokeMarkers: ReadonlyMap<number, THREE.Object3D>;
  soundMarkers: ReadonlyMap<number, THREE.Object3D>;
  propObjects: ReadonlyMap<number, THREE.Object3D>;
  mapLightState: ReturnType<typeof createMapLightState>;
  editModeRef: ViewportRef<boolean | undefined>;
  editToolRef: ViewportRef<EditTool>;
  picking: Pick<ReturnType<typeof createEditPicking>, "hoverTarget" | "toolLocked" | "getCursorLamp">;
  onEditHoverRef: ViewportRef<GameViewportProps["onEditHover"]>;
  areaGhostRef: ViewportRef<GameViewportProps["areaGhost"]>;
  selectedActorRef: ViewportRef<number | null>;
  selectedDoorRef: ViewportRef<Vec2 | null>;
  selectedLinkRef: ViewportRef<Vec2 | null>;
  selectedDecalRef: ViewportRef<number | null>;
  selectedSmokeRef: ViewportRef<number | null>;
  selectedSoundRef: ViewportRef<number | null>;
  selectedItemRef: ViewportRef<number | null>;
  selectedPropRef: ViewportRef<number | null>;
  selectedLightRef: ViewportRef<number | null>;
  selectedEventRef: ViewportRef<InteractionTarget | null>;
}

export function createSelectionBox(ctx: SelectionBoxContext) {
  const {
    scene, group, geometries, topdown, settingsRef, wallHeight, floorY, ceilingY, pointLight, doorPreview,
    getEventMarkers, actorMeshes, looseItems, doorGroups, linkPlates, smokeMarkers, soundMarkers, propObjects,
    mapLightState, editModeRef, editToolRef, picking, onEditHoverRef, areaGhostRef, selectedActorRef, selectedDoorRef,
    selectedLinkRef, selectedDecalRef, selectedSmokeRef, selectedSoundRef, selectedItemRef, selectedPropRef,
    selectedLightRef, selectedEventRef,
  } = ctx;
  const { hoverTarget, toolLocked, getCursorLamp } = picking;

  const editBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: EDIT_DIG_COLOR, depthTest: false, transparent: true }),
  );
  editBox.renderOrder = 10;
  editBox.visible = false;
  scene.add(editBox);
  geometries.push(editBox.geometry);
  // the surface under the pointer, to the editor (the palette follows it):
  // only when it changes, not every frame, and only once it settles - a
  // sweep across the view on the way to the toolbar mustn't swap the
  // palette away from the surface it was picked for
  let lastHover = "";
  let hoverKey = "";
  let hoverSince = 0;
  const HOVER_SETTLE_MS = 150;
  function reportHover(target: EditTarget | null) {
    const key = target ? `${target.kind} ${target.cell.x},${target.cell.y} ${target.from?.x},${target.from?.y} ${target.face?.side ?? ""}` : "";
    if (key === lastHover) return;
    if (key !== hoverKey) {
      hoverKey = key;
      hoverSince = performance.now();
    }
    if (performance.now() - hoverSince < HOVER_SETTLE_MS) return;
    lastHover = key;
    onEditHoverRef.current?.(target);
  }
  // Marks what a click with the tool in hand would do: the wall block Dig
  // takes out, or the surface Fill paints over / the Texture tool paints /
  // the Light tool hangs a light in.
  // the Light tool's selected light, framed
  const selectBox = new THREE.LineSegments(
    editBox.geometry,
    new THREE.LineBasicMaterial({ color: EDIT_SELECT_COLOR, depthTest: false, transparent: true }),
  );
  selectBox.renderOrder = 11;
  selectBox.visible = false;
  scene.add(selectBox);
  const selectBounds = new THREE.Box3();
  const selectCenter = new THREE.Vector3();
  const selectSize = new THREE.Vector3();
  const frameObject = (box: THREE.LineSegments, obj: THREE.Object3D, pad: number) => {
    selectBounds.setFromObject(obj);
    selectBounds.getCenter(selectCenter);
    selectBounds.getSize(selectSize);
    box.position.copy(selectCenter);
    box.scale.set(selectSize.x + pad, selectSize.y + pad, selectSize.z + pad);
  };
  function updateSelectionBox() {
    // a selected event: framed around what it is attached to (the same frame as for the other kinds)
    const ev = editModeRef.current ? selectedEventRef.current : null;
    if (ev) {
      selectBounds.makeEmpty();
      let pad = 0.04;
      if (ev.kind === "actor") {
        const mesh = actorMeshes.get(ev.index)?.mesh;
        if (mesh) selectBounds.expandByObject(mesh);
      } else if (ev.kind === "door") {
        const obj = doorGroups.get(`${ev.cell.x},${ev.cell.y}`);
        if (obj) selectBounds.expandByObject(obj);
      } else if (ev.kind === "decal") {
        for (const obj of group.children) if (obj.userData.decalIndex === ev.index) selectBounds.expandByObject(obj);
        pad = 0.03;
      } else if (ev.kind === "item") {
        const obj = looseItems.get(ev.index)?.obj;
        if (obj) selectBounds.expandByObject(obj);
      } else if (ev.kind === "prop") {
        const obj = propObjects.get(ev.index);
        if (obj) expandByPropModel(selectBounds, obj);
      } else if (ev.kind === "wall") {
        // a wall face: around its marker (the face itself is no object of its own)
        for (const marker of getEventMarkers().children) {
          const t = marker.userData.interactionTarget as InteractionTarget | undefined;
          if (t?.kind === "wall" && t.side === ev.side && t.part === ev.part && t.cell.x === ev.cell.x && t.cell.y === ev.cell.y) {
            selectBounds.expandByPoint(marker.position);
          }
        }
        pad = 0.4;
      }
      if (!selectBounds.isEmpty()) {
        selectBounds.getCenter(selectCenter);
        selectBounds.getSize(selectSize);
        selectBox.position.copy(selectCenter);
        selectBox.scale.set(selectSize.x + pad, selectSize.y + pad, selectSize.z + pad);
        selectBox.visible = true;
        return;
      }
    }
    // a selected actor: framed around its sprite
    const actorIndex = editModeRef.current ? selectedActorRef.current : null;
    const actorEntry = actorIndex === null ? undefined : actorMeshes.get(actorIndex);
    if (actorEntry) {
      frameObject(selectBox, actorEntry.mesh, 0.04);
      selectBox.visible = true;
      return;
    }
    // a selected door: framed around it
    const doorCell = editModeRef.current ? selectedDoorRef.current : null;
    const doorObj = doorCell && doorGroups.get(`${doorCell.x},${doorCell.y}`);
    if (doorObj) {
      frameObject(selectBox, doorObj, 0.04);
      selectBox.visible = true;
      return;
    }
    // a selected gate or staircase: framed around its floor plate
    const linkCell = editModeRef.current ? selectedLinkRef.current : null;
    const linkPlate = linkCell && linkPlates.get(`${linkCell.x},${linkCell.y}`);
    if (linkPlate) {
      frameObject(selectBox, linkPlate, 0.12);
      selectBox.visible = true;
      return;
    }
    // a selected decal: framed around its pieces
    const decalIndex = editModeRef.current ? selectedDecalRef.current : null;
    if (decalIndex !== null) {
      selectBounds.makeEmpty();
      for (const obj of group.children) {
        if (obj.userData.decalIndex === decalIndex) selectBounds.expandByObject(obj);
      }
      if (!selectBounds.isEmpty()) {
        selectBounds.getCenter(selectCenter);
        selectBounds.getSize(selectSize);
        selectBox.position.copy(selectCenter);
        selectBox.scale.set(selectSize.x + 0.03, selectSize.y + 0.03, selectSize.z + 0.03);
        selectBox.visible = true;
        return;
      }
    }
    // a selected smoke emitter: framed around its marker
    const smokeIndex = editModeRef.current ? selectedSmokeRef.current : null;
    const smokeMarker = smokeIndex === null ? undefined : smokeMarkers.get(smokeIndex);
    if (smokeMarker) {
      frameObject(selectBox, smokeMarker, 0.05);
      selectBox.visible = true;
      return;
    }
    // a selected sound emitter: framed around its marker
    const soundIndex = editModeRef.current ? selectedSoundRef.current : null;
    const soundMarker = soundIndex === null ? undefined : soundMarkers.get(soundIndex);
    if (soundMarker) {
      // (not frameObject: the range ring under it is part of the marker, and would be framed too)
      selectBox.position.copy(soundMarker.position);
      selectBox.scale.setScalar(SOUND_ICON_SIZE * 1.15);
      selectBox.visible = true;
      return;
    }
    // a selected item: framed around its sprite
    const itemIndex = editModeRef.current ? selectedItemRef.current : null;
    const itemObj = itemIndex === null ? undefined : looseItems.get(itemIndex)?.obj;
    if (itemObj) {
      frameObject(selectBox, itemObj, 0.03);
      selectBox.visible = true;
      return;
    }
    // a selected prop: framed around its bounds
    const propIndex = editModeRef.current ? selectedPropRef.current : null;
    const prop = propIndex === null ? undefined : propObjects.get(propIndex);
    if (prop) {
      expandByPropModel(selectBounds.makeEmpty(), prop);
      selectBounds.getCenter(selectCenter);
      selectBounds.getSize(selectSize);
      selectBox.position.copy(selectCenter);
      selectBox.scale.set(selectSize.x + 0.04, selectSize.y + 0.04, selectSize.z + 0.04);
      selectBox.visible = true;
      return;
    }
    const selected = editModeRef.current ? selectedLightRef.current : null;
    const l = selected === null ? undefined : mapLightState.mapLights.find((m) => m.source === selected);
    selectBox.visible = !!l;
    if (!l) return;
    if (l.kind === "point") {
      selectBox.position.set(l.x, l.y * wallHeight, l.z);
      selectBox.scale.setScalar(0.14);
    } else {
      selectBox.position.set(l.x, ceilingY(Math.round(l.x), Math.round(l.z)) - 0.03, l.z);
      selectBox.scale.set(0.5, 0.05, 0.5);
    }
  }

  function updateEditHighlight() {
    const lamp = topdown.on && settingsRef.current.headlamp;
    const canEdit = editModeRef.current && !toolLocked();
    const hovered = canEdit || lamp ? hoverTarget(lamp) : null;
    const target = canEdit ? hovered : null;
    if (lamp) {
      const cursorLamp = getCursorLamp();
      if (cursorLamp) pointLight.position.copy(cursorLamp);
      else {
        const x = Math.round(topdown.x);
        const z = Math.round(topdown.z);
        pointLight.position.set(topdown.x, Math.min(floorY(x, z) + 0.75, ceilingY(x, z) - 0.08), topdown.z);
      }
    }
    reportHover(target);
    // dev: what's under the pointer, for the console and tests
    if (import.meta.env.DEV && !doorPreview) Object.assign(window, { __voidcrewEditTarget: target });
    const tool = editToolRef.current;
    let mode: "wall" | "plate" | "face" | "bulb" | "prop" | "decal" | "door" | "actor" | "item" | "smoke" | "sound" | null = null;
    let color = EDIT_FILL_COLOR;
    if (target) {
      if (tool === "select") {
        // any kind pointed at: the nearest, as a click would pick it
        mode = target.actor !== undefined ? "actor" : target.item !== undefined ? "item" : target.prop !== undefined ? "prop" : target.decal !== undefined ? "decal" : target.light !== undefined ? "bulb" : target.smoke !== undefined ? "smoke" : target.sound !== undefined ? "sound" : null;
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "texture") {
        mode = target.face ? "face" : target.kind === "wall" ? "wall" : "plate";
        color = EDIT_PAINT_COLOR;
      } else if (tool === "robot" && target.actor !== undefined) {
        mode = "actor";
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "door" && target.door) {
        mode = "door";
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "decal") {
        mode = target.decal !== undefined ? "decal" : target.face ? "face" : null;
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "prop" && (target.prop !== undefined || target.face)) {
        mode = target.prop !== undefined ? "prop" : "face";
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "item") {
        mode = target.item !== undefined ? "item" : null;
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "smoke") {
        mode = target.smoke !== undefined ? "smoke" : null;
        color = EDIT_LIGHT_ADD_COLOR;
      } else if (tool === "sound") {
        // a marker pointed at is picked; any other floor or ceiling gets a new emitter in its cell
        if (target.sound !== undefined) {
          mode = "sound";
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (target.kind !== "wall") {
          mode = "plate";
          color = EDIT_LIGHT_ADD_COLOR;
        }
      } else if (tool === "light") {
        // a light hangs in the cell's ceiling, so either surface of it works
        if (target.light !== undefined) {
          mode = "bulb";
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (target.kind !== "wall") {
          mode = "plate";
          const lit = mapLightState.litCells.has(`${target.cell.x},${target.cell.y}`);
          color = lit ? EDIT_LIGHT_REMOVE_COLOR : EDIT_LIGHT_ADD_COLOR;
        }
      } else if (target.kind === "wall") {
        // only Dig works on a wall (Fill's right button needs a floor)
        if (tool === "dig") {
          mode = "wall";
          color = EDIT_DIG_COLOR;
        }
      } else {
        mode = "plate";
        color = EDIT_FILL_COLOR;
      }
    }
    updateSelectionBox();
    editBox.visible = mode !== null;
    // an area being pasted: its outline on the floor, its top-left corner on the cell pointed at
    const ghost = areaGhostRef.current;
    if (ghost && target) {
      const base = target.kind === "wall" && target.from ? target.from : target.cell;
      editBox.visible = true;
      editBox.position.set(target.cell.x + (ghost.w - 1) / 2, floorY(base.x, base.y) + 0.02, target.cell.y + (ghost.h - 1) / 2);
      editBox.scale.set(ghost.w - 0.02, 0.04, ghost.h - 0.02);
      (editBox.material as THREE.LineBasicMaterial).color.setHex(0xffc400);
      return;
    }
    if (!target || !mode) return;
    const mat = editBox.material as THREE.LineBasicMaterial;
    if (mode === "actor") {
      const entry = actorMeshes.get(target.actor!);
      if (entry) frameObject(editBox, entry.mesh, 0.02);
    } else if (mode === "door") {
      const obj = doorGroups.get(`${target.door!.x},${target.door!.y}`);
      if (obj) frameObject(editBox, obj, 0.02);
    } else if (mode === "item") {
      const item = looseItems.get(target.item!);
      if (item) frameObject(editBox, item.obj, 0.02);
    } else if (mode === "smoke") {
      const marker = smokeMarkers.get(target.smoke!);
      if (marker) frameObject(editBox, marker, 0.03);
    } else if (mode === "sound") {
      const marker = soundMarkers.get(target.sound!);
      if (marker) {
        editBox.position.copy(marker.position);
        editBox.scale.setScalar(SOUND_ICON_SIZE * 1.1);
      }
    } else if (mode === "decal") {
      selectBounds.makeEmpty();
      for (const obj of group.children) {
        if (obj.userData.decalIndex === target.decal) selectBounds.expandByObject(obj);
      }
      selectBounds.getCenter(selectCenter);
      selectBounds.getSize(selectSize);
      editBox.position.copy(selectCenter);
      editBox.scale.set(selectSize.x + 0.02, selectSize.y + 0.02, selectSize.z + 0.02);
    } else if (mode === "prop") {
      const obj = propObjects.get(target.prop!);
      if (obj) {
        expandByPropModel(selectBounds.makeEmpty(), obj);
        selectBounds.getCenter(selectCenter);
        selectBounds.getSize(selectSize);
        editBox.position.copy(selectCenter);
        editBox.scale.set(selectSize.x + 0.02, selectSize.y + 0.02, selectSize.z + 0.02);
      }
    } else if (mode === "bulb") {
      const l = mapLightState.mapLights.find((m) => m.source === target.light);
      if (l) editBox.position.set(l.x, l.y * wallHeight, l.z);
      editBox.scale.setScalar(0.1);
    } else if (mode === "face") {
      // the step face: a thin slab on its plane, as tall as the step
      const { cell, side, part } = target.face!;
      const v = DIR_VECTOR[side];
      const far = { x: cell.x + v.x, y: cell.y + v.y };
      const bottom = part === "riser" ? floorY(cell.x, cell.y) : Math.max(floorY(cell.x, cell.y), ceilingY(far.x, far.y));
      const top = part === "riser" ? Math.min(ceilingY(cell.x, cell.y), floorY(far.x, far.y)) : ceilingY(cell.x, cell.y);
      editBox.position.set(cell.x + v.x * 0.5, (bottom + top) / 2, cell.y + v.y * 0.5);
      editBox.scale.set(v.x ? 0.06 : 0.98, Math.max(0.02, top - bottom - 0.02), v.y ? 0.06 : 0.98);
    } else if (mode === "wall") {
      // the wall block, as tall as the room it's dug from
      const from = target.from!;
      const bottom = floorY(from.x, from.y);
      const top = ceilingY(from.x, from.y);
      editBox.position.set(target.cell.x, (bottom + top) / 2, target.cell.y);
      editBox.scale.set(0.98, top - bottom - 0.02, 0.98);
    } else {
      // the surface the tool touches: its ceiling where the tool works on
      // one (the ceiling plate of a light's cell), else its floor
      const onCeiling = tool === "light" || ((tool === "texture" || tool === "height") && target.kind === "ceiling");
      const y = onCeiling ? ceilingY(target.cell.x, target.cell.y) - 0.02 : floorY(target.cell.x, target.cell.y) + 0.02;
      // the edge fence tool: the edge of the cell nearest the pointer, as a click would take it (none in the cell's middle)
      const side = tool === "fenceedge" && target.at ? sideFromPoint(target.at[0] - target.cell.x, target.at[1] - target.cell.y) : null;
      if (side) {
        const v = DIR_VECTOR[side];
        editBox.position.set(target.cell.x + v.x * 0.5, y + 0.08, target.cell.y + v.y * 0.5);
        editBox.scale.set(v.x ? 0.08 : 1, 0.2, v.y ? 0.08 : 1);
      } else {
        editBox.position.set(target.cell.x, y, target.cell.y);
        editBox.scale.set(0.98, 0.04, 0.98);
      }
    }
    mat.color.setHex(color);
  }

  function dispose() {
    selectBox.material.dispose();
    editBox.material.dispose();
  }
  return { updateEditHighlight, dispose };
}
