import * as THREE from "three";
import { itemSpot } from "../../game/items";
import type { Interaction, InteractionTarget } from "../../game/interactions";
import type { WallFacePart } from "../../game/mapGeometry";
import { DIR_VECTOR } from "../../game/movement";
import { PROP_TYPES, propHeight, propPlacement } from "../../game/props";
import type { Direction, GameMap, Vec2 } from "../../game/types";
import type { DecalLibrary } from "../decals";
import { lockMarkerMaterial } from "../lockMarker";
import { eventMarkerMaterial } from "./markers";

interface EventMarkersContext {
  scene: THREE.Scene;
  latestMapRef: { readonly current: GameMap };
  editModeRef: { readonly current: boolean };
  hiddenLayersRef: { readonly current: ReadonlySet<string> };
  decals: Pick<DecalLibrary, "pieceCount" | "center">;
  floorY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  wallHeight: number;
  interactionWallCenter(m: GameMap, cell: Vec2, side: Direction, part?: WallFacePart): THREE.Vector3 | undefined;
}

export function createEventMarkers(ctx: EventMarkersContext) {
  const { scene, latestMapRef, editModeRef, hiddenLayersRef, decals, floorY, ceilingY, wallHeight, interactionWallCenter } = ctx;

  const eventMarkers = new THREE.Group();
  const eventMaterials = new Map<Interaction["kind"], THREE.SpriteMaterial>();
  scene.add(eventMarkers);
  let markerMap: GameMap | undefined;
  let markerDecalCount = 0;
  let markerLayers: ReadonlySet<string> | undefined;
  function updateEventMarkers() {
    const m = latestMapRef.current;
    const hidden = hiddenLayersRef.current;
    eventMarkers.visible = !!editModeRef.current;
    if (!eventMarkers.visible) return;
    const decalCount = decals.pieceCount;
    if (markerMap === m && markerDecalCount === decalCount && markerLayers === hidden) return;
    markerMap = m;
    markerDecalCount = decalCount;
    markerLayers = hidden;
    eventMarkers.clear();
    const add = (target: InteractionTarget, event: Interaction, x: number, y: number, z: number) => {
      let material = eventMaterials.get(event.kind);
      if (!material) {
        material = eventMarkerMaterial(event.kind);
        eventMaterials.set(event.kind, material);
      }
      const sprite = new THREE.Sprite(material);
      sprite.userData.interactionTarget = target;
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(0.28);
      sprite.renderOrder = 100;
      eventMarkers.add(sprite);
    };
    for (const { cell, side, part, interaction } of m.wallInteractions ?? []) {
      const center = interactionWallCenter(m, cell, side, part);
      if (!center) continue;
      const v = DIR_VECTOR[side];
      const y = part ? center.y : floorY(cell.x, cell.y) + wallHeight * 0.55;
      add({ kind: "wall", cell, side, part }, interaction, center.x - v.x * 0.20, y, center.z - v.y * 0.20);
    }
    for (const door of m.doors ?? []) {
      if (!door.interaction) continue;
      const { x, y } = door.cell;
      const v = DIR_VECTOR[door.facing];
      for (const side of [-1, 1]) {
        const offset = (door.offset ?? 0) + side * 0.18;
        add({ kind: "door", cell: door.cell }, door.interaction, x + v.x * offset, floorY(x, y) + wallHeight * 0.72, y + v.y * offset);
      }
    }
    if (!hidden.has("decal")) m.decals?.forEach((spec, index) => {
      const { interaction } = spec;
      const center = interaction && decals.center(index);
      if (!interaction || !center) return;
      const position = center.clone();
      if (spec.surface === "floor") position.y += 0.16;
      else if (spec.surface === "ceiling") position.y -= 0.16;
      else {
        const v = DIR_VECTOR[spec.surface];
        position.x -= v.x * 0.16;
        position.z -= v.y * 0.16;
      }
      add({ kind: "decal", index }, interaction, position.x, position.y, position.z);
    });
    if (!hidden.has("prop")) m.props?.forEach((spec, index) => {
      if (!spec.interaction || !PROP_TYPES[spec.prop]) return;
      const { x, z, type } = propPlacement(spec);
      const lift = (type.elevation ?? 0) * (spec.scale ?? 1);
      const y = floorY(spec.cell.x, spec.cell.y) + ((spec.elevation ?? 0) + lift + propHeight(m, spec)) * wallHeight + 0.15;
      const inward = type.wall ? 0.3 : 0;
      add({ kind: "prop", index }, spec.interaction,
        THREE.MathUtils.lerp(x, spec.cell.x, inward), Math.min(y, ceilingY(spec.cell.x, spec.cell.y) - 0.14),
        THREE.MathUtils.lerp(z, spec.cell.y, inward));
    });
    if (!hidden.has("item")) m.items?.forEach((spec, index) => {
      if (!spec.interaction) return;
      const { x, y } = spec.cell;
      const [dx, dz] = itemSpot(spec.offset, index);
      add({ kind: "item", index }, spec.interaction, x + dx, floorY(x, y) + (spec.elevation ?? 0) * wallHeight + 0.25, y + dz);
    });
  }
  // a padlock over each locked prop, while editing (see game/propLocks.ts)
  const lockMarkers = new THREE.Group();
  const lockMaterial = lockMarkerMaterial();
  scene.add(lockMarkers);
  let lockMarkerMap: GameMap | undefined;
  let lockMarkerLayers: ReadonlySet<string> | undefined;
  function updateLockMarkers() {
    const m = latestMapRef.current;
    const hidden = hiddenLayersRef.current;
    lockMarkers.visible = !!editModeRef.current;
    if (!lockMarkers.visible || (lockMarkerMap === m && lockMarkerLayers === hidden)) return;
    lockMarkerMap = m;
    lockMarkerLayers = hidden;
    lockMarkers.clear();
    if (hidden.has("prop")) return;
    for (const spec of m.props ?? []) {
      if (!spec.lock || !PROP_TYPES[spec.prop]) continue;
      const { x, z, type } = propPlacement(spec);
      const lift = (type.elevation ?? 0) * (spec.scale ?? 1);
      const y = floorY(spec.cell.x, spec.cell.y) + ((spec.elevation ?? 0) + lift + propHeight(m, spec)) * wallHeight + 0.3;
      const inward = type.wall ? 0.3 : 0;
      const sprite = new THREE.Sprite(lockMaterial);
      sprite.position.set(THREE.MathUtils.lerp(x, spec.cell.x, inward), Math.min(y, ceilingY(spec.cell.x, spec.cell.y) - 0.12), THREE.MathUtils.lerp(z, spec.cell.y, inward));
      sprite.scale.setScalar(0.22);
      sprite.renderOrder = 101;
      lockMarkers.add(sprite);
    }
  }

  function dispose() {
    for (const material of eventMaterials.values()) {
      material.map?.dispose();
      material.dispose();
    }
  }

  return { eventMarkers, updateEventMarkers, updateLockMarkers, dispose };
}
