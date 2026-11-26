import { buildEditPreview, changedCells } from "../editPreview";
import { cellAt } from "../../game/map";
import { DIR_VECTOR } from "../../game/movement";
import { type GameMap } from "../../game/types";
import { isTextureSetId, type TextureSetId } from "../textureSets";
import { propCastsBakedShadow, useLightGrid } from "../lightGrid";
import { renderedSpecs } from "./sceneCache";
import * as THREE from "three";
import { wallVariantRoll } from "./walls";
import type { createLightFixtures } from "./lightFixtures";
import type { JoinedStrips } from "../cornerJoins";
import type { DecalLibrary } from "../decals";
import type { ViewportSettings } from "./settings";
import type { WallKit } from "./walls";
import type { createBakeRuntime } from "./bakeRuntime";
import type { createSkySurface } from "./skySurface";
import type { createSmokeFire } from "./smokeFire";

import type { RefObject } from "react";
import type { DoorType } from "../../game/doorTypes";
import type { LightGridUniforms } from "../lightGrid";

interface LiveEditsDeps {
  setLiveMap: (map: GameMap) => void;
  invalidateSight: () => void;
  invalidateCulling: () => void;
  getBackingObject: () => THREE.Object3D | null;
  accentKit: WallKit | null;
  accentSet: string;
  applyLightsRef: RefObject<((next: GameMap) => void) | null>;
  applyProps: (next: GameMap, prev: GameMap) => void;
  bakeRuntime: Pick<ReturnType<typeof createBakeRuntime>, "bakeSoon" | "bakeAfterLightEdit">;
  buildItems: (m: GameMap) => void;
  buildSoundMarkers: (m: GameMap) => void;
  ceilingKitAt: (x: number, y: number, m?: GameMap) => WallKit | null;
  ceilMat: THREE.MeshStandardMaterial;
  clearItems: () => void;
  decals: DecalLibrary;
  doorPreview: DoorType | undefined;
  facingSurfaces: THREE.Object3D[];
  floorKitAt: (x: number, y: number, m?: GameMap) => WallKit | null;
  floorMat: THREE.MeshStandardMaterial;
  group: THREE.Group;
  joinedStrips: JoinedStrips[];
  lightFixtures: Pick<ReturnType<typeof createLightFixtures>, "applyLights">;
  lightGrid: LightGridUniforms;
  map: GameMap;
  markSurface: (obj: THREE.Object3D) => void;
  primarySet: TextureSetId;
  settings: ViewportSettings;
  settingsRef: RefObject<ViewportSettings>;
  sky: Pick<ReturnType<typeof createSkySurface>, "skySurface">;
  smokeFire: Pick<ReturnType<typeof createSmokeFire>, "setWeatherMap" | "updateSmokeSpecs">;
  track: <T>(work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  wallHeight: number;
  wallKitFor: (setId: TextureSetId) => WallKit;
}

export function createLiveEdits(deps: LiveEditsDeps) {
  const { setLiveMap, invalidateSight, invalidateCulling, getBackingObject, accentKit, accentSet,
    applyLightsRef, applyProps, bakeRuntime, buildItems, buildSoundMarkers, ceilingKitAt, ceilMat, clearItems,
    decals, doorPreview, facingSurfaces, floorKitAt, floorMat, group, joinedStrips, lightFixtures, lightGrid,
    map, markSurface, primarySet, settings, settingsRef, sky, smokeFire, track, wallHeight, wallKitFor } = deps;
  // bumped whenever objects are swapped in place (see objectsAlong)
  let sceneVersion = 0;

  // A new version of the map with the same structure (see structureKey):
  // what differs in it is redone in place. Its robots need nothing here -
  // the scene draws them from the game's state.
  let applied = map;
  const lightsOf = (m: GameMap) => JSON.stringify([m.lights, m.lightGridDensity, m.lightGridAmbient]);
  // A structural edit (cells dug, filled, raised, repainted) while editing: the
  // scene isn't rebuilt at once (the walls' relief, the lights' bake...), it
  // shows a quick flat preview of what changed (see editPreview.ts) - the old
  // surfaces on the changed cells are taken off the camera's layer, flat
  // quads put in their place - and the light grid is baked roughly again.
  // The whole scene is rebuilt a few seconds after the last such edit (see
  // EDIT_SETTLE_MS), which drops all of this.
  let previewObjects: THREE.Object3D[] = [];
  let previewGeometries: THREE.BufferGeometry[] = [];
  let previewKey = map.structureKey;
  // (layer 1: not drawn, not picked - what a camera on layer 0 doesn't see)
  const setLayer = (obj: THREE.Object3D, layer: number) => obj.traverse((o) => o.layers.set(layer));
  function clearPreview() {
    for (const obj of previewObjects) {
      group.remove(obj);
      const i = facingSurfaces.indexOf(obj);
      if (i >= 0) facingSurfaces.splice(i, 1);
    }
    for (const geo of previewGeometries) geo.dispose();
    previewObjects = [];
    previewGeometries = [];
  }
  function applyStructure(next: GameMap) {
    clearPreview();
    const changed = changedCells(map, next);
    // (a map the quick look can't show never gets here - see the viewport's render)
    if (!changed) return;
    const edited = changed.size > 0;
    for (const obj of facingSurfaces) {
      const back = obj.userData.backCell as string | undefined;
      const hide = edited && (changed.has(obj.userData.cullCell as string) || (back !== undefined && changed.has(back)));
      if (!!obj.userData.editHidden !== hide) {
        obj.userData.editHidden = hide;
        setLayer(obj, hide ? 1 : 0);
      }
    }
    // (the black backing and the corner joins are merged meshes: none of their pieces can be left out)
    const backingObject = getBackingObject();
    if (backingObject) setLayer(backingObject, edited ? 1 : 0);
    for (const strips of joinedStrips) setLayer(strips.mesh, edited ? 1 : 0);
    if (edited) {
      const lit = (m: THREE.Material) => {
        useLightGrid(m, lightGrid);
        return m;
      };
      const built = buildEditPreview(next, changed, wallHeight, {
        floor: (x, y) => lit(floorKitAt(x, y, next)?.wallMat ?? floorMat),
        ceiling: (x, y) => {
          if ((next.ceilingTextureAt?.(x, y) ?? next.textures?.ceiling) === "sky") return sky.skySurface();
          return lit(ceilingKitAt(x, y, next)?.wallMat ?? ceilMat);
        },
        wall: (x, y, side) => {
          const v = DIR_VECTOR[side];
          const override = next.wallTextureAt?.(x, y);
          const own = cellAt(next, x + v.x, y + v.y) !== "wall" ? next.faceTextureAt?.(x, y, side) : undefined;
          const faceSet: string = isTextureSetId(own)
            ? own
            : isTextureSetId(override)
            ? override
            : accentKit && wallVariantRoll(x + v.x * 0.5, y + v.y * 0.5) < settings.accentRatio
              ? accentSet
              : primarySet;
          if (faceSet === "sky") return sky.skySurface();
          return lit(wallKitFor(faceSet as TextureSetId).wallMat);
        },
      });
      for (const mesh of built.objects) {
        group.add(mesh);
        mesh.updateMatrixWorld(true);
        markSurface(mesh);
      }
      previewObjects = built.objects;
      previewGeometries = built.geometries;
    }
    setLiveMap(edited ? next : map);
    // (what is in sight, and what each light reaches, follow the new cells)
    invalidateSight();
    sceneVersion++;
    // the light grid, roughly: the full bake comes with the rebuild
    bakeRuntime.bakeSoon();
    // dev: what the quick preview holds (flat quads drawn, old surfaces taken off)
    if (import.meta.env.DEV && !doorPreview) {
      Object.assign(window, { __voidcrewPreview: { changed: changed.size, quads: previewObjects.length, hidden: facingSurfaces.filter((o) => o.userData.editHidden).length } });
    }
  }
  const applyChanges = (next: GameMap) => {
    smokeFire.setWeatherMap(next);
    if (next.structureKey !== previewKey) {
      previewKey = next.structureKey;
      applyStructure(next);
    }
    const lightsChanged = lightsOf(next) !== lightsOf(applied);
    if (lightsChanged) {
      sceneVersion++;
      lightFixtures.applyLights(next);
      // the new fixtures get culled with the rest on the next frame
      invalidateCulling();
    }
    if (smokeFire.updateSmokeSpecs(next, applied)) sceneVersion++;
    // (the sounds' markers only: the sounds themselves are the audio system's)
    if (JSON.stringify(next.sounds) !== JSON.stringify(applied.sounds)) buildSoundMarkers(next);
    if (renderedSpecs(next.decals) !== renderedSpecs(applied.decals) && settingsRef.current.decalsEnabled) {
      // (decals: redone on the surfaces already there)
      track(decals.reset(next.decals ?? []));
    }
    if (renderedSpecs(next.items) !== renderedSpecs(applied.items)) {
      clearItems();
      buildItems(next);
    }
    if (renderedSpecs(next.props) !== renderedSpecs(applied.props)) {
      applyProps(next, applied);
      const shadowProps = (m: GameMap) => renderedSpecs((m.props ?? []).filter(propCastsBakedShadow));
      if (shadowProps(next) !== shadowProps(applied)) bakeRuntime.bakeSoon();
    }
    if (lightsChanged) {
      bakeRuntime.bakeAfterLightEdit();
    }
    applied = next;
  };
  applyLightsRef.current = applyChanges;

  function dispose() {
    if (applyLightsRef.current === applyChanges) applyLightsRef.current = null;
    clearPreview();
  }

  return { getSceneVersion: () => sceneVersion, bumpSceneVersion: () => { sceneVersion++; }, dispose };

}
