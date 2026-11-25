import * as THREE from "three";
import { floorHeight } from "../../game/map";
import type { GameMap } from "../../game/types";
import { makeSoundIcon } from "../soundIcon";
import { makeExitMarker, makeStairsMarker } from "./markers";


// The sound sign grows past this distance so it stays readable from above.
export const SOUND_ICON_SIZE = 0.28;
const SOUND_ICON_FAR = 7;

interface EditorMarkersContext {
  group: THREE.Group;
  camera: THREE.PerspectiveCamera;
  map: GameMap;
  geometries: THREE.BufferGeometry[];
  floorY(x: number, z: number): number;
  wallHeight: number;
  reliefDepth: number;
  editModeRef: { readonly current: boolean };
  hiddenLayersRef: { readonly current: ReadonlySet<string> };
  selectedSoundRef: { readonly current: number | null };
}

export function createEditorMarkers(ctx: EditorMarkersContext) {
  const {
    group, camera, map, geometries, floorY, wallHeight, reliefDepth, editModeRef, hiddenLayersRef, selectedSoundRef,
  } = ctx;

  // ---- sound emitters (see sounds.ts): a marker at each for the editor to pick it by, shown only while editing
  // (nothing of them is built into the deck: they are heard, see audio/soundSystem.ts) ----
  // (the sign of a sound: a loudspeaker with sound waves on a plane that faces the camera - see render/soundIcon.ts; the
  // plane is what a click picks, the group round it holds the range ring)
  const soundMarkers = new Map<number, THREE.Group>();
  const soundMarkerGeo = new THREE.PlaneGeometry(1, 1);
  geometries.push(soundMarkerGeo);
  const soundIconTexture = makeSoundIcon();
  const soundMarkerMat = new THREE.MeshBasicMaterial({ map: soundIconTexture, alphaTest: 0.35, side: THREE.DoubleSide, fog: false });
  // the range, as a ring on the floor under the selected one
  const soundRingMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide, fog: false });
  const clearSoundMarkers = () => {
    for (const marker of soundMarkers.values()) {
      group.remove(marker);
      marker.traverse((o) => {
        if (o.userData.soundRing) (o as THREE.Mesh).geometry.dispose();
      });
    }
    soundMarkers.clear();
  };
  const buildSoundMarkers = (m: GameMap) => {
    clearSoundMarkers();
    (m.sounds ?? []).forEach((spec, index) => {
      const marker = new THREE.Group();
      const floor = floorY(spec.x, spec.y);
      marker.position.set(spec.x + (spec.pos?.[0] ?? 0), (floorHeight(m, spec.x, spec.y) + (spec.pos?.[1] ?? 0.5)) * wallHeight, spec.y + (spec.pos?.[2] ?? 0));
      marker.userData.soundIndex = index;
      marker.userData.item = true;
      marker.visible = false;
      const icon = new THREE.Mesh(soundMarkerGeo, soundMarkerMat);
      icon.scale.setScalar(SOUND_ICON_SIZE);
      icon.userData.soundIndex = index;
      icon.userData.soundIcon = true;
      marker.add(icon);
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, spec.range - 0.06), spec.range, 96), soundRingMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = floor - marker.position.y + 0.04;
      ring.renderOrder = 9;
      // (not pickable: a click on it is a click on the floor under it)
      ring.raycast = () => {};
      ring.userData.soundRing = true;
      ring.visible = false;
      marker.add(ring);
      group.add(marker);
      soundMarkers.set(index, marker);
    });
  };
  buildSoundMarkers(map);

  // ---- exits: a glowing plate on the floor of each way off the ship ----
  const exitMat = new THREE.MeshBasicMaterial({ map: makeExitMarker(), transparent: true, depthWrite: false, fog: true });
  const gateMat = new THREE.MeshBasicMaterial({ map: makeExitMarker(true), transparent: true, depthWrite: false, fog: true });
  const exitGeo = new THREE.PlaneGeometry(0.8, 0.8);
  geometries.push(exitGeo);
  // (by cell: the editor frames the selected one)
  const linkPlates = new Map<string, THREE.Object3D>();
  for (const exit of map.exits ?? []) {
    const plate = new THREE.Mesh(exitGeo, exit.to ? gateMat : exitMat);
    linkPlates.set(`${exit.cell.x},${exit.cell.y}`, plate);
    plate.rotation.x = -Math.PI / 2;
    // (just above the floor's relief)
    plate.position.set(exit.cell.x, floorY(exit.cell.x, exit.cell.y) + reliefDepth + 0.006, exit.cell.y);
    group.add(plate);
  }
  // stairs (see StairsSpec): such a plate each, by direction and style
  const stairsMats = new Map<string, THREE.MeshBasicMaterial>();
  for (const stairs of map.stairs ?? []) {
    const key = `${stairs.direction}-${stairs.style ?? "straight"}`;
    let mat = stairsMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map: makeStairsMarker(stairs.direction === "up", stairs.style === "spiral"), transparent: true, depthWrite: false, fog: true });
      stairsMats.set(key, mat);
    }
    const plate = new THREE.Mesh(exitGeo, mat);
    linkPlates.set(`${stairs.cell.x},${stairs.cell.y}`, plate);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(stairs.cell.x, floorY(stairs.cell.x, stairs.cell.y) + reliefDepth + 0.006, stairs.cell.y);
    group.add(plate);
  }

  function updateSoundMarkers() {
    for (const marker of soundMarkers.values()) {
      marker.visible = editModeRef.current && !hiddenLayersRef.current.has("sound");
      if (!marker.visible) continue;
      // (the range shows while its emitter is the one selected; the sign faces the camera, and grows with the distance
      // so it stays readable from the top-down view)
      const picked = marker.userData.soundIndex === selectedSoundRef.current;
      const grow = Math.max(1, camera.position.distanceTo(marker.position) / SOUND_ICON_FAR);
      for (const child of marker.children) {
        if (child.userData.soundRing) child.visible = picked;
        else if (child.userData.soundIcon) {
          child.quaternion.copy(camera.quaternion);
          child.scale.setScalar(SOUND_ICON_SIZE * grow);
        }
      }
    }
  }

  function updateLinkPlates(gameNow: number) {
    // the exits' plates throb
    exitMat.opacity = gateMat.opacity = 0.75 + 0.25 * Math.sin(gameNow / 420);
    for (const mat of stairsMats.values()) mat.opacity = exitMat.opacity;
  }

  function disposeLinkPlates() {
    exitMat.map?.dispose();
    exitMat.dispose();
    gateMat.map?.dispose();
    gateMat.dispose();
    for (const mat of stairsMats.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
  }

  function disposeSoundMarkers() {
    clearSoundMarkers();
    soundMarkerMat.dispose();
    soundIconTexture.dispose();
    soundRingMat.dispose();
  }

  return { soundMarkers, linkPlates, buildSoundMarkers, updateSoundMarkers, updateLinkPlates, disposeLinkPlates, disposeSoundMarkers };
}
