import * as THREE from "three";
import type { DecalLibrary } from "../decals";
import { WIRE_TILE, createWiredGlass, getStarfield } from "../space";
import type { TextureSetId } from "../textureSets";
import type { WallKit } from "./walls";
import { WINDOW_DEPTH, GLASS_TINT, GLASS_SHEEN, TRIM_TEXELS } from "./constants";
import type { createStructuralSurfaces } from "./structuralSurfaces";
import type { createReliefGeometry } from "./reliefGeometry";

interface StructuralTilesContext {
  group: THREE.Group;
  track: <T>(work: Promise<T> | (() => Promise<T>)) => Promise<T>;
  isRelief: boolean;
  wallHeight: number;
  floorKits: Map<TextureSetId, WallKit>;
  ceilingKits: Map<TextureSetId, WallKit>;
  floorDepth: number;
  windowSet: TextureSetId;
  windowKits: Map<TextureSetId, WallKit>;
  decals: DecalLibrary;
  geometries: THREE.BufferGeometry[];
  floorGeo: THREE.PlaneGeometry;
  markSurface: (obj: THREE.Object3D) => void;
  placeFloors: ReturnType<typeof createStructuralSurfaces>["placeFloors"];
  placeCeilings: ReturnType<typeof createStructuralSurfaces>["placeCeilings"];
  floorStrips: THREE.Mesh[];
  buildRelief: ReturnType<typeof createReliefGeometry>["buildRelief"];
  farReliefLevels: ReturnType<typeof createReliefGeometry>["farReliefLevels"];
}

export function createStructuralTiles({
  group, track, isRelief, wallHeight, floorKits, ceilingKits, floorDepth, windowSet, windowKits, decals,
  geometries, floorGeo, markSurface, placeFloors, placeCeilings, floorStrips, buildRelief,
  farReliefLevels,
}: StructuralTilesContext) {
  // Windows are always relief too: the frame panel with its opening cut
  // out, the opening's jambs reaching WINDOW_DEPTH back into the wall, and
  // the glass at the back of that recess. Through the glass: the starfield,
  // looked up by view direction, so it's infinitely far away from any
  // angle; the wired glass pattern darkens it, and an additive sheen
  // catches the lights' highlights.
  const wiredGlass = createWiredGlass();
  const spaceMat = new THREE.MeshBasicMaterial({
    envMap: getStarfield(),
    refractionRatio: 1,
    map: wiredGlass,
    color: GLASS_TINT,
    // stars are light sources: no fog on them
    fog: false,
  });
  const sheenMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.3,
    metalness: 0,
    transparent: true,
    // added on top, scaled down: a hint of glass, not a glare
    opacity: GLASS_SHEEN,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const [setId, windowKit] of windowKits) {
    // a wide window's pieces continue each other: no flush edge margins
    // (they'd flatten the mullions on the seams)
    track(buildRelief(windowKit, { height: wallHeight, flushEdges: setId === windowSet, holeBackZ: -WINDOW_DEPTH }))
      .then((frame) => {
        if (!frame) return;
        const hole = frame.holeBounds ?? { minX: -0.3, maxX: 0.3, minY: -0.13 * wallHeight, maxY: 0.22 * wallHeight };
        const w = hole.maxX - hole.minX;
        const h = hole.maxY - hole.minY;
        const glassGeo = new THREE.PlaneGeometry(w, h);
        // wire tiles at the walls' texel density
        const uv = glassGeo.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, (uv.getX(i) * w * TRIM_TEXELS) / WIRE_TILE, (uv.getY(i) * h * TRIM_TEXELS) / WIRE_TILE);
        }
        geometries.push(glassGeo);
        for (const slot of windowKit.slots) {
          const mesh = new THREE.Mesh(frame.geometry, [windowKit.wallMat, windowKit.sideMat]);
          mesh.position.set(slot.x, slot.y, slot.z);
          mesh.rotation.y = slot.rotY;
          for (const [mat, z] of [
            [spaceMat, -WINDOW_DEPTH + 0.01],
            [sheenMat, -WINDOW_DEPTH + 0.012],
          ] as const) {
            const glass = new THREE.Mesh(glassGeo, mat);
            glass.position.set((hole.minX + hole.maxX) / 2, (hole.minY + hole.maxY) / 2, z);
            mesh.add(glass);
          }
          group.add(mesh);
          markSurface(mesh);
          decals.registerSurface(slot.key, mesh);
          mesh.userData.eventPart = slot.part;
        }
      })
      .catch((err) => console.error("Window build failed:", err));
  }

  for (const ceilingKit of ceilingKits.values()) {
    if (isRelief) {
      track(
        buildRelief(ceilingKit, { height: 1, flushEdges: false }).then(async (relief) => [
          relief,
          relief ? await farReliefLevels(ceilingKit, { height: 1, flushEdges: false }) : [],
        ] as const),
      )
        .then(([relief, far]) => relief && placeCeilings(relief.geometry, far, ceilingKit, true))
        .catch((err) => console.error("Relief ceiling build failed:", err));
    } else {
      placeCeilings(floorGeo, [], ceilingKit, false);
    }
  }

  let floorTop = 0;
  for (const floorKit of floorKits.values()) {
    if (isRelief) {
      track(
        buildRelief(floorKit, { height: 1, flushEdges: false, floorEdges: true, depth: floorDepth }).then(async (relief) => [
          relief,
          relief ? await farReliefLevels(floorKit, { height: 1, flushEdges: false, floorEdges: true, depth: floorDepth }) : [],
        ] as const),
      )
        .then(([relief, far]) => {
          if (!relief) return;
          placeFloors(relief.geometry, far, [floorKit.wallMat, floorKit.sideMat], floorKit.slots);
          // keep the strips above the highest floor relief
          floorTop = Math.max(floorTop, relief.maxZ);
          for (const strip of floorStrips) strip.position.y = strip.userData.floorY + floorTop + 0.003;
        })
        .catch((err) => console.error("Relief floor build failed:", err));
    } else {
      placeFloors(floorGeo, [], floorKit.wallMat, floorKit.slots);
    }
  }

  return { wiredGlass, spaceMat, sheenMat };
}
