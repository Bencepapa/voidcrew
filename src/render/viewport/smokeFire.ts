import * as THREE from "three";
import { emittersShown } from "../../game/emitterStore";
import { fireLightColor, parseColor } from "../../game/lights";
import { cellAt, floorHeight } from "../../game/map";
import { PROP_TYPES, propHeight, propPlacement } from "../../game/props";
import type { GameMap } from "../../game/types";
import { cellKey } from "../../game/visibility";
import { createFireflies } from "../fireflies";
import { createGroundFog } from "../groundFog";
import type { LightGridUniforms } from "../lightGrid";
import { createMotes } from "../motes";
import { createPetals, type PetalEmitter } from "../petals";
import { createSmoke, type SmokeBody, type SmokeEmitter, type SmokeWorld } from "../smoke";
import type { SpriteEmitter } from "../spriteCloud";
import { createWeather } from "../weather";
import { SMOKE_COLOR } from "./constants";
import { FIRE_SMOKE_COLOR, FIRE_SMOKE_DENSITY, FIRE_SMOKE_LIFT, FIRE_SMOKE_SIZE } from "./lighting";
import type { ViewportSettings } from "./settings";
import { smokeShapeKey } from "./smokeShapeKey";

interface SmokeFireContext {
  scene: THREE.Scene;
  group: THREE.Group;
  camera: THREE.PerspectiveCamera;
  map: GameMap;
  getLatestMap(): GameMap;
  settings: ViewportSettings;
  lightGrid: LightGridUniforms;
  wallHeight: number;
  floorY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  geometries: THREE.BufferGeometry[];
  editModeRef: { readonly current: boolean };
  hiddenLayersRef: { readonly current: ReadonlySet<string> };
  selectedSmokeRef: { readonly current: number | null };
}

export function createSmokeFire(ctx: SmokeFireContext) {
  const {
    scene, group, camera, map, getLatestMap, settings, lightGrid, wallHeight, floorY, ceilingY,
    geometries, editModeRef, hiddenLayersRef, selectedSmokeRef,
  } = ctx;
  let particleFrame = 0;

  // ---- smoke (see smoke.ts): the map's emitters, and a marker at each for
  // the editor to pick it by (shown only while editing) ----
  const smokeMarkers = new Map<number, THREE.Mesh>();
  const smokeMarkerGeo = new THREE.OctahedronGeometry(0.04);
  geometries.push(smokeMarkerGeo);
  const smokeMarkerMat = new THREE.MeshBasicMaterial({ color: 0xb8c4cc, wireframe: true });
  // a ground fog's area while editing: a ring showing its spread on the floor under the emitter
  const fogRingMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide, fog: false });
  const fogHeightMat = new THREE.LineBasicMaterial({ color: 0x9fd4ff, depthTest: false, fog: false });
  // (and a line from it the way it blows)
  const smokeBlowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  geometries.push(smokeBlowGeo);
  const smokeBlowMat = new THREE.LineBasicMaterial({ color: 0xffd060 });
  // the fires' flames (see fire.ts), made with the smoke: each a fire
  // emitter here and dark smoke rising off it among the smoke's
  type FireEmitter = SmokeEmitter & { lightColor: number; lightIntensity: number; lightReach: number };
  const fireEmitters = new Map<number, FireEmitter>();
  const fireLight = (spec: NonNullable<GameMap["smokes"]>[number]) => ({
    lightColor: fireLightColor(spec),
    lightIntensity: spec.lightIntensity ?? 1,
    lightReach: spec.lightReach ?? 1,
  });
  let petalEmitters: SpriteEmitter[] = [];
  let moteEmitters: PetalEmitter[] = [], mistEmitters: SpriteEmitter[] = [], flyEmitters: SpriteEmitter[] = [];
  const effectColors = new Map<number, THREE.Color>();
  // which emitters are shown now (see emitterStore.ts: while playing only those that are on; the editor shows all)
  const shownSig = (m: GameMap) => emittersShown(m).map(Number).join("");
  let appliedShown = "";
  const buildSmoke = (m: GameMap) => {
    effectColors.clear();
    fireEmitters.clear();
    petalEmitters = []; moteEmitters = []; mistEmitters = []; flyEmitters = [];
    const shown = emittersShown(m);
    appliedShown = shownSig(m);
    return createSmoke(
    (m.smokes ?? []).flatMap((spec, index): SmokeEmitter[] => {
      const at = new THREE.Vector3(
        spec.cell.x + spec.pos[0],
        (floorHeight(map, spec.cell.x, spec.cell.y) + spec.pos[1]) * wallHeight,
        spec.cell.y + spec.pos[2],
      );
      const marker = new THREE.Mesh(smokeMarkerGeo, smokeMarkerMat);
      marker.position.copy(at);
      marker.userData.smokeIndex = index;
      marker.userData.item = true;
      marker.visible = false;
      group.add(marker);
      smokeMarkers.set(index, marker);
      let blow: [number, number, number] | undefined;
      if (spec.blow?.speed) {
        const yaw = (spec.blow.yaw * Math.PI) / 180;
        const pitch = ((spec.blow.pitch ?? 0) * Math.PI) / 180;
        const way = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        blow = [way.x * spec.blow.speed, way.y * spec.blow.speed, way.z * spec.blow.speed];
        const line = new THREE.Line(smokeBlowGeo, smokeBlowMat);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), way);
        line.scale.setScalar(0.1 + 0.1 * spec.blow.speed);
        marker.add(line);
      }
      // (an emitter that is switched off makes nothing - its marker stays for the editor)
      if (!shown[index]) return [];
      const emitter: SmokeEmitter = {
        x: at.x,
        y: at.y,
        z: at.z,
        ceiling: ceilingY(spec.cell.x, spec.cell.y),
        floor: floorY(spec.cell.x, spec.cell.y),
        blow,
        density: spec.density ?? 1,
        size: spec.size ?? 1,
        opacity: spec.opacity,
        opacityDark: spec.opacityDark,
        color: new THREE.Color(parseColor(spec.color) ?? SMOKE_COLOR),
        cell: cellKey(spec.cell.x, spec.cell.y),
      };
      const effect = spec.effect ?? (spec.petals ? "motes" : spec.fire ? "fire" : "smoke");
      effectColors.set(index, emitter.color);
      if (effect === "groundfog") {
        // (not pickable: a click on it is a click on the floor under it)
        const r = Math.max(0.25, spec.spread ?? 3);
        const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, r - 0.05), r, 96), fogRingMat);
        for (const shape of [ring]) {
          shape.rotation.x = -Math.PI / 2;
          shape.position.y = emitter.floor - at.y + 0.04;
          shape.renderOrder = 9;
          shape.raycast = () => {};
          shape.userData.fogShape = true;
          geometries.push(shape.geometry);
          marker.add(shape);
        }
        const base = emitter.floor - at.y + 0.04;
        const height = (spec.height ?? .6) * wallHeight;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, base, 0), new THREE.Vector3(0, base + height, 0),
          new THREE.Vector3(.12, base + height, 0),
        ]), fogHeightMat);
        line.userData.fogShape = true;
        line.raycast = () => {};
        line.renderOrder = 9;
        geometries.push(line.geometry);
        marker.add(line);
      }
      if (effect === "mist") return [{ ...emitter, standing: true, blow: undefined }];
      if (["motes", "petals", "groundfog", "fireflies"].includes(effect)) {
        // falling petals: their own little system, no smoke from here
        const list = effect === "motes" ? moteEmitters : effect === "groundfog" ? mistEmitters : effect === "fireflies" ? flyEmitters : petalEmitters;
        const color = new THREE.Color(parseColor(spec.color) ?? (effect === "fireflies" ? 0xd9ef78 : effect === "groundfog" ? 0xb4b8bc : effect === "petals" ? 0xffffff : 0xf4a6c0));
        effectColors.set(index, color);
        (list as SpriteEmitter[]).push({
          sprite: spec.sprite, height: (spec.height ?? .6) * wallHeight,
          x: emitter.x,
          y: emitter.y,
          z: emitter.z,
          floor: emitter.floor,
          spread: effect === "groundfog" ? spec.spread ?? 3 : .9,
          density: emitter.density,
          size: emitter.size,
          color,
          wind: blow ? [blow[0] * 0.1, blow[2] * 0.1] : [0, 0],
        });
        return [];
      }
      if (effect !== "fire") return [emitter];
      // (its color tints the flames: none, as they burn)
      emitter.color.setHex(parseColor(spec.color) ?? 0xffffff);
      fireEmitters.set(index, { ...emitter, ...fireLight(spec) });
      return [{
        ...emitter,
        y: Math.min(emitter.ceiling - 0.1, emitter.y + FIRE_SMOKE_LIFT * wallHeight),
        blow: undefined,
        density: emitter.density * FIRE_SMOKE_DENSITY,
        size: emitter.size * FIRE_SMOKE_SIZE,
        color: new THREE.Color(FIRE_SMOKE_COLOR),
      }];
    }),
    lightGrid,
    smokeWorld(m),
    { quality: settings.particleQuality },
  );
  };
  const buildFire = (m: GameMap) => createSmoke([...fireEmitters.values()], lightGrid, smokeWorld(m), { fire: true, quality: settings.particleQuality });
  // what the smoke bumps into: the deck's walls, floors and ceilings, and
  // its props as boxes (not the 45-degree cuts: a box would close their
  // whole corner)
  function smokeWorld(m: GameMap): SmokeWorld {
    // The cells' walls, floors and ceilings in flat arrays: every puff asks the world several times a frame, and a
    // lookup through cellAt / floorHeight was a sixth of the editor's frame time.
    const W = m.width;
    const H = m.height;
    const wallCell = new Uint8Array(W * H);
    const floorCell = new Float32Array(W * H);
    const ceilingCell = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        wallCell[y * W + x] = cellAt(m, x, y) === "wall" ? 1 : 0;
        floorCell[y * W + x] = floorY(x, y);
        ceilingCell[y * W + x] = ceilingY(x, y);
      }
    }
    return {
      // (outside the map: a wall, as cellAt says; floor 0 and a ceiling one wall height up, as the heights say)
      wall: (x, z) => {
        const cx = Math.round(x);
        const cz = Math.round(z);
        return cx < 0 || cz < 0 || cx >= W || cz >= H || wallCell[cz * W + cx] === 1;
      },
      floor: (x, z) => {
        const cx = Math.round(x);
        const cz = Math.round(z);
        return cx < 0 || cz < 0 || cx >= W || cz >= H ? 0 : floorCell[cz * W + cx];
      },
      ceiling: (x, z) => {
        const cx = Math.round(x);
        const cz = Math.round(z);
        return cx < 0 || cz < 0 || cx >= W || cz >= H ? wallHeight : ceilingCell[cz * W + cx];
      },
      boxes: (m.props ?? [])
        .filter((p) => PROP_TYPES[p.prop] && PROP_TYPES[p.prop].kind !== "chamfer" && PROP_TYPES[p.prop].kind !== "roof" && PROP_TYPES[p.prop].kind !== "fence")
        .map((p) => {
          const { x, z, reachX, reachZ } = propPlacement(p);
          const bottom = floorY(p.cell.x, p.cell.y) + (p.elevation ?? 0) * wallHeight;
          return {
            minX: x - reachX,
            maxX: x + reachX,
            minZ: z - reachZ,
            maxZ: z + reachZ,
            minY: bottom,
            maxY: bottom + propHeight(m, p) * wallHeight,
          };
        }),
    };
  }
  let smoke = buildSmoke(map);
  scene.add(smoke.mesh);
  let fire = buildFire(map);
  scene.add(fire.mesh);
  let petals = createPetals(petalEmitters, settings.particleQuality);
  scene.add(petals.mesh);
  let motes = createMotes(moteEmitters, settings.particleQuality);
  let mist = createGroundFog(mistEmitters, settings.particleQuality, lightGrid, (x,z)=>cellAt(getLatestMap(),x,z)!=="wall" && cellAt(getLatestMap(),x,z)!==undefined);
  let flies = createFireflies(flyEmitters, settings.particleQuality);
  const weather = createWeather(settings.particleQuality, lightGrid.weather);
  let weatherMap = map;
  scene.add(motes.mesh, mist.mesh, flies.mesh, weather.mesh);
  // the editor changed only the smoke: made anew, the rest stays built
  function applySmoke(next: GameMap) {
    for (const marker of smokeMarkers.values()) {
      group.remove(marker);
      marker.traverse((o) => {
        if (o.userData.fogShape) (o as THREE.Mesh).geometry.dispose();
      });
    }
    smokeMarkers.clear();
    scene.remove(smoke.mesh, fire.mesh, petals.mesh, motes.mesh, mist.mesh, flies.mesh);
    motes.dispose(); mist.dispose(); flies.dispose();
    smoke.dispose();
    fire.dispose();
    petals.dispose();
    smoke = buildSmoke(next);
    scene.add(smoke.mesh);
    fire = buildFire(next);
    scene.add(fire.mesh);
    petals = createPetals(petalEmitters, settings.particleQuality);
    scene.add(petals.mesh);
    motes = createMotes(moteEmitters, settings.particleQuality);
    mist = createGroundFog(mistEmitters, settings.particleQuality, lightGrid, (x,z)=>cellAt(getLatestMap(),x,z)!=="wall" && cellAt(getLatestMap(),x,z)!==undefined);
    flies = createFireflies(flyEmitters, settings.particleQuality);
    scene.add(motes.mesh, mist.mesh, flies.mesh);
    weatherMap = next;
  }

  function updateSmokeSpecs(next: GameMap, applied: GameMap): boolean {
    if (JSON.stringify(next.smokes) !== JSON.stringify(applied.smokes)) {
      if (smokeShapeKey(next) === smokeShapeKey(applied)) {
        next.smokes?.forEach((spec, index) => {
          const effect = spec.effect ?? (spec.petals ? "motes" : spec.fire ? "fire" : "smoke");
          const fallback = effect === "fire" || effect === "petals" ? 0xffffff : effect === "fireflies" ? 0xd9ef78 : effect === "motes" ? 0xf4a6c0 : effect === "groundfog" ? 0xb4b8bc : SMOKE_COLOR;
          effectColors.get(index)?.setHex(parseColor(spec.color) ?? fallback);
          const fire = fireEmitters.get(index);
          if (fire) Object.assign(fire, fireLight(spec));
        });
      } else {
        applySmoke(next);
        return true;
      }
    }
    return false;
  }

  function updateParticles(gameDt: number, t: number, s: ViewportSettings, cells: Set<string>, smokeBodies: SmokeBody[]) {
    const smokePhysics = { walls: s.smokeWalls, props: s.smokeProps, actors: s.smokeActors ? smokeBodies : null };
    // (with a lighter setting the particles are moved every 2nd or 3rd frame, by that many frames' time)
    particleFrame++;
    weather.update(gameDt, t, camera, weatherMap.weather, (x, z) => {
      const cell = cellAt(weatherMap,x,z);
      const open = (weatherMap.ceilingTextureAt?.(x,z) ?? weatherMap.textures?.ceiling) === "sky";
      return { floor:floorY(x,z), ceiling:open ? Infinity : ceilingY(x,z), valid:cell!==undefined && cell!=="wall", open };
    }, weatherMap);
    const every = Math.max(1, Math.round(s.particleEvery));
    if (every === 1 || particleFrame % every === 0) {
      const pdt = gameDt * every;
      smoke.update(pdt, camera, cells, s.ambientIntensity, s.smokeStyle, smokePhysics);
      fire.update(pdt, camera, cells, s.ambientIntensity, s.smokeStyle, smokePhysics);
      petals.update(pdt, t, camera);
      motes.update(pdt, t); mist.update(pdt, t, camera); flies.update(pdt, t, camera);
    }
  }

  function updateMarkers() {
    for (const marker of smokeMarkers.values()) {
      marker.visible = editModeRef.current && !hiddenLayersRef.current.has("smoke");
      // (a ground fog's area - ring and disc - shows only while its emitter is the one selected)
      const picked = marker.userData.smokeIndex === selectedSmokeRef.current;
      for (const child of marker.children) if (child.userData.fogShape) child.visible = picked;
    }
  }

  function setVisible(smokeShown: boolean) {
    smoke.mesh.visible = smokeShown;
    fire.mesh.visible = smokeShown;
    petals.mesh.visible = smokeShown;
    motes.mesh.visible = mist.mesh.visible = flies.mesh.visible = weather.mesh.visible = smokeShown;
  }

  function dispose() {
    scene.remove(smoke.mesh, fire.mesh, petals.mesh, motes.mesh, mist.mesh, flies.mesh);
    motes.dispose(); mist.dispose(); flies.dispose();
    petals.dispose();
    weather.dispose();
    smoke.dispose();
    fire.dispose();
    smokeMarkerMat.dispose();
  }

  function disposeMarkerDetails() {
    fogRingMat.dispose();
    fogHeightMat.dispose();
    smokeBlowMat.dispose();
  }
  return {
    smokeMarkers, fireEmitters, applySmoke, updateSmokeSpecs, updateParticles, updateMarkers, setVisible,
    shownChanged: (m: GameMap) => shownSig(m) !== appliedShown,
    getSmoke: () => smoke,
    setWeatherMap: (m: GameMap) => { weatherMap = m; },
    dispose, disposeMarkerDetails,
  };
}
