import * as THREE from "three";
import { DIR_VECTOR } from "../../game/movement";

import type { ActorState } from "../../game/actors";
import { PROP_TYPES } from "../../game/props";
import { hasClickables } from "../../game/operables";
import { actorInteraction, interactionAt, operableInteraction, sameInteractionCell, touchAt,
  type ClickEvent, type InteractionTarget, type WallInteractionTarget } from "../../game/interactions";
import { wallFaceSpans, type WallFacePart } from "../../game/mapGeometry";
import type { Direction, GameMap, Vec2 } from "../../game/types";
import { TOPDOWN_REACH } from "./camera";
import { EDIT_REACH } from "./editor";
import type { ActorEntry } from "./actorRendering";
import { drawnChain, seeThrough } from "./raycastObjects";

export function createInteractionRaycasts(deps: {
  group: THREE.Group;
  camera: THREE.Camera;
  topdown: { readonly on: boolean };
  latestMapRef: { readonly current: GameMap };
  lockedLayersRef: { readonly current: ReadonlySet<string> };
  editModeRef: { readonly current: boolean };
  interactionCallbacks: { readonly current: { onInteraction?: (event: ClickEvent) => boolean; interactionOpen?: boolean } };
  objectLayer: (obj: THREE.Object3D) => string | undefined;
  propObjects: ReadonlyMap<number, THREE.Object3D>;
  looseItems: ReadonlyMap<number, { obj: THREE.Object3D }>;
  decals: { center: (index: number) => THREE.Vector3 | undefined };
  getEventMarkers: () => THREE.Group;
  wallHeight: number;
  actorsRef: { readonly current: readonly ActorState[] };
  actorMeshes: ReadonlyMap<number, ActorEntry>;
  alphaAt: (typeName: string, u: number, v: number) => number;
}) {
  const {
    group, camera, topdown, latestMapRef, lockedLayersRef, editModeRef, interactionCallbacks,
    objectLayer, propObjects, looseItems, decals, getEventMarkers, wallHeight, actorsRef,
    actorMeshes, alphaAt,
  } = deps;

  const interactionRay = new THREE.Raycaster();
  const centerAim = new THREE.Vector2();
  const interactionReach = 1.8;
  const interactionAlpha = new WeakMap<THREE.Texture, ImageData | null>();
  const hitUv = new THREE.Vector2();
  function visibleTexel(hit: THREE.Intersection) {
    const material = (hit.object as THREE.Mesh).material;
    const face = Array.isArray(material) ? material[hit.face?.materialIndex ?? 0] : material;
    const map = (face as THREE.MeshBasicMaterial | undefined)?.map;
    if (!map || !face || !hit.uv || face.alphaTest === 0) return true;
    if (!interactionAlpha.has(map)) {
      const image = map.image as CanvasImageSource & { width: number; height: number };
      let pixels: ImageData | null = null;
      if (image?.width && image?.height) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        try {
          ctx?.drawImage(image, 0, 0);
          pixels = ctx?.getImageData(0, 0, image.width, image.height) ?? null;
        } catch {
          // Keep geometry picking for textures without readable CPU pixels.
        }
      }
      interactionAlpha.set(map, pixels);
    }
    const pixels = interactionAlpha.get(map);
    if (!pixels) return true;
    const { x, y } = map.transformUv(hitUv.copy(hit.uv));
    const column = THREE.MathUtils.clamp(Math.floor(x * pixels.width), 0, pixels.width - 1);
    const row = THREE.MathUtils.clamp(Math.floor(y * pixels.height), 0, pixels.height - 1);
    return pixels.data[(row * pixels.width + column) * 4 + 3] >= face.alphaTest * 255;
  }
  const interactable = (object: THREE.Object3D): InteractionTarget | undefined => {
    for (let o: THREE.Object3D | null = object; o && o !== group; o = o.parent) {
      const data = o.userData;
      if (typeof data.decalIndex === "number") return { kind: "decal", index: data.decalIndex };
      if (typeof data.propIndex === "number") return { kind: "prop", index: data.propIndex };
      if (typeof data.itemIndex === "number") return { kind: "item", index: data.itemIndex };
      if (data.actor === true && typeof data.actorId === "number") return { kind: "actor", index: data.actorId };
      if (data.doorCell) return { kind: "door", cell: data.doorCell as Vec2 };
      if (typeof data.eventSurface === "string") {
        const [x, y, side] = data.eventSurface.split(",");
        if (side === "N" || side === "E" || side === "S" || side === "W") {
          const part = data.eventPart ?? (o.parent instanceof THREE.LOD ? o.parent.userData.eventPart : undefined);
          return { kind: "wall", cell: { x: Number(x), y: Number(y) }, side, part };
        }
      }
    }
  };
  function findInteractionHit(ndc: THREE.Vector2, editing: boolean): { target: InteractionTarget | null; distance: number } | null {
    const m = latestMapRef.current;
    if (!editing && !m.wallInteractions?.length &&
        !m.doors?.some(d => d.interaction) && !m.decals?.some(d => d.interaction) &&
        !m.props?.some(p => p.interaction) && !m.items?.some(i => i.interaction) && !m.actors?.some(a => a.dialogue || a.shop) && !hasClickables(m)) return null;
    interactionRay.far = editing ? (topdown.on ? TOPDOWN_REACH : EDIT_REACH) : interactionReach;
    interactionRay.setFromCamera(ndc, camera);
    let solidDistance = Infinity;
    let solidTarget: InteractionTarget | null = null;
    for (const hit of interactionRay.intersectObjects(group.children, true)) {
      if (hit.distance > solidDistance + 0.03) break;
      if (!drawnChain(hit.object)) continue;
      const layer = objectLayer(hit.object);
      if (editing && layer && lockedLayersRef.current.has(layer)) continue;
      if (layer === "light" || layer === "smoke") continue;
      let target = interactable(hit.object);
      if (target?.kind === "actor") {
        // (an actor: only a friendly one to talk to, only where its sprite is solid, never in the editor)
        const id = target.index;
        const actor = actorsRef.current.find(a => a.id === id);
        if (editing || !actor || actor.diedAt !== null) target = undefined;
        else if (hit.uv && alphaAt(actor.type, hit.uv.x, hit.uv.y) < 128) continue;
      } else if (target && !visibleTexel(hit)) continue;
      if (target?.kind === "decal") {
        if (editing || touchAt(m, target)) return { target, distance: hit.distance };
        continue;
      }
      if (seeThrough(hit.object) && target?.kind !== "item") continue;
      if (solidDistance !== Infinity) continue;
      solidDistance = hit.distance;
      solidTarget = target ?? null;
    }
    return solidDistance < Infinity ? { target: solidTarget, distance: solidDistance } : null;
  }
  type UseCandidate = { event: ClickEvent; ndc: THREE.Vector2; distance: number; mount?: WallInteractionTarget };
  function activateInteraction(ndc: THREE.Vector2, source: "use" | "pointer", candidate?: UseCandidate) {
    const { onInteraction, interactionOpen } = interactionCallbacks.current;
    if (editModeRef.current || interactionOpen || !onInteraction) return false;
    const hit = findInteractionHit(ndc, false);
    const target = hit?.target;
    const event = target && touchAt(latestMapRef.current, target);
    if (event && (source === "pointer" || !event.clickOnly) && (!candidate || event === candidate.event)) {
      return onInteraction(event);
    }
    // A ray to the center can miss a narrow or openwork wall prop.
    // Accept its mounting face, or an unobstructed ray up to the prop.
    const mount = candidate?.mount;
    if (!candidate || !mount) return false;
    const mountedOnHit = target?.kind === "wall" && target.side === mount.side && sameInteractionCell(target.cell, mount.cell);
    const clearToProp = !hit || hit.distance > candidate.distance + 0.02;
    return (mountedOnHit || clearToProp) && onInteraction(candidate.event);
  }
  function interactionWallCenter(m: GameMap, cell: Vec2, side: Direction, part?: WallFacePart) {
    const span = wallFaceSpans(m, cell, side).find(span => span.part === part);
    if (!span) return undefined;
    const v = DIR_VECTOR[side];
    return new THREE.Vector3(cell.x + v.x * 0.5, (span.bottom + span.top) / 2 * wallHeight, cell.y + v.y * 0.5);
  }
  function useInteraction() {
    if (activateInteraction(centerAim, "use")) return true;
    if (editModeRef.current || interactionCallbacks.current.interactionOpen) return false;
    // Check nearby targets within 55 degrees of the player's facing.
    // The world-space angle keeps Use independent of the screen's FOV.
    const m = latestMapRef.current;
    const candidates: UseCandidate[] = [];
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    forward.normalize();
    const useSlope = Math.tan(THREE.MathUtils.degToRad(55));
    const bounds = new THREE.Box3();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    function consider(event: ClickEvent | undefined, point: THREE.Vector3, mount?: WallInteractionTarget) {
      if (!event || event.clickOnly) return;
      const relative = point.clone().sub(camera.position);
      const distance = relative.length();
      const ahead = forward.dot(relative);
      const sideways = Math.abs(forward.x * relative.z - forward.z * relative.x);
      if (distance > interactionReach || ahead <= 0 || sideways > ahead * useSlope) return;
      const projected = point.clone().project(camera);
      candidates.push({ event, ndc: new THREE.Vector2(projected.x, projected.y), distance, mount });
    }
    m.props?.forEach((spec, index) => {
      // (a lever or button is touched the same way)
      const interaction = spec.interaction ?? operableInteraction(spec, "prop", index);
      const object = interaction && propObjects.get(index);
      if (!object || !drawnChain(object)) return;
      bounds.setFromObject(object);
      bounds.getCenter(center);
      const anchor = spec.at[0];
      const side = anchor === "N" || anchor === "E" || anchor === "S" || anchor === "W" ? anchor : undefined;
      const mount: WallInteractionTarget | undefined = PROP_TYPES[spec.prop].wall && side
        ? { kind: "wall", cell: spec.cell, side }
        : undefined;
      consider(interaction, center, mount);
      bounds.getSize(size);
      const quarterWidth = (Math.abs(right.x) * size.x + Math.abs(right.z) * size.z) / 4;
      consider(interaction, center.clone().addScaledVector(right, quarterWidth));
      consider(interaction, center.clone().addScaledVector(right, -quarterWidth));
      consider(interaction, new THREE.Vector3(center.x, center.y + size.y / 4, center.z));
      consider(interaction, new THREE.Vector3(center.x, center.y - size.y / 4, center.z));
    });
    m.items?.forEach(({ interaction }, index) => {
      const object = interaction && looseItems.get(index)?.obj;
      if (object && drawnChain(object)) consider(interaction, bounds.setFromObject(object).getCenter(center));
    });
    // a friendly NPC to talk to: its sprite's middle, and a little above and below it
    for (const actor of actorsRef.current) {
      const entry = actorMeshes.get(actor.id);
      const event = actor.friendly && actor.diedAt === null && entry?.mesh.visible ? actorInteraction(m.actors?.[actor.id], actor.id) : undefined;
      if (!event || !entry) continue;
      bounds.setFromObject(entry.mesh);
      bounds.getCenter(center);
      bounds.getSize(size);
      consider(event, center);
      consider(event, new THREE.Vector3(center.x, center.y + size.y / 4, center.z));
      consider(event, new THREE.Vector3(center.x, center.y - size.y / 4, center.z));
    }
    m.decals?.forEach((spec, index) => {
      const interaction = spec.interaction ?? operableInteraction(spec, "decal", index);
      const point = interaction && decals.center(index);
      if (point) consider(interaction, point);
    });
    for (const { cell, side, part, interaction } of m.wallInteractions ?? []) {
      if (!part || interaction.clickOnly) continue;
      const point = interactionWallCenter(m, cell, side, part);
      if (point) consider(interaction, point);
    }
    candidates.sort((a, b) => Math.abs(a.ndc.x) - Math.abs(b.ndc.x) || a.distance - b.distance);
    return candidates.some(candidate => activateInteraction(candidate.ndc, "use", candidate));
  }

  const markerRay = new THREE.Raycaster();
  function pickEventMarker(ndc: THREE.Vector2): InteractionTarget | null {
    const eventMarkers = getEventMarkers();
    if (!eventMarkers.visible || !eventMarkers.children.length) return null;
    markerRay.far = topdown.on ? TOPDOWN_REACH : EDIT_REACH;
    markerRay.setFromCamera(ndc, camera);
    const hit = markerRay.intersectObjects(eventMarkers.children, false)[0];
    if (!hit) return null;
    const target = hit.object.userData.interactionTarget as InteractionTarget;
    const surface = findInteractionHit(ndc, true);
    if (surface && surface.distance + 0.03 < hit.distance) return null;
    return interactionAt(latestMapRef.current, target) ? target : null;
  }

  return { findInteractionHit, activateInteraction, useInteraction, pickEventMarker, interactionWallCenter };
}
