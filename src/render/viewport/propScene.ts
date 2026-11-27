import * as THREE from "three";
import { propEdit } from "../../editor/propEditState";
import { fenceFormOf, type FenceModelSpec } from "../../game/fences";
import { sourceKeys } from "../../game/operables";
import { operableView } from "../../game/operableStore";
import { PROP_TYPES, propHeight, propPlacement } from "../../game/props";
import type { GameMap, PropSpec } from "../../game/types";
import { setOperablePose } from "../operableModel";
import type { LightGridUniforms } from "../lightGrid";
import { isTextureSetId, type TextureSetId } from "../textureSets";
import type { createFenceMarkers } from "./fenceMarkers";
import { lightObjectMaterials } from "./materials";
import { propBuildKey } from "./propModelInputs";
import type { createPropModels } from "./propModels";
import { placePropShadow, propShadowMesh } from "./propShadows";
import { retextured } from "./propRetexture";
import type { createReliefGeometry } from "./reliefGeometry";
import type { createStructuralProps } from "./structuralProps";
import type { WallKit } from "./walls";

export function createPropScene(deps: {
  map: GameMap;
  group: THREE.Group;
  wallHeight: number;
  reliefDepth: number;
  primarySet: TextureSetId;
  floorY: (x: number, y: number) => number;
  puddleLift: number;
  wallKitFor: (id: TextureSetId) => WallKit;
  buildPillar: ReturnType<typeof createStructuralProps>["buildPillar"];
  buildChamfer: ReturnType<typeof createStructuralProps>["buildChamfer"];
  buildFence: ReturnType<typeof createPropModels>["buildFence"];
  buildPropTemplate: ReturnType<typeof createPropModels>["buildPropTemplate"];
  addPropLods: ReturnType<typeof createReliefGeometry>["addPropLods"];
  lightGrid: LightGridUniforms;
  track: <T>(work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  fences: Pick<ReturnType<typeof createFenceMarkers>, "clear" | "syncFenceMarker">;
  editModeRef: { current: boolean };
  propWiresRef: { current: (() => void) | null };
}) {
  const { map, group, wallHeight, reliefDepth, primarySet, floorY, wallKitFor, buildPillar, buildChamfer, buildFence, buildPropTemplate, addPropLods, lightGrid, track, fences, editModeRef, propWiresRef } = deps;

  const modelInputs = { wallHeight, primarySet, isTextureSetId, propTypes: PROP_TYPES, propHeight };

  // the billboard props (trees): turned to face the camera every frame
  const billboardProps: THREE.Object3D[] = [];
  // the props placed, by index in the map's props (the editor's selection)
  const propObjects = new Map<number, THREE.Object3D>();
  const markedProps = new Set<number>();
  // (built again, in place, when the props change - see applyProps)
  let propsVersion = 0;
  // The models, built once per deck and cloned for each prop: a type in a
  // texture, and a pillar or a chamfer per height and texture set too (see
  // propBuildKey). A prop dragged in the editor gets its model from here at
  // once instead of waiting for a new build at every step.
  const propModels = new Map<string, Promise<THREE.Group | null>>();
  async function finishModel(model: THREE.Group | null) {
    if (model) {
      await addPropLods(model);
      lightObjectMaterials(model, lightGrid);
    }
    return model;
  }
  function propModel(key: string): Promise<THREE.Group | null> {
    let made = propModels.get(key);
    if (made) return made;
    if (key.startsWith("fence|")) {
      const fenceMade = buildFence(JSON.parse(key.slice(6)) as FenceModelSpec).then(finishModel);
      propModels.set(key, fenceMade);
      return fenceMade;
    }
    const [name, texture, h, setId] = key.split("|");
    const type = retextured(PROP_TYPES[name], texture || undefined, isTextureSetId);
    const build =
      type.kind === "pillar"
        ? buildPillar(type, Number(h), setId)
        : type.kind === "chamfer"
          ? buildChamfer(type, wallKitFor(setId as TextureSetId), Number(h))
          : buildPropTemplate(type);
    made = build.then(finishModel);
    propModels.set(key, made);
    return made;
  }
  // a prop's object where its spec puts it
  function placeProp(obj: THREE.Object3D, spec: PropSpec) {
    const type = PROP_TYPES[spec.prop];
    const { x, z, yaw } = propPlacement(spec);
    const elevation = spec.elevation ?? 0;
    const surfaceLift = type.kind === "puddle" ? deps.puddleLift : 0;
    obj.position.set(x, floorY(spec.cell.x, spec.cell.y) + elevation * wallHeight + surfaceLift, z);
    obj.rotation.y = -yaw;
    // (bigger or smaller: a pillar only wider - it still fills its room)
    // (a fence or block piece is the size its settings say: its bodies don't scale)
    const scale = type.kind === "fence" ? 1 : spec.scale ?? 1;
    obj.scale.set(scale, type.kind === "pillar" ? 1 : scale, scale);
    placePropShadow(obj, type, elevation, reliefDepth + 0.006 - elevation * wallHeight);
  }
  // the props as last applied (a build finishing late places its prop where
  // the prop is by then, not where it was when the build began)
  let propSpecs: PropSpec[] = map.props ?? [];
  let propsMap = map;
  // One prop's object, built (or cloned from the model) and put in the scene
  // in place of the one it had, if any - which stays until then, so a prop
  // being rebuilt (a pillar dragged into a taller room) never blinks out.
  function buildProp(m: GameMap, index: number) {
    const spec = m.props?.[index];
    const definition = spec && PROP_TYPES[spec.prop];
    if (!spec || !definition) return;
    const texture = spec.texture ?? ("texture" in definition ? definition.texture : undefined);
    if (texture && /^(scifi|fantasy)_shared_/.test(texture) && !isTextureSetId(texture)) return;
    // (a fence's top and decoration textures too)
    if (definition.kind === "fence" && [spec.fence?.top, spec.fence?.deco?.texture].some((id) => id && /^(scifi|fantasy)_shared_/.test(id) && !isTextureSetId(id))) return;
    const version = propsVersion;
    const key = propBuildKey(m, spec, index, modelInputs);
    track(async () => {
      const made = await propModel(key);
      if (!made || version !== propsVersion) return;
      const now = propSpecs[index];
      // (changed again meanwhile into something else: that build places it)
      if (!now || !PROP_TYPES[now.prop] || propBuildKey(propsMap, now, index, modelInputs) !== key) return;
      const prop = made.clone();
      const shadow = propShadowMesh(prop);
      if (shadow) shadow.material = shadow.material.clone();
      placeProp(prop, now);
      prop.userData.prop = true;
      // the editor picks it by this (its index in the map's props)
      prop.userData.propIndex = index;
      prop.userData.propType = now.prop;
      prop.userData.propKey = key;
      const old = propObjects.get(index);
      if (old) {
        propShadowMesh(old)?.material.dispose();
        group.remove(old);
        const at = billboardProps.indexOf(old);
        if (at >= 0) billboardProps.splice(at, 1);
        markedProps.delete(index);
        // (a hidden layer stays hidden)
        prop.visible = old.visible;
      }
      if (PROP_TYPES[now.prop].kind === "billboard") billboardProps.push(prop);
      propObjects.set(index, prop);
      group.add(prop);
      if (PROP_TYPES[now.prop].kind === "operable") syncOperables(false);
      // (a fence's floor mark: shown while editing)
      fences.syncFenceMarker(index, prop);
      refreshPropWires();
    }).catch((err) => console.error("Prop build failed:", err));
  }
  function buildProps(m: GameMap) {
    propSpecs = m.props ?? [];
    propsMap = m;
    for (let index = 0; index < propSpecs.length; index++) buildProp(m, index);
  }
  buildProps(map);
  // The operable props' poses follow the game's state (see operableStore.ts): a lever down, a button sunk, a plate pressed
  function syncOperables(animate: boolean) {
    const view = operableView.get();
    const keys = sourceKeys(propsMap).props;
    for (const [index, obj] of propObjects) {
      if (PROP_TYPES[propSpecs[index]?.prop]?.kind !== "operable") continue;
      const key = keys.get(index);
      setOperablePose(obj, !!key && view.mapId === propsMap.id && !!view.on[key], animate);
    }
  }
  const offOperables = operableView.subscribe(() => syncOperables(true));
  // the props gone from the scene (before they're built anew)
  function clearProps() {
    propsVersion++;
    for (const obj of propObjects.values()) {
      propShadowMesh(obj)?.material.dispose();
      group.remove(obj);
    }
    propObjects.clear();
    fences.clear();
    billboardProps.length = 0;
    markedProps.clear();
  }
  // The map's props changed (the editor): a prop that's still the same model
  // (moved, turned, raised, scaled - into another cell too) is just set
  // again where it is now; one whose model changed (another type, texture,
  // or a pillar in a room of another height) is built anew in its place; an
  // added one is built. Only when props were taken out (the indices shift)
  // are they all built afresh (the models are cached, so it's quick).
  function applyProps(next: GameMap, prev: GameMap) {
    const a = next.props ?? [];
    const b = prev.props ?? [];
    if (a.length < b.length || a.some((spec, index) => !PROP_TYPES[spec.prop] && propObjects.has(index))) {
      clearProps();
      buildProps(next);
      return;
    }
    propSpecs = a;
    propsMap = next;
    a.forEach((spec, i) => {
      if (!PROP_TYPES[spec.prop]) return;
      // (a fence or block piece is looked at in any case: a neighbour changing changes its model)
      if (i < b.length && JSON.stringify(spec) === JSON.stringify(b[i]) && !fenceFormOf(spec.prop)) return;
      const obj = propObjects.get(i);
      const key = propBuildKey(next, spec, i, modelInputs);
      // (meanwhile the old one - or, still building, the new one once it's
      // there - stands where the prop is now)
      if (obj) placeProp(obj, spec);
      if (obj?.userData.propKey !== key) buildProp(next, i);
    });
  }

  // the prop editor's boxes (see propEditState) over each prop of the
  // type it edits, in the prop's own space: its boxes (the picked one
  // yellow) and its whole extent, seen through everything
  const wireMats = {
    part: new THREE.LineBasicMaterial({ color: 0x3fd0ff, depthTest: false, transparent: true, opacity: 0.85 }),
    picked: new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }),
    extent: new THREE.LineBasicMaterial({ color: 0x8a8f99, depthTest: false, transparent: true, opacity: 0.5 }),
  };
  function refreshPropWires() {
    for (const prop of propObjects.values()) {
      const old = prop.getObjectByName("propEditWires");
      if (!old) continue;
      prop.remove(old);
      old.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
    }
    const { name, part } = propEdit.get();
    const type = name ? PROP_TYPES[name] : undefined;
    if (!editModeRef.current || !type) return;
    const lift = (type.kind === "views" || type.kind === "panel" ? (type.elevation ?? 0) : 0) * wallHeight;
    const box = (min: number[], max: number[], mat: THREE.LineBasicMaterial) => {
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(max[0] - min[0], (max[1] - min[1]) * wallHeight, max[2] - min[2]));
      const lines = new THREE.LineSegments(geo, mat);
      lines.position.set((min[0] + max[0]) / 2, ((min[1] + max[1]) / 2) * wallHeight + lift, (min[2] + max[2]) / 2);
      lines.renderOrder = 10;
      return lines;
    };
    const [length, height, depth] = type.size;
    for (const prop of propObjects.values()) {
      if (prop.userData.propType !== name) continue;
      const wires = new THREE.Group();
      wires.name = "propEditWires";
      wires.add(box([-length / 2, 0, -depth / 2], [length / 2, height, depth / 2], wireMats.extent));
      if (type.kind === "views") type.parts.forEach((p, i) => wires.add(box(p.min, p.max, i === part ? wireMats.picked : wireMats.part)));
      prop.add(wires);
    }
  }
  propWiresRef.current = refreshPropWires;

  function dispose() {
    propsVersion++;
    offOperables();
    if (propWiresRef.current === refreshPropWires) propWiresRef.current = null;
    for (const prop of propObjects.values()) {
      propShadowMesh(prop)?.material.dispose();
      prop.getObjectByName("propEditWires")?.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
    }
    for (const mat of Object.values(wireMats)) mat.dispose();
  }

  return { propObjects, markedProps, billboardProps, applyProps, dispose };
}
