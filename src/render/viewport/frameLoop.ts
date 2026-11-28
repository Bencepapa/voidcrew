import { ACCENT_UNIFORMS } from "../accent";
import { actorHeight } from "../../game/actors";
import {
  AIM_CAMERA_TAU, AIM_FRAMING, AIM_MIN_FOV, type CamTarget, DOWN_EYE, DOWN_FALL_MS, DOWN_LOOK_UP, DOWN_ROLL,
  LIFT_DIP_MS, PEEK_IDLE_MS, PEEK_RETURN_TAU, SHAFT_LIGHT_INTENSITY, SHAFT_LIGHT_PERIOD_MS, SHAFT_LIGHT_SWEEP,
  STAIRS_RISE, STAIRS_WALK, TOPDOWN_FOV, TOPDOWN_REACH, TRANSIT_FADE_IN_S, verticalFov, zoomedFov,
} from "./camera";
import { cellAt, liftDoorOf } from "../../game/map";
import { climbPose, easeOutQuad, FALL_GRAVITY, FALL_START, jumpPose, lerp, smoothstep } from "./poses";
import { DIR_VECTOR } from "../../game/movement";
import { DOOR_OPEN_MS, NO_LAYERS, SURFACE_GLOW } from "./constants";
import { effectiveViewDistance } from "../graphics";
import { FIRE_LIGHT_INTENSITY, FIRE_LIGHT_LIFT } from "./lighting";
import { fogRange } from "./fog";
import { forwardOf } from "../../game/freeMovement";
import { gameClock } from "../../game/clock";
import { gameSound } from "../../audio/gameSound";
import { kitMaterials } from "./walls";
import { MAX_STEP } from "../../game/heights";
import { textureTuning } from "../textureTuning";
import * as THREE from "three";
import type { SmokeBody } from "../smoke";
import type { AccentUniforms } from "../accent";
import type { GameMap, Vec2 } from "../../game/types";
import type { DecalLibrary } from "../decals";
import type { ViewportSettings } from "./settings";
import type { WallKit } from "./walls";
import type { TopdownState } from "./sightView";
import type { ReliefStats, AimFrame, AimFocus, ViewportStats } from "./contracts";

import type { RefObject } from "react";
import type { PeekState } from "../../components/useViewControls";
import type { ActorState } from "../../game/actors";
import type { Weapon } from "../../game/combat";
import type { DoorType } from "../../game/doorTypes";
import type { FreePose } from "../../game/freeMovement";
import type { LiftRide, MapTransit } from "../../game/useGameState";
import type { LightGridUniforms } from "../lightGrid";

interface FrameLoopDeps {
  getLiveMap: () => GameMap;
  getSightCells: () => Set<string>;
  invalidateCulling: () => void;
  isDisposed: () => boolean;
  isReady: () => boolean;
  actorMeshes: ReturnType<typeof import("./actorRendering").createActorRendering>["actorMeshes"];
  actorsRef: RefObject<readonly ActorState[]>;
  aimFocusRef: RefObject<AimFocus | null>;
  aimFrameRef: RefObject<AimFrame | null>;
  aimingRef: RefObject<Weapon | null>;
  allKits: () => WallKit[];
  ambient: THREE.AmbientLight;
  animRef: RefObject<{ from: CamTarget; to: CamTarget; start: number; climb?: boolean; jumpSide?: Vec2; } | null>;
  applyMaterialViews: (s: ViewportSettings) => void;
  backingMat: THREE.MeshBasicMaterial;
  bakeRuntime: Pick<ReturnType<typeof import("./bakeRuntime").createBakeRuntime>, "updateProbeDebug">;
  billboardProps: THREE.Object3D[];
  camera: THREE.PerspectiveCamera;
  cavity: { value: number };
  ceilingY: (x: number, y: number) => number;
  cullFacing: () => void;
  decals: DecalLibrary;
  doorAnimsRef: RefObject<Map<string, { panel: THREE.Object3D; from: THREE.Vector3; fromYaw: number; start: number; }>>;
  doorPreview: DoorType | undefined;
  downAtRef: RefObject<number | null>;
  editModeRef: RefObject<boolean>;
  editorMarkers: Pick<ReturnType<typeof import("./editorMarkers").createEditorMarkers>, "updateSoundMarkers" | "updateLinkPlates">;
  facingSurfaces: THREE.Object3D[];
  fadeLevelRef: RefObject<number>;
  fadeRef: RefObject<HTMLDivElement | null>;
  fences: Pick<ReturnType<typeof import("./fenceMarkers").createFenceMarkers>, "syncFenceMarkers">;
  floorY: (x: number, y: number) => number;
  fog: THREE.Fog;
  fogBackground: THREE.Color;
  freeTickRef: RefObject<((dt: number) => FreePose) | undefined>;
  hiddenLayersRef: RefObject<ReadonlySet<string>>;
  itemsLoot: Pick<ReturnType<typeof import("./itemsLoot").createItemsLoot>, "hideItems">;
  latestMapRef: RefObject<GameMap>;
  layFlatSprites: () => void;
  lightFixtures: Pick<ReturnType<typeof import("./lightFixtures").createLightFixtures>, "updateVisibility">;
  lightGrid: LightGridUniforms;
  liveRef: RefObject<CamTarget>;
  map: GameMap;
  mapLightState: Pick<ReturnType<typeof import("./lightFixtures").createMapLightState>, "mapLights">;
  newMap: boolean;
  onStatsRef: RefObject<((stats: ViewportStats) => void) | undefined>;
  ownAccents: { hue: number; range: number; uniforms: AccentUniforms; }[];
  ownMaterials: THREE.MeshStandardMaterial[];
  peekRefRef: RefObject<RefObject<PeekState> | undefined>;
  pointLight: THREE.PointLight;
  postPipeline: Pick<ReturnType<typeof import("./postPipeline").createPostPipeline>, "renderGeometryView">;
  propObjects: Map<number, THREE.Object3D>;
  getReliefStats: () => ReliefStats | null;
  reflectionTest?: ReturnType<typeof import("./reflectionTestSphere").addReflectionTestSphere>;
  puddles: Pick<ReturnType<typeof import("./puddleProps").createPuddleProps>, "update" | "showCubeAt">;
  renderer: THREE.WebGLRenderer;
  rideRef: RefObject<LiftRide | null | undefined>;
  selectionBox: Pick<ReturnType<typeof import("./selectionBox").createSelectionBox>, "updateEditHighlight">;
  settings: ViewportSettings;
  settingsRef: RefObject<ViewportSettings>;
  setTopdown: (on: boolean) => void;
  shaftLight: THREE.PointLight;
  shipAccentRef: RefObject<number | null>;
  smokeBodies: SmokeBody[];
  smokeFire: Pick<ReturnType<typeof import("./smokeFire").createSmokeFire>, "fireEmitters" | "updateParticles" | "updateMarkers" | "setVisible">;
  topdown: TopdownState;
  topdownControls: { keys: Set<string>; dispose: () => void };
  transitRef: RefObject<MapTransit | null>;
  updateActors: (camX: number, camZ: number) => void;
  updateAimFrame: (weapon: Weapon, camX: number, camZ: number, aimZoom: number) => void;
  updateEventMarkers: () => void;
  updateLightPool: (party: { x: number; z: number; }, cam: { x: number; y: number; z: number; fwdX: number; fwdZ: number; }, intensityScale: number, dt: number) => void;
  updateLockMarkers: () => void;
  updateLoot: (camX: number, camZ: number, feetY: number) => void;
  updatePartyCover: (camX: number, floorY: number, camZ: number, eye: number) => void;
  updateTracers: () => void;
  wallHeight: number;
}

export function createFrameLoop(deps: FrameLoopDeps) {
  const { getLiveMap, getSightCells, invalidateCulling, isDisposed, isReady, actorMeshes, actorsRef,
    aimFocusRef, aimFrameRef, aimingRef, allKits, ambient, animRef, applyMaterialViews, backingMat,
    bakeRuntime, billboardProps, camera, cavity, ceilingY, cullFacing, decals, doorAnimsRef, doorPreview,
    downAtRef, editModeRef, editorMarkers, facingSurfaces, fadeLevelRef, fadeRef, fences, floorY, fog,
    fogBackground, freeTickRef, hiddenLayersRef, itemsLoot, latestMapRef, layFlatSprites, lightFixtures,
    lightGrid, liveRef, map, mapLightState, newMap, onStatsRef, ownAccents, ownMaterials, peekRefRef,
    pointLight, postPipeline, propObjects, getReliefStats, reflectionTest, puddles, renderer, rideRef, selectionBox, settings, settingsRef,
    setTopdown, shaftLight, shipAccentRef, smokeBodies, smokeFire, topdown, topdownControls, transitRef,
    updateActors, updateAimFrame, updateEventMarkers, updateLightPool, updateLockMarkers, updateLoot,
    updatePartyCover, updateTracers, wallHeight } = deps;
  let raf = 0;
  let fogColorNow = settings.fogColor;
  let headlampColorNow = settings.headlampColor;
  const inspectMaterialDefaults = new WeakMap<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  const startedAt = performance.now();
  let lastFrameAt = startedAt;
  let lastStatsAt = 0;
  // frames counted for the fps
  let fpsFrames = 0;
  let fpsSince = performance.now();

  // aiming camera (see renderFrame): how far it's turned to the target
  // (0..1), where it looks, and its field of view there
  let aimBlend = 0;
  const aimLookAt = new THREE.Vector3();
  let aimFov = verticalFov(settings.fov, camera.aspect);
  let aimFovGoal = aimFov;
  let aimZoom = 1;

  let waterLightsAt = -1e9;
  // (whether a layer was hidden last frame: showing it again needs one pass)
  let hiddenApplied = false;
  function renderFrame() {
    bakeRuntime.updateProbeDebug();
    updateEventMarkers();
    updateLockMarkers();
    const s = settingsRef.current;
    const now = performance.now();
    const t = (now - startedAt) / 1000;
    // standing water: its ripples' clock, and the few lights nearest the eye
    // it glints with (the map's, and the fires')
    decals.waterUniforms.uTime.value = t;
    if (now - waterLightsAt > 250) {
      waterLightsAt = now;
      const eye = camera.position;
      const lights = [
        ...mapLightState.mapLights
          .filter((l) => l.kind !== "window")
          .map((l) => ({ x: l.x, y: l.y * wallHeight, z: l.z, color: l.color, intensity: l.intensity })),
        ...[...smokeFire.fireEmitters.values()].filter(e => e.lightIntensity > 0).map(e => ({
          x: e.x, y: e.y + FIRE_LIGHT_LIFT * wallHeight, z: e.z, color: e.lightColor,
          intensity: FIRE_LIGHT_INTENSITY * e.lightIntensity * 0.5,
        })),
      ];
      lights.sort((a, b) => (a.x - eye.x) ** 2 + (a.z - eye.z) ** 2 - ((b.x - eye.x) ** 2 + (b.z - eye.z) ** 2));
      decals.setWaterLights(lights);
    }
    // capped so a stall (tab switch, breakpoint) doesn't teleport the
    // free-moving player through a wall
    const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    // the world's own time (bullet time slows it - see clock.ts): what
    // moves in it - its doors, smoke, flickering lights, flashes, loot -
    // goes by this; the party's own moves and looking round by real time
    const gameNow = gameClock.now();
    const gameDt = dt * gameClock.rate();

    const anim = animRef.current;
    const freeTick = freeTickRef.current;
    let cam: CamTarget;
    // free movement puts the eye right at the pose; grid movement pulls it
    // back from the cell center
    let pullback = s.cameraPullback;
    if (freeTick) {
      const pose = freeTick(dt);
      const f = forwardOf(pose.yaw);
      cam = { x: pose.x, z: pose.z, tx: pose.x + f.x, tz: pose.z + f.z, y: pose.y };
      animRef.current = null;
      pullback = 0;
    } else if (anim?.jumpSide) {
      const { cam: jumpCam, done } = jumpPose(anim.from, anim.to, anim.jumpSide, now - anim.start, s.moveDurationMs);
      cam = jumpCam;
      if (done) animRef.current = null;
    } else if (anim?.climb) {
      const { cam: climbCam, done } = climbPose(anim.from, anim.to, now - anim.start, s.moveDurationMs);
      cam = climbCam;
      if (done) animRef.current = null;
    } else if (anim) {
      const elapsed = now - anim.start;
      const p = Math.min(1, elapsed / s.moveDurationMs);
      const e = easeOutQuad(p);
      // stepping off a ledge: walk out over the edge, then fall -
      // accelerating, so the landing reads as a drop rather than a slide
      const drop = anim.from.y - anim.to.y;
      let y = lerp(anim.from.y, anim.to.y, e);
      let done = p >= 1;
      if (drop > MAX_STEP + 1e-6) {
        const fallMs = 1000 * Math.sqrt((2 * drop) / FALL_GRAVITY);
        const f = Math.min(1, Math.max(0, (elapsed - s.moveDurationMs * FALL_START) / fallMs));
        y = anim.from.y - drop * f * f;
        done = done && f >= 1;
      }
      cam = {
        x: lerp(anim.from.x, anim.to.x, e),
        z: lerp(anim.from.z, anim.to.z, e),
        tx: lerp(anim.from.tx, anim.to.tx, e),
        tz: lerp(anim.from.tz, anim.to.tz, e),
        y,
      };
      if (done) animRef.current = null;
    } else {
      cam = liveRef.current;
    }
    liveRef.current = cam;

    // Stairs taken (see MapTransit): the eye walks on ahead and climbs or sinks
    // a floor's worth, turning half round on a spiral - while the sheet fades
    // to black. (Laid over the pose after it is kept, so arriving starts clean.)
    let stairsYaw = 0;
    const stairsRide = transitRef.current?.kind === "stairs" ? transitRef.current : null;
    if (stairsRide && now - stairsRide.start < stairsRide.duration) {
      const e = smoothstep(0, 1, (now - stairsRide.start) / stairsRide.duration);
      const len = Math.hypot(cam.tx - cam.x, cam.tz - cam.z) || 1;
      const walk = (STAIRS_WALK * e) / len;
      const dy = (stairsRide.up ? 1 : -1) * STAIRS_RISE * e;
      cam = { x: cam.x + (cam.tx - cam.x) * walk, z: cam.z + (cam.tz - cam.z) * walk, tx: cam.tx + (cam.tx - cam.x) * walk, tz: cam.tz + (cam.tz - cam.z) * walk, y: cam.y + dy };
      if (stairsRide.spiral) stairsYaw = (stairsRide.up ? 1 : -1) * Math.PI * e;
    }

    for (const [key, anim] of doorAnimsRef.current) {
      const p = Math.min(1, (gameNow - anim.start) / DOOR_OPEN_MS);
      const target: THREE.Vector3 = anim.panel.userData.open ? anim.panel.userData.openPos : anim.panel.userData.closedPos;
      const eased = easeOutQuad(p);
      anim.panel.position.lerpVectors(anim.from, target, eased);
      anim.panel.rotation.y = lerp(anim.fromYaw, anim.panel.userData.open ? anim.panel.userData.openYaw : 0, eased);
      if (p >= 1) doorAnimsRef.current.delete(key);
    }

    // A lift ride: the cabin shakes (easing in and out), its lights dip
    // while the next deck is swapped in, and shaft lights sweep past
    // outside the door - downward while riding up, upward riding down.
    const ride = rideRef.current;
    let shake = 0;
    let rideDip = 1;
    let rideElapsed = 0;
    if (ride) {
      rideElapsed = now - ride.start;
      const p = rideElapsed / ride.duration;
      shake = smoothstep(0, 0.1, p) * (1 - smoothstep(0.85, 1, p));
      rideDip = 1 - 0.85 * (1 - smoothstep(0, LIFT_DIP_MS, Math.abs(rideElapsed - ride.swapAt)));
    }
    // A change of map (a gate): the view fades to black, stays black while the
    // next map loads (the loading screen covers it by then), and clears once
    // the party has arrived
    const transitNow = transitRef.current;
    if (transitNow) fadeLevelRef.current = smoothstep(transitNow.fadeFrom, 1, (now - transitNow.start) / transitNow.duration);
    else if (fadeLevelRef.current > 0) fadeLevelRef.current = Math.max(0, fadeLevelRef.current - dt / TRANSIT_FADE_IN_S);
    if (fadeRef.current) fadeRef.current.style.opacity = String(fadeLevelRef.current);
    const shakeY = shake * (Math.sin(t * 37) * 0.006 + Math.sin(t * 23.3) * 0.004);
    // steady while editing: the bob sways the view enough to move what's
    // under the pointer between the floor and the ceiling - and with it
    // the surface (and the palette) a click would work on
    const bob = s.bobEnabled && !editModeRef.current ? 1 : 0;
    const bobY = bob * Math.sin((t * 2 * Math.PI) / 3.2) * 0.035 + shakeY;
    const bobRoll = bob * Math.cos((t * 2 * Math.PI) / 1.6) * 0.015 + shake * Math.sin(t * 29) * 0.004;

    const fwdX = cam.tx - cam.x;
    const fwdZ = cam.tz - cam.z;
    const fwdLen = Math.hypot(fwdX, fwdZ) || 1;

    // the normal field of view (the aiming camera narrows it, below)
    const fov = verticalFov(s.fov, camera.aspect);

    // glance-around (grid movement only): ease back to center once idle,
    // then turn the head by the offset around the eye
    const peek = peekRefRef.current?.current;
    let peekYaw = 0;
    if (peek && !freeTick) {
      if (!peek.held && now - peek.lastInputAt > PEEK_IDLE_MS) {
        peek.offset *= Math.exp(-dt / PEEK_RETURN_TAU);
        if (Math.abs(peek.offset) < 1e-3) peek.offset = 0;
      }
      peekYaw = peek.offset;
    }
    peekYaw += stairsYaw;
    // rotating the facing clockwise (seen from above) by peekYaw
    const fx = fwdX / fwdLen;
    const fz = fwdZ / fwdLen;
    const cos = Math.cos(peekYaw);
    const sin = Math.sin(peekYaw);
    const lookX = fx * cos - fz * sin;
    const lookZ = fz * cos + fx * sin;
    // the eye pulled back from the cell center against where it looks -
    // peeking included, so a glance circles the center just as a turn
    // does, and a peek that becomes a turn doesn't move the eye
    const camX = cam.x - lookX * pullback;
    const camZ = cam.z - lookZ * pullback;

    // dev-only: the view's actual heading, for checking turn continuity
    if (import.meta.env.DEV && !doorPreview) Object.assign(window, { __voidcrewViewYaw: Math.atan2(lookX, -lookZ) });

    // the crew down: the eye falls to the floor (faster and faster, a
    // little bounce) and the head rolls onto its side, looking up a bit
    const downAtMs = downAtRef.current;
    const down = downAtMs === null ? 0 : Math.min(1, (now - downAtMs) / DOWN_FALL_MS);
    const fall = down < 0.8 ? (down / 0.8) ** 2 : 1 - Math.sin(((down - 0.8) / 0.2) * Math.PI) * 0.08;
    const standY = cam.y * wallHeight + s.eyeHeight + bobY * (1 - down);
    const eyeY = standY + (cam.y * wallHeight + DOWN_EYE - standY) * fall;
    camera.position.set(camX, eyeY, camZ);

    // aiming: turn to the target and zoom - framing it while a part is
    // picked, at the weapon's zoom for the mini-game - easing in and out
    const focus = aimFocusRef.current;
    const aimWeapon = aimingRef.current;
    const focused = aimWeapon && focus?.target != null ? actorMeshes.get(focus.target) : undefined;
    if (focused && aimWeapon) {
      const actor = actorsRef.current.find((a) => a.id === focus!.target);
      aimLookAt.copy(focused.mesh.position);
      const dist = Math.max(0.3, aimLookAt.distanceTo(camera.position));
      const h = actor ? actorHeight(actor.type) * wallHeight : 0.8;
      const framing = THREE.MathUtils.radToDeg(2 * Math.atan((h * AIM_FRAMING) / 2 / dist));
      aimFovGoal =
        focus!.phase === "pick"
          ? Math.min(fov, Math.max(AIM_MIN_FOV, framing))
          : Math.max(AIM_MIN_FOV, zoomedFov(fov, aimWeapon.aimZoom ?? 1));
    }
    aimBlend += ((focused ? 1 : 0) - aimBlend) * (1 - Math.exp(-dt / AIM_CAMERA_TAU));
    aimFov += (aimFovGoal - aimFov) * (1 - Math.exp(-dt / AIM_CAMERA_TAU));
    if (!focused) aimFovGoal = fov;
    const viewFov = topdown.on ? TOPDOWN_FOV : fov + (aimFov - fov) * aimBlend;
    if (Math.abs(camera.fov - viewFov) > 1e-3) {
      camera.fov = viewFov;
      camera.updateProjectionMatrix();
    }
    aimZoom = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.tan(THREE.MathUtils.degToRad(viewFov) / 2);
    // editing: the view looks up or down as dragged (the look target is a
    // unit ahead, so the lift is the pitch's tangent)
    if (peek && !editModeRef.current) peek.pitch = 0;
    const editPitchLift = peek && editModeRef.current ? Math.tan(peek.pitch) : 0;
    camera.lookAt(
      camX + lookX + (aimLookAt.x - camX - lookX) * aimBlend,
      eyeY + (aimLookAt.y - eyeY) * aimBlend + DOWN_LOOK_UP * fall + editPitchLift,
      camZ + lookZ + (aimLookAt.z - camZ - lookZ) * aimBlend,
    );
    camera.rotateZ(bobRoll * (1 - aimBlend) + DOWN_ROLL * fall);
    if (topdown.on && !editModeRef.current) setTopdown(false);
    if (topdown.on) {
      // (it starts over the party)
      if (topdown.fresh) {
        topdown.fresh = false;
        topdown.x = cam.x;
        topdown.z = cam.z;
      }
      // the view's panning keys (WASD / arrows, the heading's frame; Shift: faster), Q / E turn it
      const move = topdownControls.keys;
      const speed = topdown.h * 0.9 * (move.has("Shift") ? 2.5 : 1) * dt;
      const sy = Math.sin(topdown.yaw);
      const cy = Math.cos(topdown.yaw);
      const forward = (move.has("w") || move.has("arrowup") ? 1 : 0) - (move.has("s") || move.has("arrowdown") ? 1 : 0);
      const right = (move.has("d") || move.has("arrowright") ? 1 : 0) - (move.has("a") || move.has("arrowleft") ? 1 : 0);
      topdown.x += (sy * forward + cy * right) * speed;
      topdown.z += (-cy * forward + sy * right) * speed;
      topdown.yaw += ((move.has("e") ? 1 : 0) - (move.has("q") ? 1 : 0)) * 1.4 * dt;
      const liveMap = getLiveMap();
      topdown.x = Math.min(liveMap.width, Math.max(-1, topdown.x));
      topdown.z = Math.min(liveMap.height, Math.max(-1, topdown.z));
      // the view looks at the floor under (x, z), from `h` above it, back along the heading
      const sinT = Math.sin(topdown.tilt);
      const dist = topdown.h / sinT;
      const fx = Math.sin(topdown.yaw);
      const fz = -Math.cos(topdown.yaw);
      const baseY = floorY(Math.round(topdown.x), Math.round(topdown.z));
      camera.up.set(fx, 0, fz);
      camera.position.set(topdown.x - fx * dist * Math.cos(topdown.tilt), baseY + topdown.h, topdown.z - fz * dist * Math.cos(topdown.tilt));
      camera.lookAt(topdown.x, baseY, topdown.z);
    } else if (camera.up.y !== 1) {
      camera.up.set(0, 1, 0);
    }
    // the billboards (trees) face the eye, turning about the vertical only
    for (const b of billboardProps) {
      const billboard = b.getObjectByName("propBillboard");
      if (billboard) billboard.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z) - b.rotation.y;
    }

    ambient.intensity = s.ambientIntensity;
    backingMat.visible = s.wallBacking || s.backingInspect;
    backingMat.color.setHex(s.backingInspect ? 0xffffff : 0x000000);
    if (backingMat.fog === s.backingInspect) {
      backingMat.fog = !s.backingInspect;
      backingMat.needsUpdate = true;
    }
    pointLight.intensity = s.headlamp ? s.pointLightIntensity * rideDip : 0;
    if (s.headlampColor !== headlampColorNow) {
      headlampColorNow = s.headlampColor;
      pointLight.color.set(s.headlampColor);
    }
    lightGrid.scale.value = s.bakedLights ? s.mapLightIntensity * rideDip : 0;
    lightGrid.reflectionStrength.value = s.probeReflections && lightGrid.reflectionReady ? s.probeReflectionStrength : 0;
    const viewReach = topdown.on ? TOPDOWN_REACH : effectiveViewDistance(s);
    const fogSpan = fogRange(viewReach, s.fogStart, s.fogEnd);
    if (fog.far !== fogSpan.far || fog.near !== fogSpan.near) {
      fog.far = fogSpan.far;
      fog.near = fogSpan.near;
      camera.far = viewReach + 0.5;
      camera.updateProjectionMatrix();
    }
    if (s.fogColor !== fogColorNow) {
      fogColorNow = s.fogColor;
      fog.color.set(s.fogColor);
      fogBackground.set(s.fogColor);
    }
    const mapViewOn = s.geometryView === "normals" || s.geometryView === "depth";
    for (const kit of allKits()) {
      const tune = textureTuning(kit.id);
      for (const mat of kitMaterials(kit)) {
        const inspect = s.backingInspect && !kit.floor;
        if (!inspectMaterialDefaults.has(mat)) inspectMaterialDefaults.set(mat, { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
        const original = inspectMaterialDefaults.get(mat)!;
        const transparent = inspect || original.transparent;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.needsUpdate = true;
        }
        mat.opacity = inspect ? 0.25 : original.opacity;
        mat.depthWrite = inspect ? false : original.depthWrite;
        // (one with its own surface map keeps it; a set's own tuning
        // scales the viewer's values)
        if (!mat.userData.surface) {
          mat.roughness = Math.min(1, s.roughness * (tune?.rough ?? 1));
          mat.metalness = s.showMetal ? Math.min(1, s.metalness * (tune?.metal ?? 1)) : 0;
        } else {
          mat.metalness = s.showMetal ? 1 : 0;
        }
        mat.aoMapIntensity = s.showAO ? s.aoIntensity : 0;
      }
      // (a floor's normal strength: its own, else 1 - the Asset Manager's baseline - not the walls' setting on top
      // of its tuned value)
      const strength = kit.floor ? (s.floorNormalStrength > 0 ? s.floorNormalStrength : 1) : s.normalStrength;
      const normal = s.showNormals ? strength * (kit.normal ?? 1) * (tune?.normal ?? 1) : 0;
      kit.wallMat.normalScale.set(normal, normal);
      kit.litMat?.normalScale.set(normal, normal);
      if (kit.wallMat.userData.glow && !mapViewOn) kit.wallMat.emissiveIntensity = s.showGlow ? SURFACE_GLOW : 0;
    }
    decals.forEachLitMaterial((mat) => {
      // (a decal's own base - roughness 0.75, metalness 0.15 - at the viewer's defaults (0.55, 0.45), scaled with the
      // sliders: a plain metalness of 1 blacked them out, as the floors it lies on are only tuned a part of it)
      mat.roughness = Math.min(1, 0.75 * (s.roughness / 0.55));
      mat.metalness = s.showMetal ? Math.min(0.5, 0.15 * (s.metalness / 0.45)) : 0;
      // (like a floor's: its own strength setting, else 1)
      const normal = s.showNormals ? (s.floorNormalStrength > 0 ? s.floorNormalStrength : 1) : 0;
      mat.normalScale.set(normal, normal);
    });
    for (const mat of ownMaterials) {
      const tune = mat.userData.tuneId ? textureTuning(mat.userData.tuneId as string) : undefined;
      mat.roughness = Math.min(1, s.roughness * (tune?.rough ?? 1));
      mat.metalness = s.showMetal ? Math.min(1, s.metalness * (tune?.metal ?? 1)) : 0;
      mat.aoMapIntensity = s.showAO ? s.aoIntensity : 0;
      const normal = s.showNormals ? s.normalStrength * (mat.userData.normal ?? 1) * (tune?.normal ?? 1) : 0;
      mat.normalScale.set(normal, normal);
    }
    cavity.value = s.aoDirect;
    // the deck's accent turned to the ship's livery (none: as painted)
    const deckAccent = latestMapRef.current.accent;
    const livery = s.shipAccent === "painted" ? null : s.shipAccent === "rolled" ? (shipAccentRef.current ?? null) : s.shipAccent;
    const turn = deckAccent && livery !== null ? (((livery - deckAccent.hue) % 360) + 360) % 360 : 0;
    ACCENT_UNIFORMS.uAccentShift.value = turn / 360;
    ACCENT_UNIFORMS.uAccentFrom.value = (deckAccent?.hue ?? 0) / 360;
    ACCENT_UNIFORMS.uAccentWidth.value = (deckAccent?.range ?? 30) / 360;
    ACCENT_UNIFORMS.uAccentMinSat.value = s.accentMinSat;
    // (a set with its own accent: from its own hue to the same livery)
    for (const own of ownAccents) {
      own.uniforms.uAccentShift.value = livery !== null ? (((livery - own.hue) % 360) + 360) % 360 / 360 : 0;
      own.uniforms.uAccentFrom.value = own.hue / 360;
      own.uniforms.uAccentWidth.value = own.range / 360;
      own.uniforms.uAccentMinSat.value = s.accentMinSat;
    }
    // the headlamp: just above the eyes, where they are - it used to circle
    // the camera (an early experiment), which read as a light wandering
    // about the walls; at the eye it also never slips behind a wall plane
    // (lighting the back of its front faces and only the step sides of
    // relief walls)
    const camCell = { x: Math.round(camX), y: Math.round(camZ) };
    const ceilingHere = cellAt(map, camCell.x, camCell.y) === "wall" ? eyeY + 0.5 : ceilingY(camCell.x, camCell.y);
    pointLight.position.set(
      camX,
      // above the eyes, but never through the ceiling
      Math.min(eyeY - bobY + 0.3, ceilingHere - 0.08),
      camZ,
    );
    updateActors(camX, camZ);
    updateLoot(camX, camZ, cam.y * wallHeight);
    smokeFire.updateParticles(gameDt, t, s, getSightCells(), smokeBodies);
    smokeFire.updateMarkers();
    editorMarkers.updateSoundMarkers();
    fences.syncFenceMarkers();
    editorMarkers.updateLinkPlates(gameNow);
    updateTracers();
    camera.updateMatrixWorld();
    selectionBox.updateEditHighlight();
    updatePartyCover(camX, cam.y * wallHeight, camZ, s.eyeHeight);
    if (aimWeapon) updateAimFrame(aimWeapon, camX, camZ, aimZoom);
    else if (aimFrameRef.current) aimFrameRef.current = null;
    // (the ears: where the party's eye is and which way it looks - see audio/soundSystem.ts)
    // (in the editor's top-down view it is the spot looked at: the camera floats high above the map)
    if (!doorPreview) {
      gameSound.frame(
        topdown.on
          ? { x: topdown.x, y: floorY(Math.round(topdown.x), Math.round(topdown.z)) + s.eyeHeight, z: topdown.z, fx: Math.sin(topdown.yaw), fz: -Math.cos(topdown.yaw) }
          : { x: camX, y: eyeY, z: camZ, fx: fwdX / fwdLen, fz: fwdZ / fwdLen },
      );
    }
    updateLightPool(
      topdown.on ? { x: topdown.x, z: topdown.z } : { x: cam.x, z: cam.z },
      topdown.on
        ? { x: topdown.x, y: floorY(Math.round(topdown.x), Math.round(topdown.z)) + 1, z: topdown.z, fwdX: 0, fwdZ: 0 }
        : { x: camX, y: eyeY, z: camZ, fwdX: fwdX / fwdLen, fwdZ: fwdZ / fwdLen },
      s.mapLightIntensity * rideDip * (editModeRef.current && hiddenLayersRef.current.has("light") ? 0 : 1),
      dt,
    );
    cullFacing();
    lightFixtures.updateVisibility(editModeRef.current, hiddenLayersRef.current.has("light"));

    const liftDoor = ride ? liftDoorOf(map, { x: Math.round(cam.x), y: Math.round(cam.z) }) : undefined;
    if (ride && liftDoor) {
      const v = DIR_VECTOR[liftDoor.facing];
      const phase = (rideElapsed / SHAFT_LIGHT_PERIOD_MS) % 1;
      const offset = (ride.up ? 1 - 2 * phase : 2 * phase - 1) * SHAFT_LIGHT_SWEEP;
      shaftLight.position.set(liftDoor.cell.x + v.x * 0.3, eyeY + offset, liftDoor.cell.y + v.y * 0.3);
      shaftLight.intensity = SHAFT_LIGHT_INTENSITY * shake * (1 - Math.abs(offset) / SHAFT_LIGHT_SWEEP) ** 2;
    } else {
      shaftLight.intensity = 0;
    }

    // the layers the editor hides (only while editing)
    const hidden = editModeRef.current ? hiddenLayersRef.current : NO_LAYERS;
    if (hidden.size || hiddenApplied) {
      // Surfaces already restore their visibility in the culling pass above.
      if (hidden.has("texture")) for (const obj of facingSurfaces) obj.visible = false;
      backingMat.visible = s.wallBacking && !hidden.has("texture");
      smokeFire.setVisible(!hidden.has("smoke"));
      const propsHidden = hidden.has("prop");
      for (const obj of propObjects.values()) obj.visible = !propsHidden;
      // (shown again: the culling pass decides afresh which are in sight)
      if (!propsHidden) invalidateCulling();
      decals.setVisible(!hidden.has("decal"));
      if (hidden.has("item")) itemsLoot.hideItems();
      if (hidden.has("robot")) {
        for (const entry of actorMeshes.values()) {
          entry.mesh.visible = false;
          entry.shadow.visible = false;
        }
      }
      hiddenApplied = hidden.size > 0;
    }
    layFlatSprites();
    applyMaterialViews(s);
    reflectionTest?.update(s.reflectionTestCubemap, isReady() && s.geometryView === "textured", renderer, pointLight, facingSurfaces, propObjects.values());
    const textured = s.geometryView === "textured";
    const restoreRoomMaterials = puddles.update(getLiveMap(), renderer, pointLight, camera, now, t, isReady() && textured,
      facingSurfaces, propObjects, textured && s.roomMaterialReflections, cam, s.showRoomReflectionCube);
    if (s.showRoomReflectionCube) puddles.showCubeAt(cam.x, cam.z);
    else puddles.showCubeAt();
    try { postPipeline.renderGeometryView(s.geometryView); }
    finally { restoreRoomMaterials?.(); }

    fpsFrames++;
    if (now - lastStatsAt > 500) {
      lastStatsAt = now;
      const elapsed = now - fpsSince;
      const fps = elapsed > 0 ? (fpsFrames * 1000) / elapsed : 0;
      fpsFrames = 0;
      fpsSince = now;
      onStatsRef.current?.({
        renderedTriangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.calls,
        visibleCells: getSightCells().size,
        fps,
        frameMs: fps > 0 ? 1000 / fps : 0,
        relief: getReliefStats(),
      });
    }
  }

  function animate() {
    if (isDisposed()) return;
    // The loading screen covers a new map completely. Let its assets
    // and worker results reach the main thread before drawing the scene.
    if (!newMap || isReady()) renderFrame();
    raf = requestAnimationFrame(animate);
  }
  return { renderFrame, start: animate, dispose: () => cancelAnimationFrame(raf) };
}
