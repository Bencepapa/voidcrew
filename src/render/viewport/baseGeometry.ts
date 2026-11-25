import type { ViewportSettings } from "./settings";
import * as THREE from "three";
import { createBeveledWallGeometry } from "./walls";

interface BaseGeometryContext {
  settings: ViewportSettings;
  wallHeight: number;
}

export function createBaseGeometry({ settings, wallHeight }: BaseGeometryContext) {
  const WALL_SUBDIVISIONS = 10;
  // relief geometry needs the height map's pixels, so it's built once the
  // image has loaded; flat/beveled walls are ready immediately
  const geometries: THREE.BufferGeometry[] = [];
  let wallGeo: THREE.BufferGeometry | null = null;
  if (settings.wallProfile === "flat") {
    wallGeo = new THREE.PlaneGeometry(1, wallHeight, WALL_SUBDIVISIONS * 3, WALL_SUBDIVISIONS * 3);
  } else if (settings.wallProfile === "convex" || settings.wallProfile === "concave") {
    wallGeo = createBeveledWallGeometry(
      1,
      wallHeight,
      settings.bevelFraction,
      settings.bevelAngleDeg,
      settings.wallProfile === "convex" ? 1 : -1,
      WALL_SUBDIVISIONS,
    );
  }
  if (wallGeo) geometries.push(wallGeo);
  const floorGeo = new THREE.PlaneGeometry(1, 1);
  geometries.push(floorGeo);

  return { geometries, wallGeo, floorGeo };
}
