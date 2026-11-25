import * as THREE from "three";
import { generateLights, isSkyCeiling, parseColor, type LightSpec } from "../../game/lights";
import { cellKey } from "../../game/visibility";
import type { GameMap } from "../../game/types";
import type { ViewportSettings } from "./settings";
import type { WallKit } from "./walls";


const skyLightOf = (s: ViewportSettings) => ({
  color: parseColor(s.skyLightColor) ?? 0xa8bcff,
  intensity: s.skyLightIntensity,
  azimuth: s.skyLightAzimuth,
  elevation: s.skyLightElevation,
});
const ceilingLightCells = (lights: LightSpec[]) =>
  new Set(lights.filter((l) => l.kind === "ceiling").map((l) => `${Math.round(l.x)},${Math.round(l.z)}`));
// the color of each lit cell's ceiling lamp
const ceilingLightColors = (lights: LightSpec[]) =>
  new Map(lights.filter((l) => l.kind === "ceiling").map((l) => [`${Math.round(l.x)},${Math.round(l.z)}`, l.color]));
// the unsteady ceiling lamps (see lightEffects.ts) by cell: their index
// in mapLights - their panels glow with their light
const effectLampCells = (lights: LightSpec[]) =>
  new Map<string, number>(lights.flatMap((l, i) => (l.kind === "ceiling" && l.effect ? [[`${Math.round(l.x)},${Math.round(l.z)}`, i] as [string, number]] : [])));

export function createMapLightState(map: GameMap, settings: ViewportSettings) {
  let mapLights = generateLights(map, skyLightOf(settings));
  const cellsOf = (lights: LightSpec[]) => lights.map((l) => cellKey(Math.round(l.x), Math.round(l.z)));
  let lightCells = cellsOf(mapLights);
  let litCells = ceilingLightCells(mapLights);
  let litColors = ceilingLightColors(mapLights);
  let effectCells = effectLampCells(mapLights);
  // each such panel's own copy of its glowing material, and its glow
  const effectPanels = new Map<string, { mat: THREE.MeshStandardMaterial; base: number; light: number }>();

  function replace(next: GameMap, settings: ViewportSettings) {
    mapLights = generateLights(next, skyLightOf(settings));
    litCells = ceilingLightCells(mapLights);
    litColors = ceilingLightColors(mapLights);
    effectCells = effectLampCells(mapLights);
    for (const [key, panel] of effectPanels) if (effectCells.get(key.split("|")[0]) !== panel.light) effectPanels.delete(key);
    lightCells = cellsOf(mapLights);
  }

  return {
    get lightCells() { return lightCells; },
    get mapLights() { return mapLights; },
    get litCells() { return litCells; },
    get litColors() { return litColors; },
    get effectCells() { return effectCells; },
    effectPanels,
    replace,
  };
}

export function createLightFixtures(deps: {
  map: GameMap;
  group: THREE.Group;
  wallHeight: number;
  geometries: THREE.BufferGeometry[];
  floorStrips: THREE.Mesh[];
  ceilingKitAt: (x: number, y: number) => WallKit | null;
  ceilingY: (x: number, y: number) => number;
  lights: ReturnType<typeof createMapLightState>;
  ceilingTiles: readonly { cell: string; obj: THREE.Object3D; kit: WallKit; relief: boolean }[];
  ceilingMaterial: (kit: WallKit, relief: boolean, lit: boolean, color?: number, cell?: string) => THREE.Material | THREE.Material[];
}) {
  const {
    map, group, wallHeight, geometries, floorStrips, ceilingKitAt, ceilingY,
    lights, ceilingTiles, ceilingMaterial,
  } = deps;

  const ceilingFixtureGeo = new THREE.PlaneGeometry(0.26, 0.26);
  const floorFixtureGeo = new THREE.PlaneGeometry(0.3, 0.05);
  const bulbGeo = new THREE.SphereGeometry(0.022, 10, 8);
  geometries.push(bulbGeo);
  geometries.push(ceilingFixtureGeo, floorFixtureGeo);
  const fixtureMats = new Map<number, THREE.MeshBasicMaterial>();
  const fixtureMat = (color: number) => {
    let mat = fixtureMats.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      fixtureMats.set(color, mat);
    }
    return mat;
  };

  // (placed again when the lights change - see applyLights)
  const fixtures: THREE.Object3D[] = [];
  function placeFixtures() {
    for (const obj of fixtures) group.remove(obj);
    fixtures.length = 0;
    floorStrips.length = 0;
    for (const light of lights.mapLights) {
      if (light.kind === "ceiling") {
        // a textured ceiling brings its own glowing light panel
        if (ceilingKitAt(Math.round(light.x), Math.round(light.z))?.litMat) continue;
        // (no lamp panel on an open ceiling: it's the sky there)
        if (isSkyCeiling(map, Math.round(light.x), Math.round(light.z))) continue;
        const panel = new THREE.Mesh(ceilingFixtureGeo, fixtureMat(light.color));
        panel.rotation.x = Math.PI / 2;
        panel.position.set(light.x, ceilingY(Math.round(light.x), Math.round(light.z)) - 0.002, light.z);
        if (light.source !== undefined) panel.userData.mapLight = light.source;
        group.add(panel);
        fixtures.push(panel);
      } else if (light.kind === "point") {
        // a free-standing light: a glowing bulb (the editor picks it by it)
        const bulb = new THREE.Mesh(bulbGeo, fixtureMat(light.color));
        bulb.position.set(light.x, light.y * wallHeight, light.z);
        if (light.source !== undefined) bulb.userData.mapLight = light.source;
        bulb.userData.bulb = light.bulb ? "always" : "editor";
        group.add(bulb);
        fixtures.push(bulb);
      }
      // floor and wall glows have no fixture - the light itself reads as
      // a lit patch
    }
  }
  placeFixtures();

  // The editor changed only the deck's lights: the ceiling tiles' glowing
  // panels, the fixtures and the light pool follow, the rest stays built.
  // A pool slot keeps its light if the new set still has it.
  function applyLights(next: GameMap, settings: ViewportSettings) {
    lights.replace(next, settings);
    const { litCells, litColors } = lights;
    for (const tile of ceilingTiles) {
      const material = ceilingMaterial(tile.kit, tile.relief, litCells.has(tile.cell), litColors.get(tile.cell), tile.cell);
      tile.obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
      });
    }
    placeFixtures();
  }

  function updateVisibility(editing: boolean, hidden: boolean) {
    // Free-standing bulbs are shown to pick in the editor, and only when requested in game.
    for (const obj of fixtures) {
      obj.visible = !(editing && hidden) && (obj.userData.bulb !== "editor" || editing);
    }
  }

  function dispose() {
    for (const mat of fixtureMats.values()) mat.dispose();
  }

  return { applyLights, updateVisibility, dispose };
}
