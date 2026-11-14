// A quick look at a map edited in the editor, while the scene's real build
// (relief walls, floors, lights) is left for later: the cells that changed
// since the scene was built, redrawn as flat quads - floors, ceilings, wall
// faces, step faces and headers - in the textures of their cells. The old
// surfaces they replace are taken off the camera's layer (see the viewport's
// applyStructure); a moment after the last edit the whole scene is rebuilt.

import * as THREE from "three";
import { cellAt, ceilingHeight, floorHeight, windowPanels } from "../game/map";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, GameMap } from "../game/types";
import { cellKey } from "../game/visibility";
import { WALL_ROTATION } from "./surfaces";

const DIRS: Direction[] = ["N", "E", "S", "W"];

// the part of a map the quick look can't show: doors, ladders, bridges,
// windows, chance walls and the deck's own textures change the scene's
// structure in ways it doesn't draw
const otherStructure = (m: GameMap) =>
  JSON.stringify([m.doors, m.ladders, m.bridges, m.chanceWalls, m.textures, m.reliefDepth, windowPanels(m)]);

// The cells whose own data differs between two versions of a map (type,
// heights, texture sets) - or null when they differ in more than that (a
// resized map, a door put in): the scene has to be rebuilt then.
export function changedCells(built: GameMap, next: GameMap): Set<string> | null {
  if (built.width !== next.width || built.height !== next.height) return null;
  if (otherStructure(built) !== otherStructure(next)) return null;
  const changed = new Set<string>();
  for (let y = 0; y < next.height; y++) {
    for (let x = 0; x < next.width; x++) {
      const same =
        cellAt(built, x, y) === cellAt(next, x, y) &&
        floorHeight(built, x, y) === floorHeight(next, x, y) &&
        ceilingHeight(built, x, y) === ceilingHeight(next, x, y) &&
        built.floorAt?.(x, y) === next.floorAt?.(x, y) &&
        built.wallTextureAt?.(x, y) === next.wallTextureAt?.(x, y) &&
        built.ceilingTextureAt?.(x, y) === next.ceilingTextureAt?.(x, y);
      if (!same) changed.add(cellKey(x, y));
    }
  }
  return changed;
}

export interface PreviewMaterials {
  // the material of a cell's floor, ceiling, or one wall face (the face of
  // the open cell, toward `side`)
  floor(x: number, y: number): THREE.Material;
  ceiling(x: number, y: number): THREE.Material;
  wall(x: number, y: number, side: Direction): THREE.Material;
}

export interface EditPreview {
  // the quads drawn, to be added to the scene
  objects: THREE.Mesh[];
  // freed with the preview
  geometries: THREE.BufferGeometry[];
}

// The flat quads for the changed cells of `next`: for every open cell that
// changed - or has a changed neighbour - its floor and ceiling (when it
// changed itself) and the faces on the sides where something did.
export function buildEditPreview(next: GameMap, changed: Set<string>, wallHeight: number, materials: PreviewMaterials): EditPreview {
  const objects: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const planes = new Map<number, THREE.PlaneGeometry>();
  // a plane of `h` wall heights showing the top `h` of the texture (the whole panel when it's 1)
  const plane = (h: number) => {
    const key = Math.round(h * 100);
    let geo = planes.get(key);
    if (!geo) {
      geo = new THREE.PlaneGeometry(1, h * wallHeight);
      const uv = geo.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - h + uv.getY(i) * h);
      planes.set(key, geo);
      geometries.push(geo);
    }
    return geo;
  };
  const floorGeo = new THREE.PlaneGeometry(1, 1);
  geometries.push(floorGeo);
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0);
    objects.push(mesh);
  };
  // a wall face from `bottom` to `top` (wall heights): whole panels from the end it hangs from, the rest in one more
  const face = (x: number, y: number, side: Direction, bottom: number, top: number, fromTop: boolean) => {
    const v = DIR_VECTOR[side];
    const mat = materials.wall(x, y, side);
    const length = top - bottom;
    for (let done = 0; done < length - 1e-6; done += 1) {
      const h = Math.min(1, length - done);
      const centre = fromTop ? top - done - h / 2 : bottom + done + h / 2;
      place(plane(h), mat, x + v.x * 0.5, centre * wallHeight, y + v.y * 0.5, 0, WALL_ROTATION[side]);
    }
  };
  for (let y = 0; y < next.height; y++) {
    for (let x = 0; x < next.width; x++) {
      if (cellAt(next, x, y) === "wall") continue;
      const here = changed.has(cellKey(x, y));
      const floor = floorHeight(next, x, y);
      const ceiling = ceilingHeight(next, x, y);
      if (here) {
        place(floorGeo, materials.floor(x, y), x, floor * wallHeight, y, -Math.PI / 2, 0);
        place(floorGeo, materials.ceiling(x, y), x, ceiling * wallHeight, y, Math.PI / 2, 0);
      }
      for (const side of DIRS) {
        const v = DIR_VECTOR[side];
        const nx = x + v.x;
        const ny = y + v.y;
        if (!here && !changed.has(cellKey(nx, ny))) continue;
        if (cellAt(next, nx, ny) === "wall") {
          face(x, y, side, floor, ceiling, false);
          continue;
        }
        const nFloor = floorHeight(next, nx, ny);
        const nCeiling = ceilingHeight(next, nx, ny);
        // a higher floor next door leaves a step face, a lower ceiling a header
        if (nFloor > floor) face(x, y, side, floor, Math.min(ceiling, nFloor), false);
        if (nCeiling < ceiling) face(x, y, side, Math.max(floor, nCeiling), ceiling, true);
      }
    }
  }
  return { objects, geometries };
}
