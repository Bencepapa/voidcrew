import { createLightFixtures, createMapLightState } from "../render/viewport/lightFixtures";
import { createLightPool } from "../render/viewport/lightPool";
import { createActorRendering } from "../render/viewport/actorRendering";
import { createInteractionRaycasts } from "../render/viewport/interactionRaycasts";
import { createCombatAiming } from "../render/viewport/combatAiming";
import { createEditPicking, objectLayer } from "../render/viewport/editPicking";
import { createPointerInput } from "../render/viewport/pointerInput";
import { createSelectionBox } from "../render/viewport/selectionBox";
import { createTopdownControls } from "../render/viewport/topdownControls";
import { observeViewportSize } from "../render/viewport/viewportResize";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { prepareRaycastsGradually } from "../render/bvh";
import type { SmokeBody } from "../render/smoke";
import { effectiveViewDistance } from "../render/graphics";
import { ACCENT_UNIFORMS, ownAccentUniforms, type AccentUniforms } from "../render/accent";
import { propEdit } from "../editor/propEditState";
import { ITEM_TYPES, isSharedPickupId } from "../game/items";
import {
  propCastsBakedShadow,
  createLightGridUniforms,
  disposeLightGrid,
  useLightGrid,
} from "../render/lightGrid";
import {
  bridgeAt,
  cellAt,
  ceilingHeight,
  floorHeight,
  ladderBetween,
  liftDoorOf,
  windowPanels,
} from "../game/map";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH, MAX_STEP } from "../game/heights";
import { rightOf } from "../game/movement";
import { DIR_VECTOR } from "../game/movement";
import type { DoorSpec, GameMap, PropSpec, Vec2 } from "../game/types";
import { buildRoofGeometry } from "../render/roofMesh";
import {
  fenceFaces,
  fenceFormOf,
  fenceIndex,
  fenceModelSpec,
  isFoliageSpec,
  type FenceModelSpec,
} from "../game/fences";
import type { JoinedStrips } from "../render/cornerJoins";
import { lampColor } from "../game/lights";
import { WORLDS } from "../game/worlds";
import { buildOperableModel, setOperablePose } from "../render/operableModel";
import { operableView } from "../game/operableStore";
import { emitterView } from "../game/emitterStore";
import { sourceKeys } from "../game/operables";
import {
  PROP_TYPES,
  propPlacement,
  propHeight,
  propReliefAmount,
  propReliefCells,
} from "../game/props";
import { actorHeight } from "../game/actors";
import { onSharedActorsChanged } from "../editor/sharedActors";
import { onTextureTuningSaved, textureTuning } from "../render/textureTuning";
import { buildEditPreview, changedCells } from "../render/editPreview";
import { gameClock } from "../game/clock";
import { cellKey, visibleCells } from "../game/visibility";
import type { PropFace, PropPart, PropType, PropView } from "../game/props";
import { forwardOf } from "../game/freeMovement";
import { WALL_ROTATION, surfaceKey } from "../render/surfaces";
import { DecalLibrary, fetchDecalManifest } from "../render/decals";
import { renderText, seededRandom } from "../render/pixelFont";
import { TEXTURE_SETS, isTextureSetId, textureFolder } from "../render/textureSets";
import { onSharedTexturesChanged } from "../render/sharedTextureEvents";
import { mapUsesTexture, wantSharedUrl } from "../editor/textureLibrary";
import { onSharedPropsChanged } from "../editor/sharedProps";
import { prismFaces, prismInset, prismSides } from "../game/propPrism";
import { propPrismGeometry } from "../render/propPrismMesh";
import { isSharedTextureId } from "../game/mapSharedRefs";
import { doorType, onSharedDoorsChanged } from "../editor/sharedDoorTypes";
import {
  onSharedDecalsChanged,
  onSharedPickupsChanged,
} from "../render/sharedImages";
import { gameSound } from "../audio/gameSound";
import { soundsOn } from "../game/soundOperables";
import { publishSight } from "../render/sightStore";
import type { TextureSetFiles, TextureSetId } from "../render/textureSets";
import { draggedWorldItem } from "./slotDrag";

export { DEFAULT_SETTINGS } from "../render/viewport/settings";

import type { ViewportSettings } from "../render/viewport/settings";
import {
  LIGHT_PANEL_INTENSITY,
  DEFAULT_FLOOR,
  createBandPlane,
  type WallKit,
  kitMaterials,
  wallVariantRoll,
  FLOOR_BASE_DEPTH,
} from "../render/viewport/walls";
import {
  TEXTURE_CHANGED_EVENT,
  EDIT_SETTLE_MS,
  CULL_MAX_SIZE,
  WINDOW_SET,
  NO_LAYERS,
  PROP_COARSE,
  SURFACE_GLOW,
  DOOR_PANEL_SETS,
  DOOR_LABEL_AREA,
  DOOR_LABEL_MAX_SCALE,
  DOOR_NUMBER_GAP,
  LABEL_PAINT,
  LABEL_PAINT_DARK,
  DOOR_OPEN_MS,
  TRIM_PAINT_URL,
  TRIM_HAZARD_URL,
  TRIM_TEXELS,
  LADDER_HALF_WIDTH,
  LADDER_RAIL,
  LADDER_RUNG,
  LADDER_STANDOFF,
  LADDER_HANDHOLD,
  LADDER_NECK,
  BRIDGE_KICK,
  BRIDGE_STRINGER,
} from "../render/viewport/constants";
import { type SceneCache, clearSceneCache, renderedSpecs } from "../render/viewport/sceneCache";
import { fogRange } from "../render/viewport/fog";
import {
  SIGHT_POINTS,
  FIRE_LIGHT_INTENSITY,
  FIRE_LIGHT_LIFT,
} from "../render/viewport/lighting";
import {
  TOPDOWN_FOV,
  TOPDOWN_REACH,
  AIM_FRAMING,
  AIM_MIN_FOV,
  AIM_CAMERA_TAU,
  LIFT_DIP_MS,
  SHAFT_LIGHT_COLOR,
  SHAFT_LIGHT_INTENSITY,
  SHAFT_LIGHT_PERIOD_MS,
  SHAFT_LIGHT_SWEEP,
  TRANSIT_FADE_IN_S,
  STAIRS_WALK,
  STAIRS_RISE,
  DOWN_FALL_MS,
  DOWN_EYE,
  DOWN_LOOK_UP,
  DOWN_ROLL,
  PEEK_IDLE_MS,
  PEEK_RETURN_TAU,
  type CamTarget,
  computeTarget,
  zoomedFov,
  verticalFov,
} from "../render/viewport/camera";
import { ITEM_TOPDOWN_GROW } from "../render/viewport/loot";
import { addDirectLightOcclusion } from "../render/viewport/materials";
import { createPostPipeline } from "../render/viewport/postPipeline";
import { createBakeRuntime } from "../render/viewport/bakeRuntime";
import { createSkySurface } from "../render/viewport/skySurface";
import {
  jumpPose,
  FALL_GRAVITY,
  FALL_START,
  RUNG_SPACING,
  climbPose,
  lerp,
  easeOutQuad,
  smoothstep,
} from "../render/viewport/poses";
import { drawChalkCross } from "../render/viewport/markers";
import { createSmokeFire } from "../render/viewport/smokeFire";
import { createItemsLoot } from "../render/viewport/itemsLoot";
import { createEditorMarkers } from "../render/viewport/editorMarkers";
import { createEventMarkers } from "../render/viewport/eventMarkers";
import { createFenceMarkers } from "../render/viewport/fenceMarkers";
import { buildFoliage } from "../render/viewport/foliageMesh";
import { turnClockwise } from "../render/viewport/pixels";
import type {
  ReliefStats,
  AimFrame,
  AimFocus,
  GameViewportProps,
} from "../render/viewport/contracts";
import { createBaseGeometry } from "../render/viewport/baseGeometry";
import { createStructuralSurfaces } from "../render/viewport/structuralSurfaces";
import { createWallBacking, type BackingPanel } from "../render/viewport/wallBacking";
import { createReliefGeometry } from "../render/viewport/reliefGeometry";
import { createStructuralWalls } from "../render/viewport/structuralWalls";
import { createStructuralTiles } from "../render/viewport/structuralTiles";
import { createStructuralDoors, type DoorCell } from "../render/viewport/structuralDoors";
import { createStructuralProps } from "../render/viewport/structuralProps";
import { retextured } from "../render/viewport/propRetexture";
import { LoadingScreen } from "../render/viewport/LoadingScreen";

export type { TextureSetId, WallProfileId, GeometryViewId, ViewportSettings } from "../render/viewport/settings";
export { FLOOR_BASE_DEPTH } from "../render/viewport/walls";
export { fogRange } from "../render/viewport/fog";
export type {
  ReliefStats,
  AimFrame,
  AimTarget,
  AimFocus,
  EditDragKind,
  EditDrag,
  EditTarget,
  ViewportStats,
} from "../render/viewport/contracts";


export function GameViewport({
  doorPreview,
  map,
  pos,
  dir,
  elevation,
  openDoors,
  ride,
  transit,
  actors,
  aiming,
  downAt,
  shipAccent,
  aimFrameRef: aimFrameRefProp,
  aimFocusRef: aimFocusRefProp,
  partyCoverRef,
  onTouch,
  onInteraction,
  onEditInteraction,
  interactionUseRef,
  interactionOpen,
  editMode,
  onTopdownExit,
  hiddenLayers,
  lockedLayers,
  editTool,
  onEdit,
  onEditHover,
  areaGhost,
  onEditDrag,
  onEditPaint,
  onEditAdjust,
  selectedLight,
  selectedProp,
  selectedEvent,
  selectedItem,
  selectedSmoke,
  selectedSound,
  previewSound,
  selectedDecal,
  selectedDoor,
  selectedLink,
  selectedActor,
  onReady,
  freeTick,
  peekRef,
  settings,
  onStats,
  lootedProps,
  takenItems,
  spills,
}: GameViewportProps) {
  const lootRef = useRef({ lootedProps, takenItems, spills });
  lootRef.current = { lootedProps, takenItems, spills };
  const containerRef = useRef<HTMLDivElement>(null);
  // kept from one build of the scene to the next (see SceneCache)
  const cacheRef = useRef<SceneCache>({
    renderer: null,
    antialias: false,
    version: "",
    textures: new Map(),
    decalTextures: new Map(),
    decalManifest: null,
    decalGeometries: new Map(),
    grids: new Map(),
    reliefs: new Map(),
  });
  useEffect(
    () => () => {
      clearSceneCache(cacheRef.current);
      cacheRef.current.renderer?.dispose();
      cacheRef.current.renderer = null;
    },
    [],
  );
  const actorsRef = useRef(actors ?? []);
  actorsRef.current = actors ?? [];
  const aimingRef = useRef(aiming ?? null);
  aimingRef.current = aiming ?? null;
  const downAtRef = useRef(downAt ?? null);
  downAtRef.current = downAt ?? null;
  const shipAccentRef = useRef(shipAccent ?? null);
  shipAccentRef.current = shipAccent ?? null;
  const ownAimFrameRef = useRef<AimFrame | null>(null);
  const aimFrameRef = aimFrameRefProp ?? ownAimFrameRef;
  const ownAimFocusRef = useRef<AimFocus | null>(null);
  const aimFocusRef = aimFocusRefProp ?? ownAimFocusRef;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  // bumped whenever a file under public/textures changes on disk (dev only),
  // which rebuilds the scene with cache-busted texture URLs - edit a height
  // map in GIMP/Aseprite, save, and the walls update in place
  const [textureVersion, setTextureVersion] = useState(0);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => setTextureVersion((v) => v + 1);
    hot.on(TEXTURE_CHANGED_EVENT, onChange);
    return () => hot.off(TEXTURE_CHANGED_EVENT, onChange);
  }, []);
  // a saved per-texture tuning (Asset Manager): the relief meshes rebuilt
  useEffect(() => onTextureTuningSaved(() => setTextureVersion((v) => v + 1)), []);
  useEffect(() => onSharedDoorsChanged(ids => {
    if (latestMapRef.current.doors?.some(spec => spec.type && ids.has(spec.type))) setTextureVersion(version => version + 1);
  }), []);
  useEffect(() => onSharedActorsChanged((_ids, revised) => {
    if (latestMapRef.current.actors?.some(spec => revised.has(spec.actor))) setTextureVersion(version => version + 1);
  }), []);
  useEffect(() => onSharedPropsChanged(ids => {
    if (latestMapRef.current.props?.some(spec => ids.has(spec.prop))) setTextureVersion(version => version + 1);
  }), []);
  useEffect(() => onSharedPickupsChanged(ids => {
    const current = latestMapRef.current;
    if (current.items?.some(item => ids.has(item.item)) ||
        current.props?.some(prop => prop.loot?.some(item => ids.has(item.item)))) {
      setTextureVersion(version => version + 1);
    }
  }), []);
  // a shared texture whose files changed (a draft's map uploaded or removed, a publish, the store listed again): the scene
  // is built from the texture table once, so it would keep showing the old (often flat) maps; rebuilt when the edits settle
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onSharedTexturesChanged((ids) => {
      // (a map that uses none of them keeps its scene: a full rebuild blanks the view for seconds)
      const current = latestMapRef.current;
      if (!ids.some(id => mapUsesTexture(current, id) || current.doors?.some(spec => {
        const type = doorType(spec.type);
        return type?.leaf === id || type?.frame === id;
      }))) return;
      clearTimeout(timer);
      timer = setTimeout(() => setTextureVersion((v) => v + 1), 800);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  // the prop editor (see propEditState): its boxes drawn over the edited
  // type's props at once; the props rebuilt once its edits settle
  const propWiresRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let version = propEdit.get().version;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = propEdit.subscribe(() => {
      propWiresRef.current?.();
      if (propEdit.get().version === version) return;
      version = propEdit.get().version;
      clearTimeout(timer);
      timer = setTimeout(() => setTextureVersion((v) => v + 1), 600);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);
  // continuously-updated "where the camera actually is right now", read and
  // written every animation frame, whether mid-transition or settled
  const liveRef = useRef<CamTarget>(computeTarget(pos, dir, elevation));
  // `climb`: the move goes up or down a ladder; `jumpSide`: it's a jump off
  // a bridge, stepping off to that side
  const animRef = useRef<{
    from: CamTarget;
    to: CamTarget;
    start: number;
    climb?: boolean;
    jumpSide?: Vec2;
  } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const peekRefRef = useRef(peekRef);
  peekRefRef.current = peekRef;
  const rideRef = useRef(ride);
  rideRef.current = ride;
  const transitRef = useRef(transit ?? null);
  transitRef.current = transit ?? null;
  // the black sheet of a transit over the view (see renderFrame): its element and how black it is
  const fadeRef = useRef<HTMLDivElement>(null);
  const fadeLevelRef = useRef(0);
  const onTouchRef = useRef(onTouch);
  onTouchRef.current = onTouch;
  const interactionCallbacks = useRef({ onInteraction, onEditInteraction, interactionOpen });
  interactionCallbacks.current = { onInteraction, onEditInteraction, interactionOpen };
  const hiddenLayersRef = useRef<ReadonlySet<string>>(hiddenLayers ?? new Set());
  hiddenLayersRef.current = hiddenLayers ?? hiddenLayersRef.current;
  const lockedLayersRef = useRef<ReadonlySet<string>>(lockedLayers ?? new Set());
  lockedLayersRef.current = lockedLayers ?? lockedLayersRef.current;
  const onTopdownExitRef = useRef(onTopdownExit);
  onTopdownExitRef.current = onTopdownExit;
  const editModeRef = useRef(!!editMode);
  editModeRef.current = !!editMode;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const selectedLightRef = useRef(selectedLight ?? null);
  selectedLightRef.current = selectedLight ?? null;
  const selectedEventRef = useRef(selectedEvent ?? null);
  selectedEventRef.current = selectedEvent ?? null;
  const selectedPropRef = useRef(selectedProp ?? null);
  selectedPropRef.current = selectedProp ?? null;
  const selectedItemRef = useRef(selectedItem ?? null);
  selectedItemRef.current = selectedItem ?? null;
  const selectedSmokeRef = useRef(selectedSmoke ?? null);
  selectedSmokeRef.current = selectedSmoke ?? null;
  const selectedSoundRef = useRef(selectedSound ?? null);
  selectedSoundRef.current = selectedSound ?? null;
  const selectedDecalRef = useRef(selectedDecal ?? null);
  selectedDecalRef.current = selectedDecal ?? null;
  const selectedDoorRef = useRef(selectedDoor ?? null);
  selectedDoorRef.current = selectedDoor ?? null;
  const selectedLinkRef = useRef(selectedLink ?? null);
  selectedLinkRef.current = selectedLink ?? null;
  const selectedActorRef = useRef(selectedActor ?? null);
  selectedActorRef.current = selectedActor ?? null;
  const editToolRef = useRef(editTool ?? "dig");
  editToolRef.current = editTool ?? "dig";
  const onEditHoverRef = useRef(onEditHover);
  onEditHoverRef.current = onEditHover;
  const areaGhostRef = useRef(areaGhost);
  areaGhostRef.current = areaGhost;
  const onEditDragRef = useRef(onEditDrag);
  onEditDragRef.current = onEditDrag;
  const onEditPaintRef = useRef(onEditPaint);
  onEditPaintRef.current = onEditPaint;
  const onEditAdjustRef = useRef(onEditAdjust);
  onEditAdjustRef.current = onEditAdjust;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // the loading screen, up while a new map's scene is built; the map last
  // shown (a rebuild of the same map - a settings change - skips it)
  const [loading, setLoading] = useState<{ title: string; progress: number } | null>({ title: map.name, progress: 0 });
  const shownMapRef = useRef<string | null>(null);
  // a new map (a lift ride's arrival) places the camera outright
  const cameraMapRef = useRef(map);

  // a layout effect: it has to take effect before the next frame is drawn,
  // or that frame would show the old facing (see pendingTurn below)
  useLayoutEffect(() => {
    const peek = peekRefRef.current?.current;
    if (peek?.pendingTurn) {
      // a released peek turned into this turn: jump the facing and take the
      // same 90 degrees off the peek in one step, so the view doesn't move
      // at all here - it just carries on easing to center from the released
      // angle instead of swinging through the whole turn again
      peek.offset -= (peek.pendingTurn * Math.PI) / 2;
      peek.pendingTurn = 0;
      animRef.current = null;
      liveRef.current = computeTarget(pos, dir, elevation);
      return;
    }
    if (cameraMapRef.current !== map) {
      // arrived on another map: no glide from wherever the old one had us
      cameraMapRef.current = map;
      animRef.current = null;
      liveRef.current = computeTarget(pos, dir, elevation);
      return;
    }
    const from = { ...liveRef.current };
    const to = computeTarget(pos, dir, elevation);
    const fromCell = { x: Math.round(from.x), y: Math.round(from.z) };
    const sameCell = fromCell.x === pos.x && fromCell.y === pos.y;
    const climb = Math.abs(to.y - from.y) > MAX_STEP + 1e-6 && !!ladderBetween(map, fromCell, pos);
    // down off a bridge in the same cell: step off its side - to the right
    // when facing along it, else straight ahead
    const bridge = bridgeAt(map, pos.x, pos.y);
    let jumpSide: Vec2 | undefined;
    if (sameCell && bridge && from.y - to.y > MAX_STEP + 1e-6) {
      const alongBridge = (bridge.axis === "NS") === (dir === "N" || dir === "S");
      jumpSide = DIR_VECTOR[alongBridge ? rightOf(dir) : dir];
    }
    animRef.current = { from, to, start: performance.now(), climb, jumpSide };
  }, [pos, dir, elevation, map]);

  const freeTickRef = useRef(freeTick);
  freeTickRef.current = freeTick;
  const freeMode = !!freeTick;
  // back to grid movement: glide from wherever free movement left the camera
  // onto the current cell and facing
  useEffect(() => {
    if (freeMode) return;
    animRef.current = { from: { ...liveRef.current }, to: computeTarget(pos, dir, elevation), start: performance.now() };
    // only on the mode switch - pos/dir changes are handled above
  }, [freeMode]);

  // door panels (the sliding part) by door cell key ("x,y"); userData holds
  // `open` and its `openPos`/`closedPos`
  const doorPanelsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const doorAnimsRef = useRef(new Map<string, { panel: THREE.Object3D; from: THREE.Vector3; fromYaw: number; start: number }>());
  const openDoorsRef = useRef(openDoors);
  openDoorsRef.current = openDoors;

  // slide every panel whose open state changed (opened, or a lift door
  // shutting) towards its new position
  useEffect(() => {
    for (const [key, panel] of doorPanelsRef.current) {
      const open = openDoors.has(key);
      if (panel.userData.open === open) continue;
      panel.userData.open = open;
      doorAnimsRef.current.set(key, { panel, from: panel.position.clone(), fromYaw: panel.rotation.y, start: gameClock.now() });
    }
  }, [openDoors]);

  // The map the scene is built from. A new version of it that differs only
  // in its lights, smoke or robots (the editor's tools for them) keeps the
  // scene: those are redone in place instead of rebuilding every wall.
  // While editing, a change to the cells (a dig, a fill, heights, textures) doesn't
  // rebuild it at once: the scene shows a quick flat preview of them (see
  // applyStructure) and is rebuilt after EDIT_SETTLE_MS without another
  // structural edit (`settleTick`).
  const sceneMapRef = useRef(map);
  const [settleTick, setSettleTick] = useState(0);
  const settledTickRef = useRef(0);
  const previewableRef = useRef<{ map: GameMap; ok: boolean }>({ map, ok: false });
  if (sceneMapRef.current.id !== map.id || !map.structureKey || sceneMapRef.current.structureKey !== map.structureKey || settledTickRef.current !== settleTick) {
    let quick = false;
    if (editMode && settledTickRef.current === settleTick && sceneMapRef.current.id === map.id && map.structureKey) {
      // (worked out once for each new map)
      if (previewableRef.current.map !== map) previewableRef.current = { map, ok: changedCells(sceneMapRef.current, map) !== null };
      quick = previewableRef.current.ok;
    }
    if (!quick) {
      sceneMapRef.current = map;
      settledTickRef.current = settleTick;
    }
  }
  const sceneMap = sceneMapRef.current;
  useEffect(() => {
    if (!editMode || map.structureKey === sceneMap.structureKey) return;
    const timer = setTimeout(() => setSettleTick((n) => n + 1), EDIT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [map, sceneMap, editMode]);
  const applyLightsRef = useRef<((next: GameMap) => void) | null>(null);
  // the top-down view (see the scene effect's `topdown`): on or off, and a way to switch it
  const [topdownOn, setTopdownOn] = useState(false);
  const topdownToggleRef = useRef<((on?: boolean) => void) | null>(null);
  // (kept here, not in the scene effect: a rebuild after an edit keeps the view where it was)
  const topdownRef = useRef({ on: false, x: 0, z: 0, h: 9, tilt: Math.PI / 2, yaw: 0, fresh: false });
  const editHoverRef = useRef<THREE.Vector2 | null>(null);
  const rebakeRef = useRef<(() => void) | null>(null);
  useEffect(() => rebakeRef.current?.(), [
    settings.lightGridDensity, settings.lightGridMode, settings.lightBounce,
    settings.skyLightIntensity, settings.skyDomeIntensity, settings.skyLightAzimuth, settings.skyLightElevation, settings.skyLightColor,
  ]);
  // the map as it is now (lights included - the scene's may be older)
  const latestMapRef = useRef(map);
  latestMapRef.current = map;
  useEffect(() => {
    if (map !== sceneMap) applyLightsRef.current?.(map);
  }, [map, sceneMap]);

  // The map's sound emitters (see audio/soundSystem.ts): the game plays them; the editor is silent but for the
  // preview. A sound is heard, not built, so a change to them never touches the scene - the audio system takes it in
  // place. (The little viewport that previews a door does not speak for the game.)
  const soundWallHeight = settings.wallHeight;
  useEffect(() => {
    if (doorPreview) return;
    gameSound.setScene({
      sounds: map.sounds ?? [],
      // a wall, the map's edge or a shut door stops sound
      blocked: (x, y) => {
        const cell = cellAt(map, x, y);
        return cell === "wall" || (cell === "door" && !openDoorsRef.current.has(`${x},${y}`));
      },
      floorHeight: (x, y) => floorHeight(map, x, y),
      wallHeight: soundWallHeight,
      // (a lever, button or plate can switch a sound on or off: see game/soundOperables.ts)
      isOn: soundsOn(map),
    });
  }, [map, soundWallHeight, doorPreview]);
  useEffect(() => (doorPreview ? undefined : emitterView.subscribe(() => gameSound.invalidate())), [doorPreview]);
  useEffect(() => {
    if (!doorPreview) gameSound.invalidate();
  }, [openDoors, doorPreview]);
  useEffect(() => {
    if (doorPreview) return;
    gameSound.setEditing(!!editMode);
    gameSound.setPreview(editMode ? previewSound ?? null : null);
  }, [editMode, previewSound, doorPreview]);
  // (the viewport goes: its sounds stop)
  useEffect(
    () => () => {
      if (!doorPreview) gameSound.setScene(null);
    },
    [doorPreview],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;
    const buildStart = performance.now();
    // Where the build's time goes (shown in the console when the scene is ready - always with
    // ?profile in the address, else in dev; and in window.__voidcrewBuild): totals by kind of
    // work, and when the textures and the builds were all in.
    const phases: Record<string, { ms: number; n: number }> = {};
    const tick = (name: string, since: number, end = performance.now()) => {
      const p = (phases[name] ??= { ms: 0, n: 0 });
      p.ms += Math.max(0, end - since);
      p.n++;
    };
    const milestones: Record<string, number> = {};

    const scene = new THREE.Scene();
    const fogStart = fogRange(effectiveViewDistance(settings), settings.fogStart, settings.fogEnd);
    const fog = new THREE.Fog(settings.fogColor, fogStart.near, fogStart.far);
    scene.fog = fog;
    // what's past the far plane (nothing drawn) is the fog's colour too
    const fogBackground = new THREE.Color(settings.fogColor);
    scene.background = fogBackground;
    let fogColorNow = settings.fogColor;

    // anything past the fog's end renders the fog's colour anyway, so the far plane
    // sits just beyond it and frustum culling skips those walls entirely
    // (a big saving with relief walls' thousands of triangles each)
    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, effectiveViewDistance(settings) + 0.5);

    const cache = cacheRef.current;
    // (antialiasing is the drawing buffer's, chosen when the context is
    // made: the setting changed, the old renderer goes - its compiled
    // shaders and uploads with it; the cached textures and geometry are
    // uploaded again to the new one as they're drawn)
    const antialias = settings.antialias > 0;
    if (cache.renderer && cache.antialias !== antialias) {
      cache.renderer.dispose();
      cache.renderer.forceContextLoss();
      cache.renderer = null;
    }
    cache.antialias = antialias;
    const renderer = cache.renderer ?? (cache.renderer = new THREE.WebGLRenderer({ antialias }));
    // phones (touch screens) render at most 1.5 device pixels per CSS pixel:
    // their 3x screens cost 4x the pixels of 1.5x, for no pixel-art detail
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x445566, settings.ambientIntensity);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(settings.headlampColor, settings.pointLightIntensity, 8, 2);
    let headlampColorNow = settings.headlampColor;
    scene.add(pointLight);
    // a lift ride's shaft lights: sweeping past the outside of the cabin
    // (lights shine through walls here - that's what makes it read as
    // light leaking in around the door as the cabin moves)
    const shaftLight = new THREE.PointLight(SHAFT_LIGHT_COLOR, 0, 2.2, 2);
    scene.add(shaftLight);

    const bust = textureVersion ? `?v=${textureVersion}` : "";
    // (a draft texture's or an Auto map's blob: URL can't take a query string; those change their URL instead.
    // A remote (shared store) URL is a revision folder `.../rN/...` that never changes, so it never gets one either:
    // a `?v=` would only force a re-download of every shared file on each bump, see concept/supabase-egress-audit.md)
    const busted = (url: string) => {
      // (a shared texture the scene resolves is in use: its Auto maps are made now, not for the whole store)
      wantSharedUrl(url);
      return /^(blob|data):/.test(url) || (/^https?:\/\//i.test(url) && !url.startsWith(window.location.origin)) ? url : url + bust;
    };
    if (cache.version !== bust) {
      clearSceneCache(cache);
      cache.version = bust;
    }
    // a texture loaded once (see SceneCache); `onLoad` runs once it's in -
    // straight away if it already is
    const kitTexture = (url: string, onLoad?: (tex: THREE.Texture) => void) => {
      let tex = cache.textures.get(url);
      if (!tex) {
        tex = loader.load(url, onLoad);
        cache.textures.set(url, tex);
      } else if (onLoad && tex.image) onLoad(tex);
      return tex;
    };

    // Loading: every texture goes through `manager`, every geometry build
    // and decal batch through track(). Once both are idle the shaders are
    // compiled and the scene is shown - behind the loading screen until then
    // on a new map, so walls never pop in piece by piece.
    const manager = new THREE.LoadingManager();
    const loader = new THREE.TextureLoader(manager);
    let texturesLoaded = 0;
    let texturesTotal = 0;
    let buildsPending = 0;
    let buildsTotal = 0;
    let ready = false;
    let stopRaycastPrep: (() => void) | null = null;
    // loads that start only once the scene is shown (so they do not take the loading's connections)
    const afterReady: (() => void)[] = [];
    const newMap = shownMapRef.current !== map.id;
    if (newMap) setLoading({ title: map.name, progress: 0 });
    const checkReady = () => {
      if (disposed || ready) return;
      const progress = (texturesLoaded + buildsTotal - buildsPending) / Math.max(1, texturesTotal + buildsTotal);
      if (newMap) setLoading({ title: map.name, progress });
      if (texturesTotal > 0 && texturesLoaded >= texturesTotal) milestones["textures loaded"] ??= performance.now() - buildStart;
      if (buildsTotal > 0 && buildsPending === 0) milestones["geometry builds done"] ??= performance.now() - buildStart;
      if (buildsPending > 0 || texturesLoaded < texturesTotal) return;
      // let the builds' own .then()s (placing the meshes) run first
      setTimeout(() => {
        if (disposed || ready || buildsPending > 0 || texturesLoaded < texturesTotal) return;
        ready = true;
        group.traverse((o) => {
          const mat = (o as THREE.Mesh).material;
          for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) useLightGrid(m, lightGrid);
        });
        const compileFrom = performance.now();
        renderer.compile(scene, camera);
        tick("shader compile", compileFrom);
        // (the raycast hierarchies: built a little at a time once the deck is shown, not before it -
        // they were a tenth to a sixth of the load)
        stopRaycastPrep = prepareRaycastsGradually(group);
        // how long the build took (ms), and where it went, e.g. after a map edit
        const total = performance.now() - buildStart;
        const report = {
          total,
          // (since the page began: when this scene's build started, and when it was ready - the time before it is loading the app itself)
          startedAt: Math.round(buildStart),
          readyAt: Math.round(performance.now()),
          newMap,
          milestones: Object.fromEntries(Object.entries(milestones).map(([k, v]) => [k, Math.round(v)])),
          phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, { ms: Math.round(v.ms), n: v.n }])),
        };
        Object.assign(window, { __voidcrewBuild: report });
        if (!doorPreview && (import.meta.env.DEV || /[?&]profile\b/.test(location.search))) {
          console.info(`[voidcrew] scene ready in ${Math.round(total)} ms (${newMap ? "new map" : "rebuild"}); build started at ${report.startedAt} ms, ready at ${report.readyAt} ms since the page began`, report.milestones);
          console.table(report.phases);
        }
        shownMapRef.current = map.id;
        setLoading(null);
        for (const start of afterReady.splice(0)) start();
        onReadyRef.current?.(map.id);
      }, 0);
    };
    manager.onStart = manager.onProgress = (_url, loaded, total) => {
      texturesLoaded = loaded;
      texturesTotal = total;
      checkReady();
    };
    manager.onLoad = checkReady;
    function track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T> {
      const promise = typeof work === "function" ? work() : work;
      buildsPending++;
      buildsTotal++;
      promise.finally(() => {
        buildsPending--;
        checkReady();
      }).catch(() => {});
      return promise;
    }
    const isRelief = settings.wallProfile === "relief";
    const wallHeight = settings.wallHeight;
    const cavity = { value: settings.aoDirect };

    // `displace`: whether flat/beveled geometry gets the depth map as
    // displacement - not for floors, whose single quad would only tilt
    // `setId`: a TEXTURE_SETS entry, or (for props) any folder under
    // public/textures/ with the usual diffuse, normal and depth maps
    // (`accent`: its materials take the ship's livery - the deck's own
    // surfaces do, props don't)
    // the texture sets with an accent of their own (see TextureSetFiles.accent)
    const ownAccents: { hue: number; range: number; uniforms: AccentUniforms }[] = [];
    // The maps the debug normal / depth views draw, by material: the 2D
    // sprites' (marked below, their strength and shine kept in userData -
    // clones copy those) and the wall kits'. A material without a depth map
    // shows mid-grey in the depth view.
    const viewMaps = new WeakMap<THREE.Material, { normal?: THREE.Texture; depth?: THREE.Texture }>();
    function markSprite(mat: THREE.MeshStandardMaterial, normalStrength: number, normalMap?: THREE.Texture, depth?: THREE.Texture) {
      mat.userData.sprite = true;
      mat.userData.normalBase = normalStrength;
      mat.userData.metalBase = mat.metalness;
      viewMaps.set(mat, { normal: normalMap, depth });
    }
    function createWallKit(setId: string, displace = true, accent = true, paths?: TextureSetFiles): WallKit {
      paths ??= isTextureSetId(setId) ? TEXTURE_SETS[setId] : textureFolder(setId);
      const diffuse = kitTexture(busted(paths.diffuse));
      const normalMap = kitTexture(busted(paths.normal));
      const depthMap = kitTexture(busted(paths.depth));
      diffuse.colorSpace = THREE.SRGBColorSpace;
      if (paths.pixelArt) {
        // crisp texels up close instead of bilinear blur; minification keeps
        // mipmaps so distant walls don't shimmer
        diffuse.magFilter = THREE.NearestFilter;
        normalMap.magFilter = THREE.NearestFilter;
      }
      // (the lighter graphics settings go without: a texture read and the
      // tangent frame worked out per pixel - see Graphics.normalMaps)
      const surfaceNormals = settings.normalMaps > 0 ? normalMap : null;
      const wallMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap: surfaceNormals,
        // relief walls already carry the depth as real geometry
        displacementMap: isRelief || !displace ? null : depthMap,
        displacementScale: settings.displacementScale,
        roughness: settings.roughness,
        metalness: settings.metalness,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        roughness: settings.roughness,
        metalness: settings.metalness,
      });
      addDirectLightOcclusion(wallMat, cavity);
      addDirectLightOcclusion(sideMat, cavity);
      const textures = [diffuse, normalMap, depthMap];
      // the set's glow map, if it has one: always shining
      if (paths.glow) {
        const glowMap = kitTexture(busted(paths.glow));
        glowMap.colorSpace = THREE.SRGBColorSpace;
        if (paths.pixelArt) glowMap.magFilter = THREE.NearestFilter;
        wallMat.emissiveMap = glowMap;
        wallMat.emissive.setHex(0xffffff);
        wallMat.emissiveIntensity = SURFACE_GLOW;
        wallMat.userData.glow = true;
        textures.push(glowMap);
      }

      // the set's surface map, if it has one: its own shine per texel (the
      // viewer's roughness and metalness don't touch it)
      const surfaceMap = paths.surface ? kitTexture(busted(paths.surface)) : null;
      if (surfaceMap) {
        if (paths.pixelArt) surfaceMap.magFilter = THREE.NearestFilter;
        textures.push(surfaceMap);
      }

      let litMat: THREE.MeshStandardMaterial | undefined;
      if (paths.emissive) {
        const emissiveMap = kitTexture(busted(paths.emissive));
        if (paths.pixelArt) emissiveMap.magFilter = THREE.NearestFilter;
        textures.push(emissiveMap);
        litMat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap: surfaceNormals,
          roughness: settings.roughness,
          metalness: settings.metalness,
          emissive: lampColor(map),
          emissiveMap,
          emissiveIntensity: LIGHT_PANEL_INTENSITY,
        });
        addDirectLightOcclusion(litMat, cavity);
      }

      const accentUniforms = accent && paths.accent ? ownAccentUniforms() : undefined;
      if (accentUniforms) ownAccents.push({ hue: paths.accent!.hue, range: paths.accent!.range ?? 30, uniforms: accentUniforms });
      for (const mat of [wallMat, sideMat, litMat]) {
        if (!mat) continue;
        viewMaps.set(mat, { normal: normalMap, depth: depthMap });
        mat.userData.accent = accent;
        if (accentUniforms) mat.userData.accentUniforms = accentUniforms;
        if (surfaceMap) {
          mat.roughnessMap = mat.metalnessMap = surfaceMap;
          mat.roughness = mat.metalness = 1;
          mat.userData.surface = true;
        }
      }
      // (a lamp's panel shines in its lamp's own colour: its trim takes the
      // livery, its light doesn't)
      if (litMat) litMat.userData.accentGlow = false;
      return { id: setId, depthUrl: busted(paths.depth), grateLevels: paths.grateLevels, smooth: paths.smooth, wallMat, sideMat, litMat, textures, slots: [] };
    }

    // most walls use the main texture set; a stable, position-based share of
    // them gets the accent set for variety
    // (a deck with its own wall set uses just that - its look is uniform)
    const deckWall = isTextureSetId(map.textures?.wall) ? map.textures.wall : undefined;
    const primarySet = deckWall ?? settings.textureSet;
    const primaryKit = createWallKit(primarySet);
    // (the map's own accent set, if it names one - else, for a deck without a wall
    // set of its own, the viewer's)
    const accentSet: string = isTextureSetId(map.textures?.accent) ? map.textures.accent : !deckWall ? settings.accentTextureSet : "none";
    const accentKit =
      accentSet !== "none" && accentSet !== "sky" && accentSet !== primarySet && settings.accentRatio > 0 ? createWallKit(accentSet) : null;
    // wall kits by texture set: the default mix plus any the map asks for
    // (map.wallTextureAt), created on demand
    const wallKits = new Map<TextureSetId, WallKit>([[primarySet, primaryKit]]);
    if (accentKit) wallKits.set(accentSet as TextureSetId, accentKit);
    function wallKitFor(setId: TextureSetId): WallKit {
      let kit = wallKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId);
        wallKits.set(setId, kit);
      }
      return kit;
    }
    // floor kits are created on demand, one per floor texture actually used
    const floorKits = new Map<TextureSetId, WallKit>();
    function floorKitAt(x: number, y: number, m: GameMap = map): WallKit | null {
      const choice = settings.floorTextureSet;
      if (choice === "none") return null;
      const fromMap = m.floorAt?.(x, y);
      const deckFloor = isTextureSetId(m.textures?.floor) ? m.textures.floor : DEFAULT_FLOOR;
      const setId = choice !== "map" ? choice : isTextureSetId(fromMap) ? fromMap : deckFloor;
      let kit = floorKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        kit.floor = true;
        floorKits.set(setId, kit);
      }
      return kit;
    }

    // ceiling kits by texture set: the chosen one, or the map's for a cell
    // (a lift cabin's own), created on demand; none for a plain ceiling
    const ceilingKits = new Map<TextureSetId, WallKit>();
    function ceilingKitAt(x: number, y: number, m: GameMap = map): WallKit | null {
      if (settings.ceilingTextureSet === "none") return null;
      const fromMap = m.ceilingTextureAt?.(x, y);
      const deckCeiling = isTextureSetId(m.textures?.ceiling) ? m.textures.ceiling : undefined;
      const setId = isTextureSetId(fromMap) ? fromMap : (deckCeiling ?? settings.ceilingTextureSet);
      let kit = ceilingKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        ceilingKits.set(setId, kit);
      }
      return kit;
    }
    const mapLightState = createMapLightState(map);
    // the walls' relief depth: the map's own, else the settings'
    const reliefDepth = map.reliefDepth ?? settings.reliefDepth;
    // the floors have a relief depth of their own (0: the Asset Manager's own baseline, so a texture's tuned depth is
    // what shows - not multiplied by whatever the walls' depth is set to)
    const floorDepth = settings.floorReliefDepth > 0 ? settings.floorReliefDepth : FLOOR_BASE_DEPTH;
    // props follow the wall profile: flat (or beveled) walls, flat props
    const propReliefDepth = settings.wallProfile === "relief" ? reliefDepth : 0.0005;
    // the static lights, baked (see lightGrid.ts) - every lit material reads
    // it once the scene is built
    const lightGrid = createLightGridUniforms();
    // the map as edited since the scene was built (see applyStructure): what the quick preview of an edit shows
    let liveMap = map;
    const bakeRuntime = createBakeRuntime({
      scene, map, settingsRef, latestMapRef, rebakeRef, lightGrid, wallHeight, track, tick,
      getLiveMap: () => liveMap,
      getMapLights: () => mapLightState.mapLights,
      isDisposed: () => disposed,
    });
    bakeRuntime.start(settings);
    bakeRuntime.bindRebake();
    const { effectPanels } = mapLightState;
    const deckLampColor = lampColor(map);

    // window panels (see the wall loop), by their wall's surface key
    // and the frame panel each takes: a one-panel window its own, a wider
    // one a left end, middle pieces and a right end
    const windowSet: TextureSetId = isTextureSetId(map.textures?.window) ? map.textures.window : WINDOW_SET;
    const windowFaces = new Map(
      windowPanels(map).map((p) => {
        const part = p.width === 1 ? "" : p.index === 0 ? "_left" : p.index === p.width - 1 ? "_right" : "_mid";
        return [surfaceKey(p.cell, p.wall), `${windowSet}${part}` as TextureSetId] as const;
      }),
    );
    const windowKits = new Map<TextureSetId, WallKit>();
    const windowKitFor = (setId: TextureSetId) => {
      let kit = windowKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        windowKits.set(setId, kit);
      }
      return kit;
    };
    // prop side/top kits by texture set, created on demand
    const propKits = new Map<string, WallKit>();
    const sharedPropKitFor = (setId: string, paths?: TextureSetFiles) => {
      let kit = propKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false, false, paths);
        propKits.set(setId, kit);
      }
      return kit;
    };
    // A roof's kit: a wall set's maps, copied and set to repeat (a roof's
    // surface runs past the texture's one tile along its slope; the walls'
    // maps clamp). One per set, among the prop kits.
    const roofKitFor = (setId: string) => {
      const key = `roof:${setId}`;
      let kit = propKits.get(key);
      if (!kit) {
        const made = createWallKit(setId, false);
        const copies = new Map<THREE.Texture, THREE.Texture>();
        const repeating = (tex: THREE.Texture | null) => {
          if (!tex) return tex;
          let copy = copies.get(tex);
          if (!copy) {
            copy = tex.clone();
            copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
            copy.needsUpdate = true;
            copies.set(tex, copy);
            made.textures.push(copy);
          }
          return copy;
        };
        for (const mat of kitMaterials(made)) {
          mat.map = repeating(mat.map);
          mat.normalMap = repeating(mat.normalMap);
          mat.emissiveMap = repeating(mat.emissiveMap);
          mat.roughnessMap = repeating(mat.roughnessMap);
          mat.metalnessMap = repeating(mat.metalnessMap);
        }
        propKits.set(key, made);
        kit = made;
      }
      return kit;
    };
    // the loot items' sprites (all of them: a crate may spill any)
    for (const id of Object.keys(ITEM_TYPES)) {
      if (!doorPreview && !isSharedPickupId(id)) sharedPropKitFor(`item_${id}`);
    }
    // a prop type's texture sets: a box's side and top, its views, or a
    // cutout's one
    const propSets = (type: PropType): string[] =>
      type.kind === "box"
        ? [type.side, type.top]
        : type.kind === "views"
          ? ["front", "side", "top"].map((v) => `${type.views}_${v}`)
          : type.kind === "cabin"
            ? [type.door, type.inside, `${type.views}_side`, `${type.views}_top`]
            : type.kind === "pillar"
              ? [type.texture ?? primarySet]
              : type.kind === "chamfer" || type.kind === "roof" || type.kind === "fence" || type.kind === "operable"
                ? []
                : [type.texture];
    // door panel kits by door kind, created on demand
    // a deck's own door panels and label paint, else the defaults
    const panelSetFor = (kind: DoorSpec["kind"]): TextureSetId => {
      const own = kind === "lift" ? map.textures?.liftDoor : map.textures?.door;
      return isTextureSetId(own) ? own : DOOR_PANEL_SETS[kind];
    };
    const labelHex = /^#?([0-9a-f]{6})$/i.exec(map.labelColor ?? "")?.[1];
    const labelPaint: [number, number, number] = labelHex
      ? [0, 2, 4].map((i) => parseInt(labelHex.slice(i, i + 2), 16)) as [number, number, number]
      : LABEL_PAINT;
    const labelPaintDark: [number, number, number] = labelHex
      ? labelPaint.map((c) => Math.round(c * 0.85)) as [number, number, number]
      : LABEL_PAINT_DARK;
    const frameKits = new Map<TextureSetId, WallKit>();
    const panelKits = new Map<TextureSetId, WallKit>();
    const doorKitFor = (kits: Map<TextureSetId, WallKit>, set: TextureSetId) => {
      let kit = kits.get(set);
      if (!kit) kits.set(set, kit = createWallKit(set, false));
      return kit;
    };
    const doorCells: DoorCell[] = [];
    // materials made beside the kits' (labeled door panels, see-through
    // bridge decks), kept in step with the material settings like theirs
    const ownMaterials: THREE.MeshStandardMaterial[] = [];
    const inspectMaterialDefaults = new WeakMap<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
    // Top-down: the upright sprites (trees and other billboards, NPCs, loose
    // items) are edge-on from above, so they lie down as icons - on the floor,
    // the top of the picture toward the top of the screen, no bigger than a
    // cell (items grown, they are small). Put back when the view is left.
    const flatState = new WeakMap<THREE.Object3D, { scale: THREE.Vector3; child?: THREE.Object3D; childPos?: THREE.Vector3 }>();
    const flatRoots = new Set<THREE.Object3D>();
    const spriteOf = (root: THREE.Object3D): THREE.Mesh | undefined => {
      if (root.userData.spriteMesh) return root.userData.spriteMesh as THREE.Mesh;
      let found: THREE.Mesh | undefined;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!found && m.isMesh && m.geometry?.type === "PlaneGeometry") found = m;
      });
      if (found) root.userData.spriteMesh = found;
      return found;
    };
    function lieFlat(root: THREE.Object3D, child: THREE.Mesh | undefined, grow = 1) {
      let st = flatState.get(root);
      if (!st) {
        st = { scale: root.scale.clone(), child, childPos: child?.position.clone() };
        flatState.set(root, st);
      }
      flatRoots.add(root);
      root.rotation.order = "YXZ";
      root.rotation.set(-Math.PI / 2, -topdown.yaw, 0);
      const plane = (child ?? (root as THREE.Mesh)).geometry as THREE.PlaneGeometry | undefined;
      const w = plane?.parameters?.width;
      const h = plane?.parameters?.height;
      const k = grow * (w && h ? Math.min(1, 0.95 / Math.max(w, h)) : 1);
      root.scale.copy(st.scale).multiplyScalar(k);
      if (child) child.position.set(0, 0, 0.02);
    }
    function layFlatSprites() {
      if (!topdown.on) {
        if (flatRoots.size) {
          for (const root of flatRoots) {
            const st = flatState.get(root);
            root.rotation.order = "XYZ";
            root.rotation.x = 0;
            root.rotation.z = 0;
            if (st) {
              root.scale.copy(st.scale);
              if (st.child && st.childPos) st.child.position.copy(st.childPos);
            }
          }
          flatRoots.clear();
        }
        return;
      }
      for (const b of billboardProps) lieFlat(b, spriteOf(b));
      for (const entry of actorMeshes.values()) {
        lieFlat(entry.mesh, undefined);
        entry.mesh.position.y = floorY(Math.round(entry.mesh.position.x), Math.round(entry.mesh.position.z)) + 0.05;
      }
      for (const item of looseItems.values()) {
        if (item.taken) continue;
        // (the relief mesh is the template's child: centered on the item, then raised by its own
        // depth, so the back of the relief doesn't sink into the floor)
        const mesh = item.obj.children[0] as THREE.Mesh | undefined;
        lieFlat(item.obj, mesh, ITEM_TOPDOWN_GROW);
        if (mesh?.geometry) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox;
          if (box) mesh.position.set(0, 0, -box.min.z + 0.01);
        }
      }
    }
    // The debug normal / depth views draw a material's own map as its colour
    // (unlit: black base, the map as its emissive); the feature switches for
    // the sprites' normal maps and metalness (the wall kits' are set every
    // frame with the other sliders). Run when they change, and now and then
    // while one is on (sprites come and go).
    const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    flatNormal.needsUpdate = true;
    const midGrey = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    midGrey.needsUpdate = true;
    const mapViewSaved = new WeakMap<
      THREE.MeshStandardMaterial,
      { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; emissiveMap: THREE.Texture | null }
    >();
    let materialViewApplied = "";
    let materialViewTick = 0;
    const postPipeline = createPostPipeline({ renderer, scene, camera, settingsRef, latestMapRef });
    function applyMaterialViews(s: ViewportSettings) {
      const mapView = s.geometryView === "normals" || s.geometryView === "depth";
      const active = mapView || !s.showNormals || !s.showMetal;
      if (!active && materialViewApplied === "") return;
      const key = `${s.geometryView}|${s.showNormals}|${s.showMetal}`;
      materialViewTick++;
      if (key === materialViewApplied && materialViewTick % 45 !== 0) return;
      materialViewApplied = active ? key : "";
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const mat = m as THREE.MeshStandardMaterial;
          if (!mat.isMeshStandardMaterial) continue;
          if (mat.userData.sprite) {
            const n = s.showNormals ? (mat.userData.normalBase as number) : 0;
            mat.normalScale.set(n, n);
            mat.metalness = s.showMetal ? (mat.userData.metalBase as number) : 0;
          }
          const saved = mapViewSaved.get(mat);
          if (mapView) {
            if (!saved) mapViewSaved.set(mat, { color: mat.color.clone(), emissive: mat.emissive.clone(), emissiveIntensity: mat.emissiveIntensity, emissiveMap: mat.emissiveMap });
            const maps = viewMaps.get(mat);
            const tex = s.geometryView === "normals" ? (maps?.normal ?? mat.normalMap ?? flatNormal) : (maps?.depth ?? midGrey);
            if (mat.emissiveMap !== tex) {
              mat.emissiveMap = tex;
              mat.needsUpdate = true;
            }
            mat.color.setHex(0x000000);
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 1;
          } else if (saved) {
            mat.color.copy(saved.color);
            mat.emissive.copy(saved.emissive);
            mat.emissiveIntensity = saved.emissiveIntensity;
            mat.emissiveMap = saved.emissiveMap;
            mat.needsUpdate = true;
            mapViewSaved.delete(mat);
          }
        }
      });
    }
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 1 });
    // black backing behind every relief wall face, a little behind the deepest
    // recess: a height map that doesn't tile exactly leaves slivers between
    // panels that would show what's behind the wall (the next room, the floor)
    const backingPositions: number[] = [];
    // (the wall kit each belongs to: a texture with holes in it gets none, so what's behind shows)
    const backingPanels: BackingPanel[] = [];
    const backingMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, vertexColors: true });
    backingMat.visible = settings.wallBacking;
    let backingColorSerial = 0;
    // Stable during inspection: adjacent faces get widely separated hues.
    const backingColor = () => new THREE.Color().setHSL((0.13 + backingColorSerial++ * 0.61803398875) % 1, 0.85, 0.55);
    const backingColors: number[] = [];
    const sky = createSkySurface({
      map, loader, bust,
      setWaterSky: (texture) => decals.setWaterSky(texture),
      isDisposed: () => disposed,
    });

    const { geometries, wallGeo, floorGeo } = createBaseGeometry({ settings, wallHeight });

    const group = new THREE.Group();
    scene.add(group);
    doorPanelsRef.current.clear();
    doorAnimsRef.current.clear();

    // decals land on surface panels as they get placed (relief ones arrive
    // asynchronously)
    // world heights of a walkable cell's floor and ceiling
    // (`liveMap`: the map as edited since - what the quick preview shows, and
    // what sight, picking and heights go by - see applyStructure)
    // the black backing behind the relief walls (one mesh; left off while a quick preview shows)
    let backingObject: THREE.Object3D | null = null;
    const floorY = (x: number, y: number) => floorHeight(liveMap, x, y) * wallHeight;
    const ceilingY = (x: number, y: number) => ceilingHeight(liveMap, x, y) * wallHeight;

    const decals = new DecalLibrary({
      baseUrl: import.meta.env.BASE_URL,
      bust,
      loader,
      textureCache: cache.decalTextures,
      geometryCache: cache.decalGeometries,
      manifest: (cache.decalManifest ??= fetchDecalManifest(import.meta.env.BASE_URL, bust)),
      wallHeight,
      levels: (cell) => ({ floor: floorY(cell.x, cell.y), ceiling: ceilingY(cell.x, cell.y) }),
      // standing water lies over the floor's highest relief
      waterLift: floorDepth * 0.9 + 0.004,
      parent: group,
    });
    if (settings.decalsEnabled) track(decals.add(map.decals ?? []));
    const stopSharedDecals = onSharedDecalsChanged(ids => {
      const specs = latestMapRef.current.decals ?? [];
      if (!disposed && settings.decalsEnabled && specs.some(spec => ids.has(spec.decal))) track(decals.reset(specs));
    });
    // dev-only: inspect from the console
    if (import.meta.env.DEV && !doorPreview) Object.assign(window, { __voidcrewDecals: decals });

    let reliefStats: ReliefStats | null = null;

    const {
      facingSurfaces, markSurface, placeWalls, placeFloors, ceilingTiles, ceilingMaterial, placeCeilings, kits,
    } = createStructuralSurfaces({
      settings, doorPreview, map,
      group, lightGrid, wallHeight, primarySet, accentSet, accentKit, wallKits, wallKitFor, floorKitAt,
      ceilingKitAt, floorDepth, get litCells() { return mapLightState.litCells; }, get litColors() { return mapLightState.litColors; },
      get effectCells() { return mapLightState.effectCells; }, effectPanels, deckLampColor, windowFaces, windowKitFor,
      panelSetFor, frameKits, panelKits, doorKitFor, doorCells, ownMaterials, floorMat, ceilMat,
      backingPanels, sky, decals, geometries, floorGeo,
    });
    // floor glow fixtures, lifted above the floor relief once it's built
    const floorStrips: THREE.Mesh[] = [];

    const { buildRelief, lodScale, farReliefLevels, addPropLods, loadWithRetry } = createReliefGeometry({
      settings,
      settingsRef, get disposed() { return disposed; }, tick, cache, reliefDepth, decals,
    });

    const { buildBacking } = createWallBacking({
      get disposed() { return disposed; }, cache, group, reliefDepth, floorDepth, backingPositions,
      backingPanels, backingMat, backingColor, backingColors, geometries,
      get backingObject() { return backingObject; }, set backingObject(value) { backingObject = value; },
      loadWithRetry,
    });

    track(buildBacking()).catch((err) => console.error("Wall backing build failed:", err));

    const { joinEdgeCells, wallGeometry, joinedStrips } = createStructuralWalls({
      settings, doorPreview,
      get disposed() { return disposed; }, group, track, wallHeight, primaryKit, geometries, wallGeo,
      set reliefStats(value: ReliefStats | null) { reliefStats = value; }, placeWalls, kits, buildRelief, farReliefLevels,
      set culledCount(value: number) { culledCount = value; },
    });

    // every kit, for per-frame material updates and disposal (the props'
    // made as they're built, after this)
    const deckKits = [
      ...kits,
      ...floorKits.values(),
      ...frameKits.values(),
      ...panelKits.values(),
      ...ceilingKits.values(),
      ...windowKits.values(),
    ];
    const allKits = () => [...deckKits, ...propKits.values()];

    const { wiredGlass, spaceMat, sheenMat } = createStructuralTiles({
      group, track, isRelief, wallHeight, floorKits, ceilingKits, floorDepth, windowSet, windowKits, decals,
      geometries, floorGeo, markSurface, placeFloors, placeCeilings, floorStrips, buildRelief,
      farReliefLevels,
    });

    const { hybrid, buildPropRelief } = createStructuralDoors({
      settings,
      doorPanelsRef, openDoorsRef, get disposed() { return disposed; }, group, track, wallHeight,
      reliefDepth, frameKits, panelKits, doorCells, floorY, buildRelief, lodScale, labeledPanelMaterial,
      get doorGroups() { return doorGroups; },
    });

    const { cabinGlass, buildPillar, buildChamfer } = createStructuralProps({
      wallHeight, wallKitFor, propReliefDepth, sharedPropKitFor, ownMaterials, backingMat, backingColor,
      geometries, buildRelief, joinEdgeCells, wallGeometry, hybrid,
    });

    // ---- fences and blocks (see game/fences.ts) ----
    // Their floor marks while editing: a hatched square for a block, strips for the fences (amber, cyan, green)
    const fences = createFenceMarkers({ geometries, reliefDepth, editModeRef });
    // A fence or block piece's model: its faces - upright relief cutouts, as the panels' (front and mirrored
    // back, so it looks the same from both sides; a block's outer sides only), and flat caps - laid out round
    // the middle of its cell, in its texture sets (unset or not known: the deck's walls), and the floor mark
    async function buildFence(spec: FenceModelSpec): Promise<THREE.Group | null> {
      const template = new THREE.Group();
      const setOf = (id: string | undefined) => (isTextureSetId(id) ? id : primarySet);
      const sets = { main: setOf(spec.texture), top: setOf(spec.top ?? spec.texture), deco: setOf(spec.post?.texture ?? spec.texture) };
      const kitOf = (id: string) => {
        const kit = sharedPropKitFor(id);
        kit.normal = undefined;
        const normal = settingsRef.current.normalStrength;
        kit.wallMat.normalScale.set(normal, normal);
        return kit;
      };
      const relief = propReliefAmount(propReliefDepth, PROP_TYPES.fence_edge, hybrid);
      // foliage (layers, an X): the planes' panels merged into one model (see render/viewport/foliageMesh.ts)
      if (isFoliageSpec(spec)) {
        const foliage = await buildFoliage(
          { wallHeight, relief, coarse: PROP_COARSE, panel: buildPropRelief, far: farReliefLevels, geometries },
          kitOf(sets.main),
          spec,
        );
        if (!foliage) return null;
        template.add(foliage);
        template.add(fences.buildFenceMarker(spec));
        return template;
      }
      for (const f of fenceFaces(spec)) {
        const kit = kitOf(sets[f.tex]);
        if (f.kind === "cap") {
          const geo = new THREE.PlaneGeometry(f.sx, f.sz);
          geometries.push(geo);
          const cap = new THREE.Mesh(geo, roundMaterial(kit));
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(f.x, f.y * wallHeight + 0.002, f.z);
          template.add(cap);
          continue;
        }
        const whole = f.u0 <= 1e-6 && f.u1 >= 1 - 1e-6;
        const panel = await buildPropRelief(kit, {
          width: f.length,
          height: (f.y1 - f.y0) * wallHeight,
          flushEdges: false,
          depth: relief,
          coarse: PROP_COARSE,
          ...(whole ? {} : { cols: [f.u0, f.u1] as [number, number] }),
        });
        if (!panel) return null;
        const mesh = new THREE.Mesh(panel.geometry, [kit.wallMat, kit.sideMat]);
        mesh.position.set(f.x, ((f.y0 + f.y1) / 2) * wallHeight, f.z);
        mesh.rotation.y = f.yaw;
        if (f.mirror) mesh.scale.x = -1;
        template.add(mesh);
      }
      template.add(fences.buildFenceMarker(spec));
      return template;
    }

    // the billboard props (trees): turned to face the camera every frame
    const billboardProps: THREE.Object3D[] = [];
    const billboardMaterials: THREE.MeshStandardMaterial[] = [];
    async function buildPropTemplate(type: PropType): Promise<THREE.Group | null> {
      const [length, height, depth] = type.size;
      // (its texture sets take its own normal strength)
      const propKitFor = (setId: string) => {
        const kit = sharedPropKitFor(setId);
        kit.normal = type.normal;
        const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
        kit.wallMat.normalScale.set(normal, normal);
        return kit;
      };
      const relief = propReliefAmount(propReliefDepth, type, hybrid);
      const template = new THREE.Group();
      // a lever, button, plate or trap: plain boxes (see render/operableModel.ts)
      if (type.kind === "operable") {
        const built = buildOperableModel(type.model, type.size, type.elevation ?? 0, wallHeight, (mat) => {
          useLightGrid(mat, lightGrid);
          ownMaterials.push(mat);
        });
        geometries.push(...built.geometries);
        return built.group;
      }
      const face = (
        geo: THREE.BufferGeometry,
        kit: WallKit,
        pos: [number, number, number],
        rot: [number, number],
        mirror = false,
      ) => {
        const mesh = new THREE.Mesh(geo, [kit.wallMat, kit.sideMat]);
        mesh.position.set(...pos);
        mesh.rotation.set(rot[0], rot[1], 0);
        if (mirror) mesh.scale.x = -1;
        template.add(mesh);
      };

      if (type.kind === "box") {
        const sideKit = propKitFor(type.side);
        const topKit = propKitFor(type.top);
        const h = height * wallHeight;
        const side = await buildPropRelief(sideKit, { width: length, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        const top = await buildPropRelief(topKit, { width: length, height: depth, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        if (!side || !top) return null;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          face(side.geometry, sideKit, [(Math.sin(a) * length) / 2, h / 2, (Math.cos(a) * depth) / 2], [0, a]);
        }
        face(top.geometry, topKit, [0, h, 0], [-Math.PI / 2, 0]);
        return template;
      }

      if (type.kind === "billboard") {
        // one flat sprite, turned to the viewer every frame (see billboardProps)
        const paths = isTextureSetId(type.texture) ? TEXTURE_SETS[type.texture] : textureFolder(type.texture);
        const diffuse = kitTexture(busted(paths.diffuse));
        const normalMap = kitTexture(busted(paths.normal));
        diffuse.colorSpace = THREE.SRGBColorSpace;
        for (const tex of [diffuse, normalMap]) tex.magFilter = THREE.NearestFilter;
        const tune = textureTuning(type.texture);
        const mat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap,
          alphaTest: 0.5,
          roughness: Math.min(1, 0.85 * (tune?.rough ?? 1)),
          metalness: Math.min(1, 0.02 * (tune?.metal ?? 1)),
          side: THREE.DoubleSide,
        });
        const normal = settingsRef.current.normalStrength * (type.normal ?? 1) * (tune?.normal ?? 1);
        mat.normalScale.set(normal, normal);
        markSprite(mat, normal, normalMap);
        useLightGrid(mat, lightGrid);
        billboardMaterials.push(mat);
        const h = height * wallHeight;
        const geo = new THREE.PlaneGeometry(length, h);
        geometries.push(geo);
        const sprite = new THREE.Mesh(geo, mat);
        sprite.position.y = h / 2 + (type.elevation ?? 0) * wallHeight;
        template.add(sprite);
        return template;
      }

      if (type.kind === "prism") {
        const alternate = type.textureB && (!isSharedTextureId(type.textureB) || isTextureSetId(type.textureB)) ? type.textureB : undefined;
        const material = (id: string) => {
          const key = `prism:${id}`;
          let kit = propKits.get(key);
          if (!kit) {
            kit = createWallKit(id, false, false);
            kit.wallMat.alphaTest = 0.5;
            kit.wallMat.side = THREE.DoubleSide;
            useLightGrid(kit.wallMat, lightGrid);
            propKits.set(key, kit);
          }
          return kit.wallMat;
        };
        const geometry = propPrismGeometry(prismFaces(length, depth, prismSides(type.sides), prismInset(type.inset), !!alternate), height * wallHeight);
        geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, [material(type.texture), material(alternate ?? type.texture)]);
        mesh.position.y = (type.elevation ?? 0) * wallHeight;
        template.add(mesh);
        return template;
      }

      if (type.kind === "panel" || type.kind === "cross") {
        // front and back (the back mirrored), crossed for a cross
        const kit = propKitFor(type.texture);
        const h = height * wallHeight;
        const panel = await buildPropRelief(kit, {
          width: length, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE,
          outwardRelief: type.kind === "cross",
        }, propReliefCells(type));
        if (!panel) return null;
        const y = (type.elevation ?? 0) * wallHeight + h / 2;
        for (const turn of type.kind === "cross" ? [0, Math.PI / 2] : [0]) {
          face(panel.geometry, kit, [0, y, 0], [0, turn]);
          face(panel.geometry, kit, [0, y, 0], [0, turn + Math.PI], true);
        }
        return template;
      }

      if (type.kind === "cabin") {
        const [door, inside, side, top] = propSets(type).map((id) => propKitFor(id));
        const h = height * wallHeight;
        const panel = (kit: WallKit, w: number, ph: number) =>
          buildPropRelief(kit, { width: w, height: ph, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        const d = await panel(door, length, h);
        const b = await panel(inside, length, h);
        const s = await panel(side, depth, h);
        const t = await panel(top, length, depth);
        if (!d || !b || !s || !t) return null;
        const inset = 0.006;
        // the door (and its inside), the back wall's inside
        face(d.geometry, door, [0, h / 2, depth / 2], [0, 0]);
        face(d.geometry, door, [0, h / 2, depth / 2], [0, Math.PI], true);
        face(b.geometry, inside, [0, h / 2, -depth / 2 + inset], [0, 0]);
        // the sides, outside and in; the roof, outside and in
        face(s.geometry, side, [length / 2, h / 2, 0], [0, Math.PI / 2]);
        face(s.geometry, side, [-length / 2, h / 2, 0], [0, -Math.PI / 2], true);
        face(s.geometry, side, [length / 2 - inset, h / 2, 0], [0, -Math.PI / 2], true);
        face(s.geometry, side, [-length / 2 + inset, h / 2, 0], [0, Math.PI / 2]);
        face(t.geometry, top, [0, h, 0], [-Math.PI / 2, 0]);
        face(t.geometry, top, [0, h - inset, 0], [Math.PI / 2, 0]);
        // a pane of glass just behind the door's frame
        const glassGeo = new THREE.PlaneGeometry(length, h);
        geometries.push(glassGeo);
        const glass = new THREE.Mesh(glassGeo, cabinGlass);
        glass.position.set(0, h / 2, depth / 2 - 0.012);
        template.add(glass);
        return template;
      }

      if (type.kind === "roof") {
        // Flat triangles at 45 degrees (and flat stretches) in the wall set's
        // diffuse and normal maps, repeating along the slope - no relief
        // geometry (see roofKitFor and roofMesh.ts); the thick edge and the
        // underside have the plain texture
        const kit = roofKitFor(type.texture ?? primarySet);
        kit.normal = type.normal;
        const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
        kit.wallMat.normalScale.set(normal, normal);
        const { top, under } = buildRoofGeometry(type.profile, type.corner, type.eaves);
        geometries.push(top, under);
        template.add(new THREE.Mesh(top, kit.wallMat), new THREE.Mesh(under, kit.sideMat));
        return template;
      }
      if (type.kind === "pillar" || type.kind === "chamfer" || type.kind === "fence") return null;
      const [front, side, top] = propSets(type).map((id) => propKitFor(id));
      // What each view covers (see PropType's px): at one pixel scale -
      // the front view's across the prop's length - standing on the floor,
      // centered, or for a wall prop starting at the wall (-z); without px,
      // the prop's own extent
      const px = type.kind === "views" ? type.px : undefined;
      const scale = px ? length / px.front[0] : 0;
      const frontY = px ? px.front[1] * scale : height;
      const sideY = px ? px.side[1] * scale : height;
      const sideZ = px ? px.side[0] * scale : depth;
      const topX = px ? px.top[0] * scale : length;
      const topZ = px ? px.top[1] * scale : depth;
      const zFrom = (extent: number) => (type.wall ? -depth / 2 : -extent / 2);
      const clampRange = ([a, b]: [number, number]): [number, number] => {
        const lo = Math.min(1, Math.max(0, a));
        return [lo, Math.max(lo + 1e-3, Math.min(1, b))];
      };
      // the whole views first: their builds give the kits their AO maps
      for (const [kit, w, h] of [
        [front, length, frontY * wallHeight],
        [side, sideZ, sideY * wallHeight],
        [top, topX, topZ],
      ] as const) {
        if (!(await buildPropRelief(kit, { width: w, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE }))) return null;
      }
      const cut = (kit: WallKit, w: number, h: number, cols: [number, number], rows: [number, number]) =>
        buildPropRelief(kit, {
          width: w,
          height: h,
          flushEdges: false,
          depth: relief,
          coarse: PROP_COARSE,
          cols: clampRange(cols),
          rows: clampRange(rows),
        });
      const lift = (type.kind === "views" ? (type.elevation ?? 0) : 0) * wallHeight;
      const sideZ0 = zFrom(sideZ);
      const topZ0 = zFrom(topZ);
      // where a point shows in each view (image 0..1, rows down) - for a
      // part whose views show it elsewhere (PropPart.src), the part's box
      // stretched onto that place
      const views = {
        front: (x: number, y: number): [number, number] => [(x + length / 2) / length, (frontY - y) / frontY],
        // (the side view runs from the front (+z) on its left to the back)
        side: (z: number, y: number): [number, number] => [(sideZ0 + sideZ - z) / sideZ, (sideY - y) / sideY],
        top: (x: number, z: number): [number, number] => [(x + topX / 2) / topX, (z - topZ0) / topZ],
      };
      for (const part of type.parts) {
        const { min, max } = part;
        const [x0, y0, z0] = min;
        const [x1, y1, z1] = max;
        const off = new Set(part.off ?? []);
        // a coordinate of the part on `axis`, moved onto its place in a view
        const inView = (view: PropView, axis: 0 | 1 | 2, v: number) => {
          const src = part.src?.[view];
          if (!src || max[axis] === min[axis]) return v;
          return src.min[axis] + ((v - min[axis]) / (max[axis] - min[axis])) * (src.max[axis] - src.min[axis]);
        };
        if (part.shape === "cylinder") {
          addCylinder(part, off, inView);
          continue;
        }
        const cx = (x0 + x1) / 2;
        const cy = ((y0 + y1) / 2) * wallHeight + lift;
        const cz = (z0 + z1) / 2;
        const h = (y1 - y0) * wallHeight;
        const span = (a: [number, number], b: [number, number]): [[number, number], [number, number]] => [
          [Math.min(a[0], b[0]), Math.max(a[0], b[0])],
          [Math.min(a[1], b[1]), Math.max(a[1], b[1])],
        ];
        const [alongX, frontRows] = span(
          views.front(inView("front", 0, x0), inView("front", 1, y0)),
          views.front(inView("front", 0, x1), inView("front", 1, y1)),
        );
        const [alongZ, sideRows] = span(
          views.side(inView("side", 2, z0), inView("side", 1, y0)),
          views.side(inView("side", 2, z1), inView("side", 1, y1)),
        );
        const [topCols, topRows] = span(
          views.top(inView("top", 0, x0), inView("top", 2, z0)),
          views.top(inView("top", 0, x1), inView("top", 2, z1)),
        );
        const f = off.has("front") && off.has("back") ? null : await cut(front, x1 - x0, h, alongX, frontRows);
        const s = off.has("right") && off.has("left") ? null : await cut(side, z1 - z0, h, alongZ, sideRows);
        const t = off.has("top") ? null : await cut(top, x1 - x0, z1 - z0, topCols, topRows);
        // the back and the -x end show their views mirrored
        if (f && !off.has("front")) face(f.geometry, front, [cx, cy, z1], [0, 0]);
        if (f && !off.has("back")) face(f.geometry, front, [cx, cy, z0], [0, Math.PI], true);
        if (s && !off.has("right")) face(s.geometry, side, [x1, cy, cz], [0, Math.PI / 2]);
        if (s && !off.has("left")) face(s.geometry, side, [x0, cy, cz], [0, -Math.PI / 2], true);
        if (!t) continue;
        // a top hidden under a part above it would show that part's top
        // view (a table's foot wearing its top's wood): left out
        const covered = type.parts.some(
          (o) => o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
        );
        if (!covered) face(t.geometry, top, [cx, y1 * wallHeight + lift, cz], [-Math.PI / 2, 0]);
      }
      return template;

      // A round part: an upright cylinder (elliptic, filling its box) with
      // no relief, its side's every strip textured from the view that looks
      // at it - the front view on its front and back quarters, the side view
      // on its ends - and its top from the top view, all projected straight
      // through as the views were drawn
      function addCylinder(part: PropPart, off: Set<PropFace>, inView: (view: PropView, axis: 0 | 1 | 2, v: number) => number) {
        const [x0, y0, z0] = part.min;
        const [x1, y1, z1] = part.max;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const rx = (x1 - x0) / 2;
        const rz = (z1 - z0) / 2;
        const ya = y0 * wallHeight + lift;
        const yb = y1 * wallHeight + lift;
        const uv = ([u, v]: [number, number]): [number, number] => [Math.min(1, Math.max(0, u)), 1 - Math.min(1, Math.max(0, v))];
        const frontUV = (x: number, y: number) => uv(views.front(inView("front", 0, x), inView("front", 1, y)));
        const sideUV = (z: number, y: number) => uv(views.side(inView("side", 2, z), inView("side", 1, y)));
        const topUV = (x: number, z: number) => uv(views.top(inView("top", 0, x), inView("top", 2, z)));
        const strips = { front: { pos: [] as number[], uv: [] as number[] }, side: { pos: [] as number[], uv: [] as number[] } };
        const at = (a: number): [number, number] => [cx + rx * Math.sin(a), cz + rz * Math.cos(a)];
        for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
          const a0 = (k / CYLINDER_SEGMENTS) * Math.PI * 2;
          const a1 = ((k + 1) / CYLINDER_SEGMENTS) * Math.PI * 2;
          const mid = (a0 + a1) / 2;
          // (which quarter it faces: +z front, -z back, +x right, -x left)
          const facing: PropFace = Math.abs(Math.cos(mid)) >= Math.abs(Math.sin(mid)) ? (Math.cos(mid) > 0 ? "front" : "back") : Math.sin(mid) > 0 ? "right" : "left";
          if (off.has(facing)) continue;
          const ends = facing === "right" || facing === "left";
          const strip = ends ? strips.side : strips.front;
          const [p0x, p0z] = at(a0);
          const [p1x, p1z] = at(a1);
          const tex = (x: number, z: number, y: number) => (ends ? sideUV(z, y / wallHeight) : frontUV(x, y / wallHeight));
          const corners: [number, number, number][] = [
            [p0x, ya - lift, p0z],
            [p1x, ya - lift, p1z],
            [p1x, yb - lift, p1z],
            [p0x, yb - lift, p0z],
          ];
          // (two triangles, counter-clockwise seen from outside)
          for (const i of [0, 1, 2, 0, 2, 3]) {
            const [x, y, z] = corners[i];
            strip.pos.push(x, y + lift, z);
            strip.uv.push(...tex(x, z, y));
          }
        }
        const mesh = (pos: number[], uvs: number[], kit: WallKit) => {
          if (!pos.length) return;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
          geo.computeVertexNormals();
          geometries.push(geo);
          template.add(new THREE.Mesh(geo, roundMaterial(kit)));
        };
        mesh(strips.front.pos, strips.front.uv, front);
        mesh(strips.side.pos, strips.side.uv, side);
        // the top: a fan round its middle (unless a part above covers it)
        const covered = type.kind === "views" && type.parts.some(
          (o) => o !== part && o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
        );
        if (off.has("top") || covered) return;
        const pos: number[] = [];
        const uvs: number[] = [];
        for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
          const [p0x, p0z] = at((k / CYLINDER_SEGMENTS) * Math.PI * 2);
          const [p1x, p1z] = at(((k + 1) / CYLINDER_SEGMENTS) * Math.PI * 2);
          for (const [x, z] of [
            [cx, cz],
            [p0x, p0z],
            [p1x, p1z],
          ] as const) {
            pos.push(x, yb, z);
            uvs.push(...topUV(x, z));
          }
        }
        mesh(pos, uvs, top);
      }
    }
    // a round part's sides: no relief, so the view's see-through pixels cut
    // it out here, and it's seen from inside too (through those)
    const CYLINDER_SEGMENTS = 24;
    const roundMaterials = new Map<WallKit, THREE.MeshStandardMaterial>();
    function roundMaterial(kit: WallKit): THREE.MeshStandardMaterial {
      let mat = roundMaterials.get(kit);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          map: kit.wallMat.map,
          normalMap: kit.wallMat.normalMap,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          roughness: settingsRef.current.roughness,
          metalness: settingsRef.current.metalness,
        });
        mat.userData.normal = kit.normal;
        mat.userData.tuneId = kit.id;
        const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
        mat.normalScale.set(normal, normal);
        addDirectLightOcclusion(mat, cavity);
        useLightGrid(mat, lightGrid);
        ownMaterials.push(mat);
        roundMaterials.set(kit, mat);
      }
      return mat;
    }

    // the doors, by door cell key (the editor's selection)
    const doorGroups = new Map<string, THREE.Object3D>();
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
    // what a prop's model depends on: its type and texture, and for a pillar or
    // a chamfer its height and the wall texture around it
    function propBuildKey(m: GameMap, spec: PropSpec, index: number): string {
      // a fence or block piece: its settings and what its neighbours make of it (see fenceModelSpec) - a
      // neighbour changing changes this piece's key
      if (fenceFormOf(spec.prop)) {
        const fences = fenceIndex(m.props);
        const piece = fences.byIndex.get(index);
        return piece ? `fence|${JSON.stringify(fenceModelSpec(fences, piece))}` : `${spec.prop}|`;
      }
      const texture = spec.texture ?? "";
      const type = retextured(PROP_TYPES[spec.prop], texture || undefined, isTextureSetId);
      if (type.kind !== "pillar" && type.kind !== "chamfer") return `${spec.prop}|${texture}`;
      const h = propHeight(m, spec) * wallHeight;
      // its own texture, else the wall texture painted in its cell or beside it, else the deck's
      const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => m.wallTextureAt?.(spec.cell.x + dx, spec.cell.y + dy))
        .find((id) => isTextureSetId(id));
      const own = texture || near;
      const setId = isTextureSetId(own) ? own : primarySet;
      return `${spec.prop}|${texture}|${h}|${setId}`;
    }
    function propModel(key: string): Promise<THREE.Group | null> {
      let made = propModels.get(key);
      if (made) return made;
      if (key.startsWith("fence|")) {
        const fenceMade = buildFence(JSON.parse(key.slice(6)) as FenceModelSpec).then(async (g) => {
          if (g) await addPropLods(g);
          return g;
        });
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
      made = build.then(async (g) => {
        if (g) await addPropLods(g);
        return g;
      });
      propModels.set(key, made);
      return made;
    }
    // a prop's object where its spec puts it
    function placeProp(obj: THREE.Object3D, spec: PropSpec) {
      const type = PROP_TYPES[spec.prop];
      const { x, z, yaw } = propPlacement(spec);
      obj.position.set(x, floorY(spec.cell.x, spec.cell.y) + (spec.elevation ?? 0) * wallHeight, z);
      obj.rotation.y = -yaw;
      // (bigger or smaller: a pillar only wider - it still fills its room)
      // (a fence or block piece is the size its settings say: its bodies don't scale)
      const scale = type.kind === "fence" ? 1 : spec.scale ?? 1;
      obj.scale.set(scale, type.kind === "pillar" ? 1 : scale, scale);
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
      const key = propBuildKey(m, spec, index);
      track(async () => {
        const made = await propModel(key);
        if (!made || version !== propsVersion) return;
        const now = propSpecs[index];
        // (changed again meanwhile into something else: that build places it)
        if (!now || !PROP_TYPES[now.prop] || propBuildKey(propsMap, now, index) !== key) return;
        const prop = made.clone();
        placeProp(prop, now);
        prop.userData.prop = true;
        // the editor picks it by this (its index in the map's props)
        prop.userData.propIndex = index;
        prop.userData.propType = now.prop;
        prop.userData.propKey = key;
        const old = propObjects.get(index);
        if (old) {
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
      for (const obj of propObjects.values()) group.remove(obj);
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
        const key = propBuildKey(next, spec, i);
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

    // the robots as the smoke feels them (see updateActors)
    const smokeBodies: SmokeBody[] = [];
    const smokeFire = createSmokeFire({
      scene, group, camera, map, getLatestMap: () => latestMapRef.current, settings, lightGrid,
      wallHeight, floorY, ceilingY, geometries, editModeRef, hiddenLayersRef, selectedSmokeRef,
    });
    // a lever, button or plate switched emitters on or off (see emitterStore.ts): the particle systems are made anew -
    // only when the set of shown emitters really changed
    const offEmitters = emitterView.subscribe(() => {
      const m = latestMapRef.current;
      if (!smokeFire.shownChanged(m)) return;
      smokeFire.applySmoke(m);
      sceneVersion++;
    });

    const editorMarkers = createEditorMarkers({
      group, camera, map, geometries, floorY, wallHeight, reliefDepth, editModeRef, hiddenLayersRef, selectedSoundRef,
    });
    const { soundMarkers, linkPlates, buildSoundMarkers } = editorMarkers;

    const itemsLoot = createItemsLoot({
      group, map, getLatestMap: () => latestMapRef.current, lootRef, getVisibleCells: () => sight.cells,
      draggedWorldItem, markLooted, isDisposed: () => disposed, track, geometries, grids: cache.grids,
      sharedPropKitFor, loadWithRetry, buildPropRelief, lightGrid, propReliefDepth, wallHeight, floorY,
    });
    const { buildItems, clearItems, updateLoot, looseItems } = itemsLoot;
    // an emptied container: its lid lifted a little and askew, a chalk
    // cross on it (or, lidless, on its front)
    // (a copy of each face material with the cross chalked into its
    // diffuse: it follows the relief, and takes the light as the paint does)
    const chalked = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    function chalkedMaterial(mat: THREE.Material): THREE.MeshStandardMaterial | null {
      const known = chalked.get(mat);
      if (known) return known;
      const kit = [...propKits.values()].find((k) => k.wallMat === mat);
      const image = kit?.wallMat.map?.image as HTMLImageElement | undefined;
      if (!kit || !image?.width) return null;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      drawChalkCross(ctx, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = kit.wallMat.map!.magFilter;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: kit.wallMat.normalMap,
        aoMap: kit.wallMat.aoMap,
        aoMapIntensity: kit.wallMat.aoMapIntensity,
        roughness: kit.wallMat.roughness,
        metalness: kit.wallMat.metalness,
        roughnessMap: kit.wallMat.roughnessMap,
        metalnessMap: kit.wallMat.metalnessMap,
      });
      material.userData.surface = kit.wallMat.userData.surface;
      material.userData.accentUniforms = kit.wallMat.userData.accentUniforms;
      addDirectLightOcclusion(material, cavity);
      useLightGrid(material, lightGrid);
      ownMaterials.push(material);
      kit.textures.push(texture);
      chalked.set(mat, material);
      return material;
    }
    function markLooted(looted: ReadonlySet<number> | undefined) {
      for (const index of looted ?? []) {
        if (markedProps.has(index)) continue;
        const obj = propObjects.get(index);
        const spec = map.props?.[index];
        if (!obj || !spec) continue;
        // its faces' textures (not loaded yet: next frame)
        const faces: { mesh: THREE.Mesh; mats: THREE.Material[]; chalk: THREE.MeshStandardMaterial }[] = [];
        let ready = true;
        obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
          const chalk = chalkedMaterial(mesh.material[0]);
          if (chalk) faces.push({ mesh, mats: mesh.material, chalk });
          else ready = false;
        });
        if (!ready) continue;
        markedProps.add(index);
        for (const { mesh, mats, chalk } of faces) mesh.material = [chalk, ...mats.slice(1)];
        if (PROP_TYPES[spec.prop].kind === "box") {
          // the lid (the box's last face - see buildPropTemplate) lifted a
          // little and askew
          const lid = obj.children[obj.children.length - 1];
          lid.position.y += 0.03;
          lid.position.z -= 0.02;
          lid.rotation.x += 0.12;
        }
      }
    }

    // a copy of the kit's panel material whose diffuse has the door's label
    // stenciled into the panel's label field
    async function labeledPanelMaterial(spec: DoorSpec, kit: WallKit): Promise<THREE.MeshStandardMaterial> {
      // (the door's own leaf texture, if it has one, is what gets the stencil)
      const setPaths = TEXTURE_SETS[isTextureSetId(spec.leafTexture) ? spec.leafTexture : panelSetFor(spec.kind)];
      const image = (await loader.loadAsync(busted(setPaths.diffuse))).image as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const paint = (img: { width: number; height: number; rgba: Uint8Array }, ox: number, oy: number) => {
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (!img.rgba[i + 3]) continue;
            const o = ((oy + y) * canvas.width + ox + x) * 4;
            pixels.data[o] = img.rgba[i];
            pixels.data[o + 1] = img.rgba[i + 1];
            pixels.data[o + 2] = img.rgba[i + 2];
          }
        }
      };

      // a lift door shows its deck's number at the top of the field, upright
      const field = { ...DOOR_LABEL_AREA };
      if (spec.kind === "lift") {
        const number = renderText(String(map.deck), DOOR_LABEL_MAX_SCALE, labelPaint, labelPaintDark, 0.06, seededRandom(String(map.deck)));
        paint(number, field.x + Math.floor((field.w - number.width) / 2), field.y);
        field.y += number.height + DOOR_NUMBER_GAP;
        field.h -= number.height + DOOR_NUMBER_GAP;
      }
      if (spec.label) {
        // the biggest stencil that fits the rest of the field, up to a
        // readable maximum (turned to run down the panel if it's vertical)
        const stencil = (scale: number) => {
          const text = renderText(spec.label!, scale, labelPaint, labelPaintDark, 0.06, seededRandom(spec.label!));
          return spec.labelVertical ? turnClockwise(text) : text;
        };
        let label = stencil(1);
        for (let scale = DOOR_LABEL_MAX_SCALE; scale >= 1; scale--) {
          label = stencil(scale);
          if (label.width <= field.w && label.height <= field.h) break;
        }
        paint(label, field.x + Math.floor((field.w - label.width) / 2), field.y + Math.floor((field.h - label.height) / 2));
      }
      ctx.putImageData(pixels, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: kit.wallMat.normalMap,
        aoMap: kit.wallMat.aoMap,
        roughness: settingsRef.current.roughness,
        metalness: settingsRef.current.metalness,
        // (the hybrid doors' pixel edge: see the map's relief mode)
        alphaTest: settings.reliefMode === "smooth" ? 0.5 : 0,
      });
      addDirectLightOcclusion(material, cavity);
      // (a door panel is the deck's own: it takes the ship's livery)
      material.userData.accent = true;
      ownMaterials.push(material);
      kit.textures.push(texture);
      return material;
    }

    // --- trim: worn yellow paint (ladders) and hazard stripes (bridge
    // edges), repeating at the walls' pixel density on boxes of any size ---
    function trimTexture(url: string, wrap: THREE.Wrapping): THREE.Texture {
      const tex = kitTexture(url + bust, (t) => {
        // the boxes' UVs count texels (trimBox): one repeat per image size
        const img = t.image as HTMLImageElement;
        t.repeat.set(1 / img.width, 1 / img.height);
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = tex.wrapT = wrap;
      return tex;
    }
    const trimTextures = [
      // mirrored: a patch cut from a decal tiles without seams that way
      trimTexture(TRIM_PAINT_URL, THREE.MirroredRepeatWrapping),
      // already a whole number of stripe periods wide
      trimTexture(TRIM_HAZARD_URL, THREE.RepeatWrapping),
    ];
    const [paintMat, hazardMat] = trimTextures.map(
      (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.3 }),
    );
    // a box whose UVs run in texels (TRIM_TEXELS per world unit) on every
    // face; one per size
    const trimBoxes = new Map<string, THREE.BoxGeometry>();
    function trimBox(w: number, h: number, d: number, uvScale = TRIM_TEXELS): THREE.BoxGeometry {
      const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${uvScale}`;
      let geo = trimBoxes.get(key);
      if (!geo) {
        geo = new THREE.BoxGeometry(w, h, d);
        // BoxGeometry faces (+x, -x, +y, -y, +z, -z), 4 vertices each, and
        // the box dimensions their u and v run along
        const spans = [
          [d, h],
          [d, h],
          [w, d],
          [w, d],
          [w, h],
          [w, h],
        ];
        const uv = geo.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) {
          const [su, sv] = spans[Math.floor(i / 4)];
          uv.setXY(i, uv.getX(i) * su * uvScale, uv.getY(i) * sv * uvScale);
        }
        trimBoxes.set(key, geo);
        geometries.push(geo);
      }
      return geo;
    }

    // --- ladders: rails and rungs standing against the step face, the rails
    // reaching above the ledge and bending over onto it as handholds ---
    const ladderBox = new THREE.BoxGeometry(1, 1, 1);
    geometries.push(ladderBox);
    for (const ladder of map.ladders ?? []) {
      const v = DIR_VECTOR[ladder.wall];
      const { x, y } = ladder.cell;
      const bottom = floorY(x, y);
      const h = floorY(x + v.x, y + v.y) - bottom;
      const reach = h + LADDER_HANDHOLD * wallHeight;
      const z = LADDER_STANDOFF;
      const ladderGroup = new THREE.Group();
      // like the wall panel it stands against: local +Z faces the foot's cell
      ladderGroup.position.set(x + v.x * 0.5, bottom, y + v.y * 0.5);
      ladderGroup.rotation.y = WALL_ROTATION[ladder.wall];
      const bar = (w: number, bh: number, d: number, px: number, py: number, pz: number) => {
        const mesh = new THREE.Mesh(trimBox(w, bh, d), paintMat);
        mesh.position.set(px, py, pz);
        ladderGroup.add(mesh);
      };
      for (const side of [-1, 1]) {
        const rx = side * LADDER_HALF_WIDTH;
        bar(LADDER_RAIL, reach, LADDER_RAIL, rx, reach / 2, z);
        // over the edge and down onto the floor above
        bar(LADDER_RAIL, LADDER_RAIL, z + LADDER_NECK, rx, reach, (z - LADDER_NECK) / 2);
        bar(LADDER_RAIL, reach - h, LADDER_RAIL, rx, h + (reach - h) / 2, -LADDER_NECK);
        // brackets holding it off the wall
        for (const by of [0.12 * wallHeight, h - 0.08 * wallHeight]) bar(LADDER_RAIL, LADDER_RAIL, z, rx, by, z / 2);
      }
      const spacing = RUNG_SPACING * wallHeight;
      for (let ry = spacing; ry <= h + 1e-6; ry += spacing) {
        bar(LADDER_HALF_WIDTH * 2, LADDER_RUNG, LADDER_RUNG, 0, ry, z);
      }
      group.add(ladderGroup);
    }

    // --- bridges: a strip of the cell's floor texture as the deck, with a
    // low hazard-striped kick plate along each edge. A grate deck has its
    // slots cut open, seen from both sides, resting on two slim stringers;
    // any other deck sits on a solid steel body. ---
    const stoneBridge = map.world === "fantasy";
    const bridgeMat = new THREE.MeshStandardMaterial(stoneBridge ? { map: primaryKit.wallMat.map, roughness: 1, metalness: 0 } : { color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
    // a see-through deck is seen from below as well
    const doubleSided = (src: THREE.MeshStandardMaterial) => {
      const mat = new THREE.MeshStandardMaterial({
        map: src.map,
        normalMap: src.normalMap,
        roughness: settings.roughness,
        metalness: settings.metalness,
        side: THREE.DoubleSide,
      });
      ownMaterials.push(mat);
      return mat;
    };
    const grateMats = new Map<WallKit, THREE.MeshStandardMaterial[]>();
    for (const bridge of map.bridges ?? []) {
      const { x, y } = bridge.cell;
      const deckY = bridge.height * wallHeight;
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(x, deckY, y);
      // built running east-west (local X)
      if (bridge.axis === "NS") bridgeGroup.rotation.y = Math.PI / 2;
      const box = (w: number, h: number, d: number, px: number, py: number, pz: number, mat: THREE.Material) => {
        const mesh = new THREE.Mesh(ladderBox, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(px, py, pz);
        bridgeGroup.add(mesh);
      };
      for (const side of [-1, 1]) {
        const kick = new THREE.Mesh(trimBox(1, BRIDGE_KICK, LADDER_RAIL, stoneBridge ? 1 : TRIM_TEXELS), stoneBridge ? bridgeMat : hazardMat);
        kick.position.set(0, BRIDGE_KICK / 2 - 0.01, side * (BRIDGE_WIDTH / 2));
        bridgeGroup.add(kick);
      }
      group.add(bridgeGroup);
      if (stoneBridge) {
        box(1, BRIDGE_THICKNESS, BRIDGE_WIDTH, 0, -BRIDGE_THICKNESS / 2, 0, bridgeMat);
        continue;
      }

      // the walking surface: the middle band of the floor tile, as wide as
      // the deck, so its texels stay square
      const kit = floorKitAt(x, y);
      const grate = isRelief && kit?.grateLevels ? kit.grateLevels : 0;
      if (grate) {
        for (const side of [-1, 1]) {
          const z = side * (BRIDGE_WIDTH / 2 - BRIDGE_STRINGER / 2);
          box(1, BRIDGE_THICKNESS, BRIDGE_STRINGER, 0, -BRIDGE_THICKNESS / 2 - 0.02, z, bridgeMat);
        }
      } else {
        box(1, BRIDGE_THICKNESS, BRIDGE_WIDTH, 0, -BRIDGE_THICKNESS / 2 - 0.002, 0, bridgeMat);
      }
      if (!kit) {
        box(1, 0.004, BRIDGE_WIDTH, 0, 0, 0, floorMat);
        continue;
      }
      const rows: [number, number] = [(1 - BRIDGE_WIDTH) / 2, (1 + BRIDGE_WIDTH) / 2];
      const deckGeometry = isRelief
        ? buildRelief(kit, { height: BRIDGE_WIDTH, flushEdges: false, depth: floorDepth, rows, holeLevels: grate }).then(
            (relief) => relief?.geometry ?? null,
          )
        : Promise.resolve(createBandPlane(BRIDGE_WIDTH, rows));
      track(deckGeometry)
        .then((geo) => {
          if (!geo) return;
          if (!isRelief) geometries.push(geo);
          let mats: THREE.Material | THREE.Material[] = isRelief ? [kit.wallMat, kit.sideMat] : kit.wallMat;
          if (grate) {
            let own = grateMats.get(kit);
            if (!own) {
              own = [doubleSided(kit.wallMat), doubleSided(kit.sideMat)];
              grateMats.set(kit, own);
            }
            mats = own;
          }
          const deck = new THREE.Mesh(geo, mats);
          // laid flat facing up; local X (the band's length) along the bridge
          deck.rotation.x = -Math.PI / 2;
          bridgeGroup.add(deck);
        })
        .catch((err) => console.error("Bridge build failed:", err));
    }

    const lightFixtures = createLightFixtures({
      map, group, wallHeight, geometries, floorStrips, ceilingKitAt, ceilingY, lights: mapLightState, ceilingTiles, ceilingMaterial,
    });
    const { addFlash, updateLightPool } = createLightPool({
      map, scene, settings, settingsRef, lightGrid, wallHeight, lights: mapLightState, getLiveMap: () => liveMap, openDoorsRef,
      getActorMeshes: () => actorMeshes, smokeFire, actorsRef,
      refreshSight: (party, range) => {
        applySight(updateSight(party, range));
        return sight.cells;
      },
    });
    // the cells seen from the party's cell, redone when it changes cell or
    // a door opens or shuts
    // The cells seen from the party's cell (see visibility.ts) - from its
    // center and near its corners, so moving about in it (free movement)
    // shows nothing new. Redone when the party changes cell or a door opens
    // or shuts; picks the lights (updateLightPool) and what gets drawn
    // (applySight).
    // the top-down camera (see TOPDOWN_*): what it looks at (x, z), its height
    // above the floor, its tilt (90 degrees: straight down) and heading
    const topdown = topdownRef.current;
    let topCaps: THREE.Group | null = null;
    // the walls seen from above: a dark, see-through cap on each wall cell (the walls
    // are only faces, so they'd be nothing from up here)
    const capMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const capGeometry = new THREE.PlaneGeometry(1, 1);
    function buildCaps() {
      if (topCaps) {
        scene.remove(topCaps);
        topCaps = null;
      }
      const caps = new THREE.Group();
      for (let y = 0; y < liveMap.height; y++) {
        for (let x = 0; x < liveMap.width; x++) {
          if (cellAt(liveMap, x, y) !== "wall") continue;
          let top = 1;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (cellAt(liveMap, x + dx, y + dy) !== "wall") top = Math.max(top, ceilingHeight(liveMap, x + dx, y + dy));
          }
          const cap = new THREE.Mesh(capGeometry, capMaterial);
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(x, top * wallHeight + 0.01, y);
          caps.add(cap);
        }
      }
      topCaps = caps;
      scene.add(caps);
    }
    function setTopdown(on: boolean) {
      if (on === topdown.on) return;
      topdown.on = on;
      if (on) {
        topdown.fresh = true;
        buildCaps();
      } else {
        if (topCaps) {
          scene.remove(topCaps);
          topCaps = null;
        }
        onTopdownExitRef.current?.({ x: Math.round(topdown.x), y: Math.round(topdown.z) });
      }
      for (const obj of group.children) if (obj.userData.skyCeiling) obj.traverse((o) => o.layers.set(on ? 1 : 0));
      // (every surface is judged again: all in sight up here, back to the party's own sight down there)
      sight = { key: "", cells: sight.cells };
      culledCount = -1;
      setTopdownOn(on);
    }
    topdownToggleRef.current = (on) => setTopdown(on ?? !topdown.on);
    // (a rebuild while the view is up: its caps and open skies again)
    if (topdown.on) {
      topdown.fresh = false;
      buildCaps();
      for (const obj of group.children) if (obj.userData.skyCeiling) obj.traverse((o) => o.layers.set(1));
    }
    let sight = { key: "", cells: new Set<string>() };
    function updateSight(party: { x: number; z: number }, range: number) {
      if (topdown.on) {
        if (sight.key === "topdown") return false;
        const all = new Set<string>();
        for (let y = 0; y < liveMap.height; y++) for (let x = 0; x < liveMap.width; x++) all.add(cellKey(x, y));
        sight = { key: "topdown", cells: all };
        publishSight(all);
        return true;
      }
      const doors = openDoorsRef.current;
      const cx = Math.round(party.x);
      const cz = Math.round(party.z);
      const key = `${cx},${cz}|${range}|${[...doors].sort().join(";")}`;
      if (key === sight.key) return false;
      const cells = new Set<string>();
      for (const [ox, oz] of SIGHT_POINTS) {
        for (const c of visibleCells(liveMap, cx + ox, cz + oz, Math.round(range), (k) => doors.has(k))) cells.add(c);
      }
      // a door cell seen shut: the walls on its sides still show around the
      // door (their panels may count as the wall cells beyond, which the
      // shut door hides from the sight lines)
      for (const c of [...cells]) {
        const [x, y] = c.split(",").map(Number);
        if (cellAt(liveMap, x, y) !== "door") continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cells.add(cellKey(x + dx, y + dy));
      }
      sight = { key, cells };
      publishSight(cells);
      return true;
    }

    // Culling: the scene's small objects (a wall panel, a floor tile, a
    // door, a prop...) each belong to the cell their bounding box centers
    // on, and are drawn only while that cell is seen. Big or spread-out
    // ones (a ladder's group, the sky) are always drawn. Actors are culled
    // as they move (updateActors).
    const cullBox = new THREE.Box3();
    const cullCenter = new THREE.Vector3();
    const cullSize = new THREE.Vector3();
    const cullCells = new WeakMap<THREE.Object3D, string | null>();
    let culledCount = -1;
    function cellOf(obj: THREE.Object3D): string | null {
      let key = cullCells.get(obj);
      if (key === undefined && obj.userData.cullCell) key = obj.userData.cullCell as string;
      if (key === undefined) {
        obj.updateMatrixWorld(true);
        cullBox.setFromObject(obj);
        cullBox.getSize(cullSize);
        cullBox.getCenter(cullCenter);
        key =
          cullBox.isEmpty() || cullSize.x > CULL_MAX_SIZE || cullSize.z > CULL_MAX_SIZE
            ? null
            : cellKey(Math.round(cullCenter.x), Math.round(cullCenter.z));
        cullCells.set(obj, key);
      }
      return key;
    }
    // A prop bigger than a cell (a tree's crown, a tall pillar) isn't left
    // always drawn: it's seen while any cell under its footprint is (an
    // object that isn't a prop, and has no footprint, still is).
    const bigPropCells = new WeakMap<THREE.Object3D, string[] | null>();
    function bigPropSeen(obj: THREE.Object3D): boolean {
      let cells = bigPropCells.get(obj);
      if (cells === undefined) {
        cells = null;
        if (obj.userData.prop) {
          obj.updateMatrixWorld(true);
          cullBox.setFromObject(obj);
          if (!cullBox.isEmpty()) {
            const x0 = Math.round(cullBox.min.x);
            const x1 = Math.round(cullBox.max.x);
            const z0 = Math.round(cullBox.min.z);
            const z1 = Math.round(cullBox.max.z);
            // (a runaway size - a sky-high thing - stays always drawn)
            if (x1 - x0 <= 4 && z1 - z0 <= 4) {
              cells = [];
              for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) cells.push(cellKey(cx, cz));
            }
          }
        }
        bigPropCells.set(obj, cells);
      }
      return cells === null || cells.some((c) => sight.cells.has(c));
    }
    // dev: __voidcrewNoCull = true in the console draws everything, to compare
    let cullingOff = false;
    function applySight(changed: boolean) {
      const off = import.meta.env.DEV && !!(window as { __voidcrewNoCull?: boolean }).__voidcrewNoCull;
      // (objects are still being added while the scene builds)
      if (!changed && group.children.length === culledCount && off === cullingOff) return;
      culledCount = group.children.length;
      cullingOff = off;
      for (const obj of group.children) {
        // (a decal is culled with the surface it lies on - see cullFacing)
        if (obj.userData.actor || obj.userData.item || obj.userData.decalHost) continue;
        // (the corner joins: each point's strip is in sight with any of the
        // cells round it; which are drawn is picked in cullFacing)
        if (obj.userData.joinStrips) {
          for (const p of (obj.userData.joinStrips as JoinedStrips).points) {
            const { x, y } = p.point;
            p.inSight =
              off ||
              sight.cells.has(cellKey(Math.floor(x), Math.floor(y))) ||
              sight.cells.has(cellKey(Math.ceil(x), Math.floor(y))) ||
              sight.cells.has(cellKey(Math.floor(x), Math.ceil(y))) ||
              sight.cells.has(cellKey(Math.ceil(x), Math.ceil(y)));
          }
          continue;
        }
        const key = cellOf(obj);
        const seen = off || (key === null ? bigPropSeen(obj) : sight.cells.has(key));
        // (a surface's own pass decides, with its facing - every frame)
        if (obj.userData.facing) obj.userData.inSight = seen;
        else obj.visible = seen;
      }
      cullFacing();
    }
    // Surfaces seen from behind their plane are hidden - by more than a
    // margin: the relief stands out of the plane (up to its depth), and its
    // bumps could catch a grazing look from just behind it. Every frame (it
    // turns with the eye, between cells too); ~a dot product a surface.
    const FACING_MARGIN = 2 * Math.max(reliefDepth, floorDepth) + 0.02;
    const joinFrustum = new THREE.Frustum();
    const joinMatrix = new THREE.Matrix4();
    function cullFacing() {
      const eye = camera.position;
      for (const obj of facingSurfaces) {
        const { n, d } = obj.userData.facing as { n: THREE.Vector3; d: number };
        obj.visible = !!obj.userData.inSight && (topdown.on ? n.y > -0.5 : cullingOff || n.dot(eye) - d > -FACING_MARGIN);
      }
      // the corner joins' strips: those in sight and in view (one merged
      // mesh can't be frustum-culled as a whole)
      if (joinedStrips.length) {
        joinFrustum.setFromProjectionMatrix(joinMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const strips of joinedStrips) strips.mesh.visible = strips.show((p) => p.inSight && joinFrustum.intersectsBox(p.box));
      }
      // the decals with their surfaces, just decided (see DecalLibrary.cull)
      decals.cull(camera);
    }
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
      liveMap = edited ? next : map;
      // (what is in sight, and what each light reaches, follow the new cells)
      sight = { key: "", cells: sight.cells };
      culledCount = -1;
      sceneVersion++;
      // the light grid, roughly: the full bake comes with the rebuild
      bakeRuntime.bakeSoon();
      // dev: what the quick preview holds (flat quads drawn, old surfaces taken off)
      if (import.meta.env.DEV && !doorPreview) {
        Object.assign(window, { __voidcrewPreview: { changed: changed.size, quads: previewObjects.length, hidden: facingSurfaces.filter((o) => o.userData.editHidden).length } });
      }
    }
    applyLightsRef.current = (next: GameMap) => {
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
        culledCount = -1;
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
    const applyChanges = applyLightsRef.current;
    const actorRendering = createActorRendering({
      map, group, wallHeight, reliefDepth, lightGrid, smokeBodies, bust, busted, kitTexture,
      textures: cache.textures, markSprite, ceilingY, getSightCells: () => sight.cells,
      isDisposed: () => disposed, isReady: () => ready, afterReady, liveRef, aimFocusRef, aimingRef,
      settingsRef, actorsRef, addFlash,
    });
    const { actorMeshes, updateActors, alphaAt } = actorRendering;
    const interactionRaycasts = createInteractionRaycasts({
      group, camera, topdown, latestMapRef, lockedLayersRef, editModeRef, interactionCallbacks,
      objectLayer, propObjects, looseItems, decals, getEventMarkers: () => eventMarkers,
      wallHeight, actorsRef, actorMeshes, alphaAt,
    });
    const { useInteraction, interactionWallCenter } = interactionRaycasts;
    if (interactionUseRef) interactionUseRef.current = useInteraction;
    const combatAiming = createCombatAiming({
      container, scene, group, camera, wallHeight, doorPreview: !!doorPreview, aimFrameRef, partyCoverRef,
      cellOf, getSceneVersion: () => sceneVersion, actorsRef, actorMeshes, alphaAt, addFlash,
    });
    const { updateAimFrame, updatePartyCover, updateTracers } = combatAiming;

    const stopResize = observeViewportSize(container, renderer, camera, () => settingsRef.current.fov);
    // everything to wait for is queued by now: nothing may be pending at all
    checkReady();

    const picking = createEditPicking({
      camera, group, topdown, wallHeight, reliefDepth, getLiveMap: () => liveMap, floorY, ceilingY,
      latestMapRef, lockedLayersRef, actorsRef, editToolRef, editHoverRef,
      ownsDrag: obj => pointerInput.ownsDrag(obj), isDragging: () => pointerInput.isDragging(),
    });
    const pointerInput = createPointerInput({
      canvas: renderer.domElement, camera, group, topdown, map, latestMapRef,
      cameraPullback: settings.cameraPullback, wallHeight, floorY, ceilingY,
      levelPoint: picking.levelPoint, editTargetAt: picking.editTargetAt, toolLocked: picking.toolLocked,
      actorsRef, actorMeshes, looseItems, lootRef, mapLightState, propObjects, doorGroups,
      interactionCallbacks, interactionRaycasts, editModeRef, editToolRef, editHoverRef,
      onTouchRef, onEditRef, onEditPaintRef, onEditDragRef, onEditAdjustRef,
      selectedLightRef, selectedPropRef, selectedDecalRef, selectedItemRef,
    });
    const topdownControls = createTopdownControls({ canvas: renderer.domElement, topdown, editModeRef, setTopdown });
    const selectionBox = createSelectionBox({
      scene, group, geometries, topdown, settingsRef, wallHeight, floorY, ceilingY, pointLight, doorPreview,
      getEventMarkers: () => eventMarkers, actorMeshes, looseItems, doorGroups, linkPlates,
      smokeMarkers: smokeFire.smokeMarkers, soundMarkers, propObjects, mapLightState, editModeRef, editToolRef,
      picking, onEditHoverRef, areaGhostRef, selectedActorRef, selectedDoorRef, selectedLinkRef,
      selectedDecalRef, selectedSmokeRef, selectedSoundRef, selectedItemRef, selectedPropRef,
      selectedLightRef, selectedEventRef,
    });

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
    const events = createEventMarkers({
      scene, latestMapRef, editModeRef, hiddenLayersRef, decals, floorY, ceilingY, wallHeight, interactionWallCenter,
    });
    const { eventMarkers, updateEventMarkers, updateLockMarkers } = events;
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
      for (const b of billboardProps) b.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z);

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
      smokeFire.updateParticles(gameDt, t, s, sight.cells, smokeBodies);
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
        if (!propsHidden) culledCount = -1;
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
      postPipeline.renderGeometryView(s.geometryView);

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
          visibleCells: sight.cells.size,
          fps,
          frameMs: fps > 0 ? 1000 / fps : 0,
          relief: reliefStats,
        });
      }

    }

    function animate() {
      if (disposed) return;
      // The loading screen covers a new map completely. Let its assets
      // and worker results reach the main thread before drawing the scene.
      if (!newMap || ready) renderFrame();
      raf = requestAnimationFrame(animate);
    }
    animate();

    // dev-only: render a frame on demand and return it as an image, for the
    // voidcrew.capture() console helper - works even when the browser has
    // paused requestAnimationFrame (hidden tab/pane)
    const snapshot = () => {
      // a hidden page lays the view out at ~0x0; render captures at a fixed
      // size then, and put the real size back afterwards
      const size = renderer.getSize(new THREE.Vector2());
      const tiny = size.x < 16 || size.y < 16;
      if (tiny) {
        renderer.setSize(800, 600, false);
        camera.aspect = 800 / 600;
        camera.updateProjectionMatrix();
      }
      renderFrame();
      const url = renderer.domElement.toDataURL("image/jpeg", 0.9);
      if (tiny) {
        renderer.setSize(size.x, size.y, false);
        camera.aspect = size.x / size.y;
        camera.updateProjectionMatrix();
      }
      return url;
    };
    // dev-only: render a frame on demand and report what it drew
    const renderInfo = () => {
      snapshot();
      return { ...renderer.info.render, cellsInSight: sight.cells.size, objects: group.children.length };
    };
    // dev-only: how long a frame takes (ms; the median of `frames`, each
    // waited out on the graphics card) at a given size, with the smoke drawn
    // and without - and how long moving its puffs takes alone
    const bench = (frames = 120, width = 1280, height = 720) => {
      const size = renderer.getSize(new THREE.Vector2());
      const ratio = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const run = (withSmoke: boolean) => {
        const times: number[] = [];
        smokeFire.getSmoke().mesh.visible = withSmoke;
        for (let i = 0; i < frames + 10; i++) {
          const start = performance.now();
          renderFrame();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (i >= 10) times.push(performance.now() - start);
        }
        smokeFire.getSmoke().mesh.visible = true;
        times.sort((a, b) => a - b);
        return times[times.length >> 1];
      };
      const withSmoke = run(true);
      const without = run(false);
      const again = run(true);
      const start = performance.now();
      for (let i = 0; i < 1000; i++) smokeFire.getSmoke().update(0, camera, sight.cells, 0.3);
      const update = (performance.now() - start) / 1000;
      const geometry = smokeFire.getSmoke().mesh.geometry;
      const puffs = geometry instanceof THREE.InstancedBufferGeometry ? geometry.instanceCount : 0;
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
      if (size.x > 0 && size.y > 0) {
        camera.aspect = size.x / size.y;
        camera.updateProjectionMatrix();
      }
      return { withSmoke, without, again, update, puffs, calls: renderer.info.render.calls };
    };
    if (import.meta.env.DEV && !doorPreview) {
      Object.assign(window, { __voidcrewSnapshot: snapshot, __voidcrewRenderInfo: renderInfo, __voidcrewScene: group, __voidcrewBench: bench });
    }

    return () => {
      disposed = true;
      postPipeline.dispose();
      bakeRuntime.dispose();
      stopRaycastPrep?.();
      if (applyLightsRef.current === applyChanges) applyLightsRef.current = null;
      const w = window as { __voidcrewSnapshot?: () => string };
      if (w.__voidcrewSnapshot === snapshot) delete w.__voidcrewSnapshot;
      cancelAnimationFrame(raf);
      stopResize();
      topdownControls.dispose();
      pointerInput.dispose();
      if (interactionUseRef?.current === useInteraction) interactionUseRef.current = null;
      topdownToggleRef.current = null;
      capMaterial.dispose();
      capGeometry.dispose();
      container.removeChild(renderer.domElement);
      for (const geo of geometries) geo.dispose();
      // (their textures and relief stay cached for the next build)
      for (const kit of allKits()) {
        kit.wallMat.dispose();
        kit.sideMat.dispose();
        kit.litMat?.dispose();
      }
      for (const mat of ownMaterials) mat.dispose();
    events.dispose();
      postPipeline.disposeFaceMaterials();
      offOperables();
      offEmitters();
      if (propWiresRef.current === refreshPropWires) propWiresRef.current = null;
      for (const prop of propObjects.values()) prop.getObjectByName("propEditWires")?.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
      for (const mat of Object.values(wireMats)) mat.dispose();
      actorRendering.dispose();
      combatAiming.dispose();
      floorMat.dispose();
      spaceMat.dispose();
      sheenMat.dispose();
      wiredGlass.dispose();
      paintMat.dispose();
      hazardMat.dispose();
      bridgeMat.dispose();
      ceilMat.dispose();
      lightFixtures.dispose();
      selectionBox.dispose();
      stopSharedDecals();
      sky.stopWaiting();
      decals.dispose();
      disposeLightGrid(lightGrid);
    fences.dispose();
    editorMarkers.disposeLinkPlates();
    smokeFire.dispose();
    editorMarkers.disposeSoundMarkers();
    smokeFire.disposeMarkerDetails();
      backingMat.dispose();
      for (const mat of billboardMaterials) mat.dispose();
      sky.dispose();
      // the renderer stays for the next build (see SceneCache)
      renderer.renderLists.dispose();
    };
  }, [
    sceneMap,
    doorPreview,
    settings.textureSet,
    settings.accentTextureSet,
    settings.accentRatio,
    settings.floorTextureSet,
    settings.ceilingTextureSet,
    settings.decalsEnabled,
    settings.wallProfile,
    settings.wallHeight,
    settings.bevelFraction,
    settings.bevelAngleDeg,
    settings.displacementScale,
    settings.reliefDepth,
    settings.reliefLevels,
    settings.reliefMinIsland,
    settings.reliefMode,
    settings.wallDetail,
    settings.doorDetail,
    settings.lodScale,
    settings.pixelRatioCap,
    settings.antialias,
    settings.lightPool,
    settings.normalMaps,
    settings.particleQuality,
    settings.floorReliefDepth,
    settings.aoRadius,
    textureVersion,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <div ref={containerRef} data-drop-world className="absolute inset-0" />
      {editMode && (
        <button
          type="button"
          onClick={() => topdownToggleRef.current?.()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-pressed={topdownOn}
          title="Top-down view (O): WASD / arrows pan, Q / E turn, wheel zooms, Ctrl+wheel tilts, middle button drags"
          className={`absolute left-2 bottom-2 z-10 border rounded-sm px-2 py-1 text-[11px] font-mono ${
            topdownOn ? "border-amber-400 bg-amber-400/25 text-amber-200" : "border-neutral-600 bg-black/60 text-neutral-200 hover:bg-neutral-800"
          }`}
        >
          {topdownOn ? "\u2B13 Top-down" : "\u2B12 Top-down"}
        </button>
      )}
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      <LoadingScreen loading={loading} image={transit?.image ?? map.loadingImage} inLift={!!ride} title={WORLDS[map.world].loop === "ship" ? "USV HORIZON" : WORLDS[map.world].name.toUpperCase()} />
    </div>
  );
}
