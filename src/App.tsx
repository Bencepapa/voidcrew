import { ChevronDown, ChevronRight } from "lucide-react";
import { isTextEntry } from "./keyboardFocus";
import { Inspector, type InspectedKind } from "./editor/Inspector";
import { ProblemsPanel } from "./editor/ProblemsPanel";
import { validateMap, removeInWall, removeDuplicates } from "./editor/validate";
import { EditorStatusBar } from "./editor/EditorStatusBar";
import { AreaClipButtons } from "./editor/AreaClipButtons";
import { useAreaClipboard } from "./editor/useAreaClipboard";
import { useMapDrafts } from "./editor/DraftNotice";
import { FloatToolbar } from "./editor/FloatToolbar";
import { ShortcutHelp } from "./editor/ShortcutHelp";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { InteractionPopup } from "./components/InteractionPopup";
import { DialoguePopup } from "./components/DialoguePopup";
import { StoryDialoguePopup } from "./components/StoryDialoguePopup";
import { configureStoryUi, storyEnabled, storyEndDialogue, storySave, storySetDialogue, storyTalk } from "./game/story/storyRuntime";
import { ShopPanel } from "./components/ShopPanel";
import { getShopIds } from "./game/shopCatalog";
import { gameClock } from "./game/clock";
import { moveActionForKey } from "./game/controls";
import { interactionAt, type ClickEvent, type Interaction, type InteractionTarget } from "./game/interactions";
import { setInteraction } from "./editor/mapEdits";
import { addTarget, decalOperableInfo, linkTargetFor, operableInfo } from "./editor/operableEdits";
import { operableLink } from "./editor/operableLink";
import { keyFlags } from "./game/keys";
import { useGameState } from "./game/useGameState";
import { GameViewport, DEFAULT_SETTINGS } from "./components/GameViewport";
import { pickRender, renderDefaults } from "./game/renderLook";
import { saveGraphics } from "./render/graphics";
import type { AimFocus, AimFrame, EditDrag, EditTarget, ViewportSettings, ViewportStats } from "./components/GameViewport";
import { editorToolLabel } from "./editor/EditorBar";
import { SharedEditor } from "./editor/SharedEditor";
import { sharedConfigured } from "./editor/sharedAuth";
import { autoSharedSceneReady, setAutoSharedWorld } from "./editor/autoShared";
import { useAutoLoadShared } from "./editor/autoSharedPrefs";
import { loadOnce } from "./editor/loadGate";
import { loadSharedForMap } from "./editor/guestShared";
import { loadSharedMap } from "./editor/sharedMaps";
import type { SharedMapHead } from "./editor/sharedMapHeads";
import { AssetManager } from "./editor/AssetManager";
import { loadSharedImages } from "./editor/sharedImages";
import { loadSharedProps } from "./editor/sharedProps";
import { doorType, loadSharedDoors } from "./editor/sharedDoorTypes";
import { loadSharedActors } from "./editor/sharedActors";
import { isSharedActorId } from "./game/actorSheets";
import { loadSharedTextures } from "./editor/sharedTextures";
import { sharedImage } from "./render/sharedImages";
import { PropEditor } from "./editor/PropEditor";
import {
  applyEdit,
  canRedo,
  canUndo,
  createMap,
  deriveMapId,
  renameMap,
  downloadMap,
  hasUnsavedEdits,
  mapFile,
  mapIds,
  redo,
  saveMap,
  undo,
} from "./editor/mapStore";
import { MapTitle } from "./components/MapTitle";
import { GatePrompt } from "./components/GatePrompt";
import { LoadingImagePreloader } from "./components/LoadingImagePreloader";
import { ReleaseNotes } from "./components/ReleaseNotes";
import { loadingImagesAhead } from "./game/mapLinks";
import { MapDialog } from "./editor/MapDialog";
import type { MapDialogMode, MapDialogValues } from "./editor/MapDialog";
import { MAPS, START_MAP } from "./game/map";
import { WORLDS, assetInWorld, setActiveWorld } from "./game/worlds";
import type { GameMap, Linked } from "./game/types";
import { blankMap, resizeMap, addDecal, removeDecal, updateDecal, addLight, addProp, anchorAt, dig, fill, paintTexture, removeLight, removeProp, removePropIndex, updateProp, setHeight, toggleBridge, toggleDoor, toggleLadder, updateDoor, addActor, removeActor, updateActor, updateLight, addChanceWall, removeChanceWall, updateChanceWall, addItem, removeItem, updateItem, updateExit, toggleExit, toggleStairs, updateStairs, toggleRestricted, addSmoke, removeSmoke, updateSmoke, setStart, digCells, fillCells, rectCells } from "./editor/mapEdits";
import { PROP_TYPES, flamePosition, isSharedPropId, propBlocks, propPlacement, propRetexturable } from "./game/props";
import { MIN_HEADROOM } from "./game/heights";
import type { ActorInfo, DecalChoice, DecalInfo, DoorInfo, LightInfo, LightPlace, MapLook, PropInfo, ItemInfo, SmokeInfo } from "./editor/EditorBar";
import { accentOf, moodOf, moodText, newSeed } from "./game/variation";
import type { ShipMood } from "./game/variation";
import { ACTOR_TYPES, isFriendlySpec } from "./game/actors";
import { DOOR_EDGE_OFFSET, cellAt, ceilingHeight, doorAt, doorFacingAt, floorHeight } from "./game/map";
import type { Direction, MapLight, PropAnchor, PropSpec, Vec2 } from "./game/types";
import { DIR_VECTOR, behindOf, rightOf } from "./game/movement";
import { fireLightColor, generateLights, ownCeilingLight } from "./game/lights";
import type { EditSurface, EditTool, Rect, TextureLayer } from "./editor/mapEdits";
import { paintFace } from "./editor/mapEdits";
import { doorTextureIds } from "./game/doorTextures";
import { isTextureSetId } from "./render/textureSets";
import { eraseRoof, eraseRoofGroup, paintRoof, roofFootprint, roofGroupFor, setRoofDetached } from "./editor/roofEdits";
import type { RoofForm } from "./game/roofAutotile";
import { eraseFence, fenceRun, paintFence, restyleFence } from "./editor/fenceEdits";
import { FENCE_TOOL_DEFAULT, type FenceToolState } from "./editor/inspector/FenceFields";
import { cleanFenceStyle, fenceFormOf, isSide, sideFromPoint, type FenceForm } from "./game/fences";
import type { TextureSetId } from "./render/textureSets";
import { AimOverlay } from "./components/AimOverlay";
import { bankHaul, failRun, getMeta, payRevival, revivalBill, useMeta } from "./game/meta";
import { bankRun, handWeapon } from "./game/inventoryStore";
import { LEFT, RIGHT, type HandIndex } from "./game/inventory";
import { WipeScreen } from "./components/WipeScreen";
import { SHIP_CLASSES, shipOffers } from "./game/ships";
import type { ShipOffer } from "./game/ships";
import { setLootContext } from "./game/items";
import { BaseScreen } from "./components/BaseScreen";
import { ShipPicker } from "./components/ShipPicker";
import { Minimap } from "./components/Minimap";
import { t, useLang, type Key } from "./i18n";
import { PartyPanel } from "./components/PartyPanel";
import { MoveControls } from "./components/MoveControls";
import { LogPanel } from "./components/LogPanel";
import { ActionMenu } from "./components/ActionMenu";
import { InventoryPanel } from "./components/InventoryPanel";
import { worldPause } from "./game/worldPause";
import { DragGhost } from "./components/InventorySlots";
import { TerminalPanel } from "./components/TerminalPanel";
import { KeypadPanel } from "./components/KeypadPanel";
import { AlertMeter } from "./components/AlertMeter";
import type { Lock } from "./game/story";
import { RunSummary } from "./components/RunSummary";
import { ITEM_TYPES, isSharedPickupId, itemSpot } from "./game/items";
import { DebugPanel } from "./components/DebugPanel";
import { useMediaQuery } from "./components/useMediaQuery";
import { useViewControls } from "./components/useViewControls";
import { VirtualJoysticks } from "./components/VirtualJoysticks";
import { useFreeMovement } from "./game/useFreeMovement";

// phones in portrait (narrow) or landscape (short) get the overlay layout
const COMPACT_QUERY = "(max-width: 767px), (max-height: 540px)";

// whether the editor's minimap block is folded away (kept in this browser)
const MINIMAP_COLLAPSE_KEY = "voidcrew-editor-minimap-collapsed";

// an item's links (see Linked), as the editor's panels show them
const linksOf = (item: Linked): Linked => ({ id: item.id, with: item.with, without: item.without });

export default function App() {
  const [seed, setSeed] = useState(() => Number(new URLSearchParams(location.search).get("seed")) || newSeed());
  // A direct map/seed link opens a deck. Otherwise only the open world
  // starts in the viewport; Void Crew starts at the base.
  const [phase, setPhase] = useState<"base" | "pick" | "run">(() => {
    const query = new URLSearchParams(location.search);
    return query.has("map") || query.has("seed") || WORLDS[START_MAP.world].loop === "open" ? "run" : "base";
  });
  const [editMode, setEditMode] = useState(false);
  const [eventKind, setEventKind] = useState<Interaction["kind"]>("message");
  const [eventTarget, setEventTarget] = useState<InteractionTarget | null>(null);
  const [activeInteraction, setActiveInteraction] = useState<Interaction | null>(null);
  const [partyDock, setPartyDock] = useState<HTMLDivElement | null>(null);
  const activeInteractionRef = useRef<Interaction | null>(null);
  const interactionUseRef = useRef<(() => boolean) | null>(null);
  const interactionBlocksMovement = useRef(false);
  const [ship, setShip] = useState<ShipOffer | null>(null);
  const [moodOverride, setMoodOverride] = useState<Partial<ShipMood>>({});
  const mood = useMemo(() => ({ ...(ship ? ship.mood : moodOf(seed)), ...moodOverride }), [ship, seed, moodOverride]);
  const variation = useMemo(() => editMode || phase !== "run" ? null : { seed, mood }, [editMode, phase, seed, mood]);
  const {
    map,
    pos,
    dir,
    elevation,
    jumpDown,
    use: useBase,
    operate,
    haul,
    lootedProps,
    takenItems,
    lootMarks,
    lockedDoors,
    spills,
    kills,
    runEnd,
    runStart,
    nextRun,
    touch,
    terminal,
    closeTerminal,
    wipedAt,
    keypad,
    enterCode,
    hackKeypad,
    closeKeypad,
    alert,
    powerOn,
    inLift,
    ride,
    transit,
    linkPrompt,
    confirmLink,
    declineLink,
    actors,
    readyAt,
    aim,
    hurtAt,
    partyCoverRef,
    activateHand,
    cancelAim,
    resolveShot,
    setImmortalCrew,
    setNoclip,
    setEditing,
    setWorldFrozen,
    replaceMap,
    enterMap,
    shiftParty,
    pushLog,
    crew,
    log,
    respawn,
    moveForward,
    moveBackward,
    strafeLeft,
    strafeRight,
    turnL,
    turnR,
    openingDoor,
    openDoors,
    sceneReady,
    syncPose,
    openDoorAt,
    faceActor,
  } = useGameState(variation, interactionBlocksMovement);
  // (the interface's language: everything below renders again when it changes)
  useLang();
  // The inventory (I, or the Inventory action): modal like a dialogue - the
  // world stands still and the game's keys are the panel's - so it opens only
  // while the party is free to act.
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const inventoryShown = inventoryOpen && !editMode && phase === "run" && !runEnd && wipedAt === null && !inLift && !terminal && !keypad && !aim;
  useEffect(() => {
    if (inventoryOpen && !inventoryShown) setInventoryOpen(false);
  }, [inventoryOpen, inventoryShown]);
  useLayoutEffect(() => {
    if (!inventoryShown) return;
    interactionBlocksMovement.current = true;
    if (document.pointerLockElement) document.exitPointerLock();
    return () => {
      interactionBlocksMovement.current = false;
    };
  }, [inventoryShown]);
  const [settings, setSettings] = useState<ViewportSettings>(() => ({ ...DEFAULT_SETTINGS, ...map.render }));
  const [settingsMapId, setSettingsMapId] = useState(map.id);
  if (settingsMapId !== map.id) {
    // Resolve the destination's look before the viewport can build it.
    setSettingsMapId(map.id);
    setSettings((s) => ({ ...s, ...renderDefaults(DEFAULT_SETTINGS), ...map.render }));
  }
  // the map editor (see EDITOR.md): while it's on the world holds still,
  // walls don't stop the party and the headlamp is lit
  const [editTool, setEditTool] = useState<EditTool>("select");
  // where the editor toolbar docks (the right column), when there is one
  const [editorDebug, setEditorDebug] = useState(false);
  // the keyboard shortcut help overlay (opened with ? or the top bar's ? button)
  const [shortcutHelp, setShortcutHelp] = useState(false);
  const [assetDock, setAssetDock] = useState<HTMLElement | null>(null);
  const [editDock, setEditDock] = useState<HTMLElement | null>(null);
  // the Light tool: the selected hand-placed light (its index in the map's
  // lights), and what a plain click places - a ceiling lamp, or (as a
  // Shift+click does) a free-standing light where it's pointed
  const [selectedLight, setSelectedLight] = useState<number | null>(null);
  const [lightPlace, setLightPlace] = useState<LightPlace>("ceiling");
  // the Prop tool: the prop a click puts in, and how it's turned (R turns it)
  const [propChoice, setPropChoice] = useState<string>(Object.keys(PROP_TYPES)[0]);
  const [propRotation, setPropRotation] = useState(0);
  // the Prop tool's selected prop (its index in the map's props)
  const [selectedProp, setSelectedProp] = useState<number | null>(null);
  // the Roof tool: the form it roofs in (see roofAutotile.ts), the roof the stroke under way paints
  // into, and a counter that gives each stroke one undo step
  const [roofForm, setRoofForm] = useState<RoofForm>("slope");
  const [roofTexture, setRoofTexture] = useState("");
  const roofStroke = useRef<{ id: number; group: string } | null>(null);
  const roofStrokeSerial = useRef(0);
  // the fence and block tools (see game/fences.ts): what their next pieces are made with, the side the
  // edge stroke under way began on, and a counter that gives each stroke one undo step
  const [fence, setFence] = useState<FenceToolState>(FENCE_TOOL_DEFAULT);
  const fenceStroke = useRef<{ side: Direction | null } | null>(null);
  const fenceStrokeSerial = useRef(0);
  // the pieces the last stroke put in: while the tool is in hand the panel's changes reach them too
  const lastFenceStroke = useRef<{ form: FenceForm; side?: Direction; cells: Vec2[]; serial: number } | null>(null);
  // the Decal tool: the decal a click puts on (and its size in surface
  // pixels), how it's turned, and the selected one (its index in the map's
  // decals)
  const [decalChoice, setDecalChoice] = useState<DecalChoice | null>(null);
  const [decalRotation, setDecalRotation] = useState(0);
  const [selectedDecal, setSelectedDecal] = useState<number | null>(null);
  // the Door tool's selected door (its cell)
  const [selectedDoor, setSelectedDoor] = useState<Vec2 | null>(null);
  const [doorTypeChoice, setDoorTypeChoice] = useState<string>();
  // the Robot tool: the actor type a click puts in, and the selected actor
  // (its index in the map's actors)
  // (none at first: a click on a floor puts nothing in until one is picked -
  // the first type of all may not even be of this world)
  const [robotChoice, setRobotChoice] = useState<string | null>(null);
  const [selectedActor, setSelectedActor] = useState<number | null>(null);
  // the Item tool's pick (its index in the map's items; its palette further down)
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  // the Smoke tool's pick (its index in the map's smokes)
  const [selectedSmoke, setSelectedSmoke] = useState<number | null>(null);
  // The Select tool: a click picks the nearest object of any kind (see onEdit);
  // the Alt key held in any tool does the same until it is let go
  const [altHeld, setAltHeld] = useState(false);
  const selecting = editTool === "select" || altHeld;
  // one pick at a time: Select lets go of the other kinds, so the inspector and the keys follow the picked one
  const selectOnly = (kind: "actor" | "item" | "prop" | "decal" | "light" | "smoke" | null, index: number | null = null) => {
    setEventTarget(null);
    setSelectedActor(kind === "actor" ? index : null);
    setSelectedItem(kind === "item" ? index : null);
    setSelectedProp(kind === "prop" ? index : null);
    setSelectedDecal(kind === "decal" ? index : null);
    setSelectedLight(kind === "light" ? index : null);
    setSelectedSmoke(kind === "smoke" ? index : null);
    setSelectedExit(null);
    setSelectedStairs(null);
    setSelectedChanceWall(null);
    setSelectedDoor(null);
  };
  // The tool the arrows, R, Delete and the wheel work by: the one in hand, or (Select, or a thing picked with Alt in a
  // placing tool) the kind that is selected
  const pickedTools: [EditTool, number | null][] = [["robot", selectedActor], ["item", selectedItem], ["prop", selectedProp], ["decal", selectedDecal], ["light", selectedLight], ["smoke", selectedSmoke]];
  const ownPick = pickedTools.find(([tool]) => tool === editTool);
  const keyTool: EditTool = editTool === "select" || (ownPick && ownPick[1] === null) ? (pickedTools.find(([, index]) => index !== null)?.[0] ?? editTool) : editTool;
  // the deck variation played (see variation.ts): ?seed= in the URL, else
  // a new one; while editing there's none - everything shows
  // the ship's mood: the seed's, unless the debug panel sets a part of it
  const meta = useMeta();
  // the offers on the scan: new ones after every run
  const offers = useMemo(() => shipOffers(meta.depth, meta.runs), [meta.depth, meta.runs]);
  const reroll = () => {
    const next = newSeed();
    setSeed(next);
    const url = new URL(location.href);
    url.searchParams.set("seed", String(next));
    history.replaceState(null, "", url);
    pushLog(t("app.variation", { seed: next, mood: moodText({ ...moodOf(next), ...moodOverride }) }));
  };
  // the surface the pointer is on: the Texture tool's palette marks its row
  // (it sticks to the last one when nothing is under the pointer)
  const [editSurface, setEditSurface] = useState<EditSurface>("wall");
  // the set picked for each surface (null: the texture the map gives it)
  const [paint, setPaint] = useState<Record<EditSurface, TextureSetId | null>>({ wall: null, floor: null, ceiling: null });
  // bumped by every edit, undo, redo and save, to redraw the toolbar
  const [, setEdits] = useState(0);
  const draftNotice = useMapDrafts(map.id, replaceMap, () => setEdits((n) => n + 1), pushLog);
  // the graphics choices belong to the device: kept in this browser
  useEffect(() => saveGraphics(settings), [settings.particleQuality, settings.wallDetail, settings.pixelRatioCap, settings.particleEvery, settings.viewDistanceCap, settings.lodScale, settings.antialias, settings.lightPool, settings.normalMaps]);
  const [editLamp, setEditLamp] = useState(true);
  const viewSettings = editMode ? { ...settings, noclip: true, headlamp: editLamp } : settings;
  const [stats, setStats] = useState<ViewportStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const aimFrameRef = useRef<AimFrame | null>(null);
  const aimFocusRef = useRef<AimFocus | null>(null);
  useEffect(() => setImmortalCrew(settings.immortalCrew), [settings.immortalCrew, setImmortalCrew]);
  useEffect(() => setNoclip(viewSettings.noclip), [viewSettings.noclip, setNoclip]);
  useLayoutEffect(() => setEditing(editMode), [editMode, setEditing]);
  const worldPaused = worldPause(activeInteraction, inventoryShown);
  const interactionPausesWorld = worldPaused.pausesWorld;
  useLayoutEffect(() => {
    setWorldFrozen(editMode || !!runEnd || phase !== "run" || interactionPausesWorld);
    gameClock.setPaused(interactionPausesWorld);
    return () => gameClock.setPaused(false);
  }, [editMode, runEnd, phase, interactionPausesWorld, setWorldFrozen]);
  // the talk on screen runs through the story engine (see storyRuntime.ts), not an old dialogue library
  const [storyTalking, setStoryTalking] = useState(false);
  const storyTalkingRef = useRef(false);
  const closeInteraction = useCallback(() => {
    activeInteractionRef.current = null;
    interactionBlocksMovement.current = false;
    if (storyTalkingRef.current) {
      storyTalkingRef.current = false;
      setStoryTalking(false);
      storyEndDialogue();
    }
    setActiveInteraction(null);
  }, []);
  // (the story is told when an old dialogue or simple shop window is open: no saving behind it)
  useEffect(() => {
    storySetDialogue((activeInteraction?.kind === "dialogue" || activeInteraction?.kind === "shop") && !storyTalking);
  }, [activeInteraction, storyTalking]);
  // the story's side of the effects: its @shop opens the shop window, its lines go to the log (and it loads now,
  // not in the middle of a render)
  useEffect(() => {
    configureStoryUi({ log: (text) => pushLog(text) });
    storyEnabled();
  }, [pushLog]);
  useLayoutEffect(() => {
    closeInteraction();
    setEventTarget(null);
  }, [map.id, editMode, phase, closeInteraction]);
  useEffect(() => {
    if (activeInteraction?.kind !== "message" || !activeInteraction.timeout) return;
    const timer = window.setTimeout(closeInteraction, Math.min(activeInteraction.timeout * 1000, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [activeInteraction, closeInteraction]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const event = activeInteractionRef.current;
      // (a dialogue's keys are the popup's own: Enter picks a choice there)
      // (the simple shop's keys are the shop window's own)
      if (!event || event.kind === "dialogue" || event.kind === "shop") return;
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) closeInteraction();
      } else if (e.key === "Tab" && event.kind === "message" && event.modal) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (e.key === " " && e.target instanceof HTMLButtonElement && e.target.closest('[role="dialog"]')) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [closeInteraction]);
  const openInteraction = (event: ClickEvent) => {
    if (editMode || phase !== "run" || inLift || terminal || keypad || aim || runEnd || wipedAt !== null || activeInteractionRef.current || inventoryShown) return false;
    // a lever or button: worked, no popup (see operables.ts)
    if (event.kind === "operate") return operate(event.from, event.index);
    activeInteractionRef.current = event;
    // an NPC the story has an entry for talks through the engine (npc = the actor's type); else the old path
    const story = (event.kind === "dialogue" || event.kind === "shop") && !!event.npc && storyTalk(event.npc, event.shop || undefined) !== null;
    storyTalkingRef.current = story;
    setStoryTalking(story);
    interactionBlocksMovement.current = event.kind === "dialogue" || event.kind === "shop" || (event.kind === "message" && event.modal);
    if (document.pointerLockElement) document.exitPointerLock();
    setActiveInteraction(event);
    if (event.kind === "dialogue" || event.kind === "shop") {
      // (the NPC stops and turns to the party)
      if (event.actorId !== undefined) faceActor(event.actorId);
    } else if (event.text.trim()) pushLog(event.text);
    return true;
  };
  const use = useCallback(() => {
    if (!activeInteractionRef.current && !interactionUseRef.current?.()) useBase();
  }, [useBase]);
  // at the base or the scan, the keys aren't the game's
  useEffect(() => {
    if (phase === "run") return;
    const block = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [phase]);
  // boarding a derelict: its decks' variation, its mood, what its crates
  // tend to hold - a clean run, from where the ship is entered
  const boardShip = (offer: ShipOffer) => {
    const type = SHIP_CLASSES[offer.classId];
    setShip(offer);
    setSeed(offer.seed);
    setLootContext(type.loot, offer.lootScale);
    nextRun();
    enterMap(MAPS[type.entry] ?? START_MAP);
    setPhase("run");
    pushLog(t("app.boardShip", { ship: offer.name, type: type.name.toLowerCase() }));
  };
  if (!aim) aimFocusRef.current = null;
  const aimRef = useRef(aim);
  aimRef.current = aim;
  const aimWeapon = aim ? (handWeapon(crew[aim.crew].id, aim.hand) ?? null) : null;
  // (the weapon dragged out of the aiming crewmate's hands: the aim ends)
  const aimLost = !!aim && !aimWeapon;
  useEffect(() => {
    if (aimLost) cancelAim();
  }, [aimLost, cancelAim]);
  // the editor's palettes follow the world of the map on screen
  setActiveWorld(map.world);
  // (the background shared-content loader follows the same world)
  useEffect(() => { setAutoSharedWorld(map.world); }, [map.world]);
  // (and the page wears the world's look - see index.css)
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("theme-fantasy", map.world === "fantasy");
    document.title = WORLDS[map.world].name;
  }, [map.world]);
  // the loading pictures of this map and of the maps its gates and stairs lead to
  const loadingImageIds = loadingImagesAhead(map, (id) => MAPS[id]);
  const needsSharedImages = editMode || loadingImageIds.some((id) => !sharedImage(id)) ||
    (activeInteraction?.kind === "image" && !!activeInteraction.image && !sharedImage(activeInteraction.image)) ||
    !!map.decals?.some(({ decal }) => /^(fantasy|scifi)_decal_/.test(decal) && !sharedImage(decal)) ||
    !!map.items?.some(({ item }) => isSharedPickupId(item) && !sharedImage(item)) ||
    !!map.props?.some(({ loot }) => loot?.some(({ item }) => isSharedPickupId(item) && !sharedImage(item)));
  // Each list of the store is fetched in full once per page load (loadGate), and only when the whole store is
  // loaded at all (editors, ?shared=on). A guest gets exactly what this map references, by id, below.
  const sharedFull = useAutoLoadShared();
  useEffect(() => {
    if (needsSharedImages && sharedFull) void loadOnce("images", map.world, () => loadSharedImages(map.world)).catch(console.warn);
  }, [map.world, needsSharedImages, sharedFull]);
  const needsSharedProps = !!map.props?.some(({ prop }) => isSharedPropId(prop) && !PROP_TYPES[prop]);
  useEffect(() => {
    if (needsSharedProps && sharedFull) {
      void loadOnce("props", map.world, () => loadSharedProps(map.world)).catch(console.warn);
      void loadOnce("textures", map.world, () => loadSharedTextures(map.world)).catch(console.warn);
    }
  }, [map.world, needsSharedProps, sharedFull]);
  const needsSharedDoors = !!map.doors?.some(spec => spec.type && !doorType(spec.type));
  // a door's own leaf / frame textures that no loaded texture set answers to (shared ones not loaded yet)
  const needsDoorTextures = doorTextureIds(map.doors).some(id => !isTextureSetId(id));
  useEffect(() => {
    if (!sharedFull) return;
    if (needsSharedDoors) void loadOnce("doors", map.world, () => loadSharedDoors(map.world)).catch(console.warn);
    if (needsSharedDoors || needsDoorTextures) void loadOnce("textures", map.world, () => loadSharedTextures(map.world)).catch(console.warn);
  }, [map.world, needsSharedDoors, needsDoorTextures, sharedFull]);
  const needsSharedActors = !!map.actors?.some(spec => isSharedActorId(spec.actor) && !ACTOR_TYPES[spec.actor]);
  useEffect(() => {
    if (needsSharedActors && sharedFull) void loadOnce("actors", map.world, () => loadSharedActors(map.world)).catch(console.warn);
  }, [map.world, needsSharedActors, sharedFull]);
  const interactionImage = activeInteraction?.kind === "image" ? activeInteraction.image : undefined;
  useEffect(() => {
    if (!sharedFull && sharedConfigured) void loadSharedForMap(map, interactionImage ? [interactionImage] : []).catch(console.warn);
  }, [map, sharedFull, interactionImage]);
  const compact = useMediaQuery(COMPACT_QUERY);
  const grid = settings.gridMovement;
  const finePointer = useMediaQuery("(pointer: fine)");
  const free = useFreeMovement({
    enabled: !grid,
    frozen: inLift || aim !== null || worldPaused.blocksParty,
    noclip: viewSettings.noclip,
    map,
    pos,
    dir,
    elevation,
    openDoors,
    openingDoor,
    syncPose,
    openDoorAt,
  });
  const view = useViewControls({
    grid,
    blocked: worldPaused.blocksView,
    onForward: moveForward,
    onBack: moveBackward,
    onTurnLeft: turnL,
    onTurnRight: turnR,
    onYaw: free.addYaw,
    editing: editMode,
  });

  // dev-only console hooks for comparing rendering settings, e.g.
  //   voidcrew.set({ ambientIntensity: 0.2, roughness: 0.4 })
  //   await voidcrew.capture("low-ambient")  // -> concept/gen/captures/
  //   voidcrew.peek()  // grid glance-around state
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      voidcrew: {
        set: (patch: Partial<ViewportSettings>) => setSettings((s) => ({ ...s, ...patch })),
        peek: () => ({ ...view.peekRef.current }),
        async capture(name: string) {
          // GameViewport exposes this in dev: renders a frame and reads it back
          // before the browser can present and clear the WebGL canvas
          const snapshot = (window as { __voidcrewSnapshot?: () => string }).__voidcrewSnapshot;
          if (!snapshot) throw new Error("no game view to capture");
          const dataUrl = snapshot();
          const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/capture?name=${encodeURIComponent(name)}`, {
            method: "POST",
            body: dataUrl,
          });
          return res.text();
        },
      },
    });
  }, []);

  // grid movement steps on key presses; free movement reads held keys itself
  // (useFreeMovement)
  useEffect(() => {
    if (!grid) return;
    function onKey(e: KeyboardEvent) {
      // (Ctrl+S and the like are shortcuts, not steps)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (moveActionForKey(e.key)) {
        case "forward": moveForward(); break;
        case "back": moveBackward(); break;
        case "strafeLeft": strafeLeft(); break;
        case "strafeRight": strafeRight(); break;
        case "turnLeft": turnL(); break;
        case "turnRight": turnR(); break;
      }
      if (e.key === "x") jumpDown?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grid, moveForward, moveBackward, strafeLeft, strafeRight, turnL, turnR, jumpDown]);

  // The surface under the pointer, for the palette (see EditorBar).
  const hoverTargetRef = useRef<EditTarget | null>(null);
  const onEditHover = (target: EditTarget | null) => {
    if (target) setEditSurface(target.face ? "wall" : target.kind);
    hoverTargetRef.current = target;
    areaClip.onHover(target ? target.cell : null);
  };
  // Where a prop lands for a target: a wall prop on the nearest wall side of the
  // cell, else the point pointed at on its floor
  // How high (wall heights above the cell's floor) a wall prop hangs on a step face when put where the
  // pointer is: centered on that spot, kept within the face
  const faceElevation = (name: string, target: EditTarget) => {
    const f = target.face;
    const sp = target.surfacePoint;
    if (!f || !sp) return undefined;
    const v = DIR_VECTOR[f.side];
    const floor = floorHeight(map, f.cell.x, f.cell.y);
    const ceiling = ceilingHeight(map, f.cell.x, f.cell.y);
    const far = { x: f.cell.x + v.x, y: f.cell.y + v.y };
    const bottom = f.part === "riser" ? 0 : Math.max(floor, ceilingHeight(map, far.x, far.y)) - floor;
    const top = (f.part === "riser" ? Math.min(ceiling, floorHeight(map, far.x, far.y)) : ceiling) - floor;
    const type = PROP_TYPES[name];
    const size = type?.size[1] ?? 0;
    // (a mounted prop's own height - its type's elevation - is added to the spec's)
    const base = type && (type.kind === "panel" || type.kind === "views") ? (type.elevation ?? 0) : 0;
    // (the spot's height from its surface pixels: the first panel is 256 tall)
    const wanted = 1 - sp.v / 256 - size / 2;
    return Math.round((Math.min(Math.max(bottom, top - size), Math.max(bottom, wanted)) - base) * 20) / 20;
  };
  const propPlace = (name: string, target: EditTarget) => {
    // (a wall prop on a step face: that side of the open cell in front of it, at the height pointed at)
    if (target.face && PROP_TYPES[name]?.wall) {
      return { x: target.face.cell.x, y: target.face.cell.y, at: target.face.side as PropAnchor, offset: undefined, elevation: faceElevation(name, target) };
    }
    // (a wall prop can be dragged along the walls: on the wall pointed at)
    if (target.kind === "wall" && PROP_TYPES[name]?.wall && target.surfacePoint && target.surfacePoint.surface !== "floor" && target.surfacePoint.surface !== "ceiling") {
      return { x: target.surfacePoint.cell.x, y: target.surfacePoint.cell.y, at: target.surfacePoint.surface as PropAnchor, offset: undefined };
    }
    if (target.kind !== "floor") return null;
    const cell = target.cell;
    const [dx, , dz] = target.point && target.point.cell.x === cell.x && target.point.cell.y === cell.y ? target.point.pos : [0, 0, 0];
    const clamp = (v: number) => Math.round(Math.max(-0.45, Math.min(0.45, v)) * 100) / 100;
    if (PROP_TYPES[name]?.wall) return { x: cell.x, y: cell.y, at: anchorAt(dx, dz, true), offset: undefined };
    return { x: cell.x, y: cell.y, at: "center" as PropAnchor, offset: (dx || dz ? [clamp(dx), clamp(dz)] : undefined) as [number, number] | undefined };
  };
  // Dragging something in the view (see EditDrag): a prop (on the floor, or a
  // wall prop along the walls), a decal (on its surface), an item, a smoke
  // emitter, a light, a robot or a door. With Ctrl a copy is made at the
  // start and that's what's dragged. A whole drag - the copy too - is one undo
  // step (its edits share a merge key).
  const dragGrab = useRef<[number, number] | null>(null);
  // The top-down view left: the party stands in the cell at the middle of what it looked at -
  // if that is not walkable (a wall, a barrel, a cell too low), the nearest one that is; the thing
  // last worked on, when it is near the middle (within 6 cells), counts as the middle.
  const lastTouched = useRef<Vec2 | null>(null);
  // The settings of the last thing of each kind that was set up (a slider moved, a colour picked): the next of
  // that kind is put in with them - a row of the same torch, many alike. Where a tool puts things in and nothing
  // is selected, the inspector shows and changes these (see placingKind).
  const templates = useRef<Record<"smoke" | "light" | "prop" | "item" | "actor", Record<string, unknown>>>({ smoke: {}, light: {}, prop: {}, item: {}, actor: {} });
  const TEMPLATE_KEYS = {
    smoke: ["effect", "mistStyle", "sprite", "spread", "height", "density", "size", "color", "blow", "chance", "decorative", "opacity", "opacityDark", "lightColor", "lightIntensity", "lightReach"],
    light: ["color", "intensity", "range", "effect", "bulb", "chance"],
    prop: ["texture", "scale", "chance"],
    item: ["count", "chance"],
    actor: ["chance", "wake"],
  } as const;
  const remember = (kind: keyof typeof TEMPLATE_KEYS, patch: object) => {
    for (const key of TEMPLATE_KEYS[kind]) if (key in patch) templates.current[kind][key] = (patch as Record<string, unknown>)[key];
  };
  const [, setTemplateTick] = useState(0);
  // (chooseTool: defined below, where the selections are)
  const placePartyAt = (center: Vec2) => {
    const walkable = (c: Vec2) =>
      c.x >= 0 && c.y >= 0 && c.x < map.width && c.y < map.height && cellAt(map, c.x, c.y) !== "wall" && !propBlocks(map, c) && ceilingHeight(map, c.x, c.y) - floorHeight(map, c.x, c.y) >= MIN_HEADROOM;
    const touched = lastTouched.current;
    const wanted = touched && Math.max(Math.abs(touched.x - center.x), Math.abs(touched.y - center.y)) <= 6 ? touched : center;
    let best: Vec2 | null = null;
    let bestDistance = Infinity;
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const c = { x: wanted.x + dx, y: wanted.y + dy };
        if (!walkable(c)) continue;
        // (nearest the wanted cell; among equals, the one nearest the middle of the view)
        const d = Math.hypot(dx, dy) + 0.01 * Math.hypot(c.x - center.x, c.y - center.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
    }
    if (!best) return;
    syncPose(best, dir, floorHeight(map, best.x, best.y));
    pushLog(t("app.topdownPlaced", { x: best.x, y: best.y }), "editor");
  };
  const onEditDrag = (drag: EditDrag, target: EditTarget): number | boolean => {
    // (what was last worked on: where the top-down view puts the party when it is left)
    if (target.cell) lastTouched.current = { x: target.cell.x, y: target.cell.y };
    const file = mapFile(map.id);
    if (!file || areaClip.pasting) return drag.index;
    let index = drag.index;
    const step = `${drag.kind} drag ${drag.id}`;
    if (drag.first) dragGrab.current = null;
    // the copy, made on the first step: the end of its list
    type DragList = "items" | "smokes" | "props" | "decals" | "lights" | "actors";
    let pendingCopy: DragList | undefined;
    let applied = false;
    const copyFirst = (list: DragList) => {
      if (drag.first && drag.copy && file[list]?.[index]) pendingCopy = list;
    };
    const commit = (edit: Parameters<typeof applyEdit>[1]) => {
      const result = applyEdit(map.id, (f) => {
        if (pendingCopy) {
          const list = pendingCopy;
          const from = index;
          const entries = f[list] as unknown[];
          index = entries.push(structuredClone(entries[from])) - 1;
          // (a torch's copy brings its own flame)
          if (list === "props") {
            const spec = f.props![from];
            const at = flamePosition({ ...spec, cell: { x: spec.x, y: spec.y } } as PropSpec);
            if (at) addSmoke(f, { x: spec.x, y: spec.y, pos: at, fire: true, decorative: true });
          }
        }
        return edit(f);
      }, step);
      if ("error" in result) return false;
      applied = true;
      replaceMap(result.map);
      return true;
    };
    const clamp = (v: number, reach = 0.45) => Math.round(Math.min(reach, Math.max(-reach, v)) * 100) / 100;
    if (drag.kind === "item") {
      // a loose item: where the pointer is on a floor or a prop's top
      copyFirst("items");
      const point = target.point;
      if (point) {
        const [dx, up, dz] = point.pos;
        const patch = { x: point.cell.x, y: point.cell.y, offset: [clamp(dx), clamp(dz)] as [number, number], elevation: up > 0.03 ? Math.round(up * 100) / 100 : undefined };
        commit((f) => updateItem(f, index, patch));
      }
    } else if (drag.kind === "smoke") {
      // a particle emitter: just off the surface pointed at
      copyFirst("smokes");
      const spot = target.spot;
      if (spot) commit((f) => updateSmoke(f, index, { x: spot.cell.x, y: spot.cell.y, pos: spot.pos }));
    } else if (drag.kind === "prop") {
      copyFirst("props");
      const spec = mapFile(map.id)?.props?.[index];
      if (!spec) return false;
      let place: Partial<NonNullable<typeof file.props>[number]> | null = null;
      if (drag.at) {
        // on the floor: the cell the grabbed spot is over, nudged there (a
        // chamfer keeps its corner, the rest go by the cell's middle)
        const [wx, wz] = drag.at;
        const cell = { x: Math.round(wx), y: Math.round(wz) };
        if (cellAt(map, cell.x, cell.y) !== "floor") return false;
        const chamfer = PROP_TYPES[spec.prop]?.kind === "chamfer";
        const base = chamfer ? propPlacement({ ...spec, cell, at: spec.at ?? "center", offset: undefined } as PropSpec) : { x: cell.x, z: cell.y };
        const ox = clamp(wx - base.x);
        const oz = clamp(wz - base.z);
        place = { x: cell.x, y: cell.y, at: chamfer ? spec.at : "center", offset: ox || oz ? [ox, oz] : undefined };
      } else {
        place = propPlace(spec.prop, target);
      }
      if (!place) return false;
      const moved = place;
      commit((f) => {
        // (a torch's flame goes along)
        const before = f.props![index];
        const was = flamePosition({ ...before, cell: { x: before.x, y: before.y } } as PropSpec);
        const found = was ? flameSmokeIndex(f, { x: before.x, y: before.y }, was) : -1;
        updateProp(f, index, moved);
        const after = f.props![index];
        const now = flamePosition({ ...after, cell: { x: after.x, y: after.y } } as PropSpec);
        if (found >= 0 && now && f.smokes) f.smokes[found] = { ...f.smokes[found], x: after.x, y: after.y, pos: now };
        return f;
      });
    } else if (drag.kind === "light") {
      copyFirst("lights");
      const spec = mapFile(map.id)?.lights?.[index];
      if (!spec || !drag.at) return false;
      const [wx, wz] = drag.at;
      const cell = { x: Math.round(wx), y: Math.round(wz) };
      if (cellAt(map, cell.x, cell.y) === "wall") return false;
      if (spec.pos) {
        // a free-standing light: across its level, at the height it had over
        // its floor
        const pos: [number, number, number] = [clamp(wx - cell.x, 0.49), spec.pos[1], clamp(wz - cell.y, 0.49)];
        commit((f) => updateLight(f, index, { x: cell.x, y: cell.y, pos }));
      } else {
        // a ceiling lamp: into another cell's ceiling - not one with a lamp of its own
        const there = ownCeilingLight(map, cell);
        if (there >= 0 && there !== index) return false;
        commit((f) => updateLight(f, index, { x: cell.x, y: cell.y }));
      }
    } else if (drag.kind === "actor") {
      copyFirst("actors");
      const spec = mapFile(map.id)?.actors?.[index];
      if (!spec || !drag.at) return false;
      const cell = { x: Math.round(drag.at[0]), y: Math.round(drag.at[1]) };
      if (cellAt(map, cell.x, cell.y) !== "floor" || (cell.x === spec.x && cell.y === spec.y)) return false;
      // its facing stays; its route goes along with it if it still runs over
      // floors there, else it starts from where it stands now
      const dx = cell.x - spec.x;
      const dy = cell.y - spec.y;
      const route = spec.patrol?.map(([x, y]): [number, number] => [x + dx, y + dy]);
      const fits = route?.every(([x, y]) => cellAt(map, x, y) === "floor");
      const patrol = !spec.patrol?.length ? undefined : fits ? route : spec.patrol.map(([x, y], i): [number, number] => (i === 0 && x === spec.x && y === spec.y ? [cell.x, cell.y] : [x, y]));
      commit((f) => updateActor(f, index, { x: cell.x, y: cell.y, patrol }));
    } else if (drag.kind === "door") {
      // a door, let go of in another cell (see doorFits): moved there with all
      // its settings (copied, with Ctrl), facing along the passage there
      if (!drag.drop || !drag.door) return false;
      const from = drag.door;
      if (drag.offset !== undefined) {
        // slid inside its cell: where along its passage it stands
        const spec = doorAt(map, from.x, from.y);
        if ((spec.offset ?? 0) === drag.offset) return false;
        const offset = drag.offset || undefined;
        const result = applyEdit(map.id, (f) => updateDoor(f, from, { kind: spec.kind, facing: spec.facing }, { offset }), step);
        if ("error" in result) {
          pushLog(t("app.editorError", { error: result.error }), "error");
          return false;
        }
        replaceMap(result.map);
        setSelectedDoor(from);
        setEdits((n) => n + 1);
        return true;
      }
      const to = target.cell;
      if (to.x === pos.x && to.y === pos.y) {
        pushLog(t("app.doorAtParty"), "editor");
        return false;
      }
      const spec = doorAt(map, from.x, from.y);
      const entry = file.doors?.find((d) => d.x === from.x && d.y === from.y);
      const facing = doorFacingAt(map, to, spec.facing);
      const result = applyEdit(
        map.id,
        (f) => {
          if (!drag.copy) toggleDoor(f, from);
          toggleDoor(f, to);
          // (a door with nothing set needs no entry - unless it turns)
          if (entry || facing !== doorAt(map, to.x, to.y).facing) {
            const settings: Record<string, unknown> = structuredClone(entry ?? { kind: spec.kind, facing });
            delete settings.x;
            delete settings.y;
            updateDoor(f, to, { kind: spec.kind, facing }, { ...settings, facing });
          }
          return f;
        },
        step,
      );
      if ("error" in result) {
        pushLog(t("app.editorError", { error: result.error }), "error");
        return false;
      }
      replaceMap(result.map);
      setSelectedDoor(to);
      setEdits((n) => n + 1);
      return true;
    } else {
      copyFirst("decals");
      const sp = target.surfacePoint;
      const spec = mapFile(map.id)?.decals?.[index];
      if (!sp || !spec) return false;
      // (grabbed where it was: the point under the pointer keeps its place on the decal)
      if (!dragGrab.current) dragGrab.current = sp.surface === spec.surface && sp.cell.x === spec.x && sp.cell.y === spec.y ? [spec.px - sp.u, spec.py - sp.v] : [0, 0];
      const [gx, gy] = dragGrab.current;
      const patch = { x: sp.cell.x, y: sp.cell.y, surface: sp.surface, px: Math.round(sp.u + gx), py: Math.round(sp.v + gy) };
      commit((f) => updateDecal(f, index, patch));
    }
    if (!applied) return false;
    if (drag.first) {
      if (selecting) selectOnly(drag.kind, index);
      else ({ item: setSelectedItem, smoke: setSelectedSmoke, prop: setSelectedProp, light: setSelectedLight, actor: setSelectedActor, decal: setSelectedDecal })[drag.kind](index);
    }
    setEdits((n) => n + 1);
    return index;
  };
  // the wheel (height, Ctrl: scale, Alt: turn) or Alt + drag on the selected prop or decal
  const onEditAdjust = (adjust: { what: "height" | "scale" | "rotate"; delta: number }) => {
    const round = (v: number) => Math.round(v * 100) / 100;
    if (keyTool === "light" && selectedLight !== null) {
      // a free-standing light: up or down over its floor
      const spec = map.lights?.[selectedLight];
      if (!spec?.pos || adjust.what !== "height") return;
      const room = ceilingHeight(map, spec.x, spec.y) - floorHeight(map, spec.x, spec.y);
      const pos: [number, number, number] = [spec.pos[0], round(Math.min(room - 0.02, Math.max(0.02, spec.pos[1] + adjust.delta))), spec.pos[2]];
      changeLight({ pos });
    } else if (keyTool === "item" && selectedItem !== null) {
      const spec = map.items?.[selectedItem];
      if (spec && adjust.what === "height") changeItem({ elevation: round(Math.max(0, (spec.elevation ?? 0) + adjust.delta)) || undefined }, "wheel-height");
    } else if (keyTool === "prop" && selectedProp !== null) {
      const spec = map.props?.[selectedProp];
      if (!spec) return;
      if (adjust.what === "height") changeProp({ elevation: round(Math.max(-0.5, (spec.elevation ?? 0) + adjust.delta)) || undefined }, "wheel-height");
      else if (adjust.what === "scale") changeProp({ scale: round(Math.min(4, Math.max(0.25, (spec.scale ?? 1) + adjust.delta))) === 1 ? undefined : round(Math.min(4, Math.max(0.25, (spec.scale ?? 1) + adjust.delta))) }, "wheel-scale");
      else changeProp({ rotation: (((spec.rotation ?? 0) + adjust.delta) % 360 + 360) % 360 || undefined }, "wheel-rotate");
    } else if (keyTool === "decal" && selectedDecal !== null) {
      const spec = map.decals?.[selectedDecal];
      if (!spec) return;
      if (adjust.what === "scale") {
        const scale = round(Math.min(4, Math.max(0.25, (spec.scale ?? 1) + adjust.delta)));
        changeDecal({ scale: scale === 1 ? undefined : scale }, "wheel-scale");
      } else if (adjust.what === "rotate") changeDecal({ rotation: (((spec.rotation ?? 0) + adjust.delta) % 360 + 360) % 360 || undefined }, "wheel-rotate");
    }
  };
  // Ctrl+C / Ctrl+V on the selected prop, decal, item, light or robot (pasted
  // where the pointer is; only with that thing's tool in hand)
  type ClipKind = "prop" | "decal" | "item" | "light" | "actor";
  const clipboardRef = useRef<{ kind: ClipKind; spec: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (!editMode) return;
    const toolOf: Record<ClipKind, EditTool> = { prop: "prop", decal: "decal", item: "item", light: "light", actor: "robot" };
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (isTextEntry(el)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        const file = mapFile(map.id);
        const copy = (kind: ClipKind, spec: unknown, message: Key) => {
          clipboardRef.current = { kind, spec: structuredClone(spec) as Record<string, unknown> };
          areaClip.noteSingleCopy();
          pushLog(t(message), "editor");
        };
        if (editTool === "prop" && selectedProp !== null && file?.props?.[selectedProp]) copy("prop", file.props[selectedProp], "app.copiedProp")
        else if (editTool === "decal" && selectedDecal !== null && file?.decals?.[selectedDecal]) copy("decal", file.decals[selectedDecal], "app.copiedDecal")
        else if (editTool === "item" && selectedItem !== null && file?.items?.[selectedItem]) copy("item", file.items[selectedItem], "app.copiedItem")
        else if (editTool === "light" && selectedLight !== null && file?.lights?.[selectedLight]) copy("light", file.lights[selectedLight], "app.copiedLight")
        else if (editTool === "robot" && selectedActor !== null && file?.actors?.[selectedActor]) copy("actor", file.actors[selectedActor], "app.copiedRobot")
      } else if (key === "v" && clipboardRef.current) {
        const clip = clipboardRef.current;
        const target = hoverTargetRef.current;
        if (!target || toolOf[clip.kind] !== editTool) return;
        e.preventDefault();
        // the copy at the end of its list, picked
        const paste = <K extends "props" | "decals" | "items" | "lights" | "actors">(list: K, entry: Record<string, unknown>, select: (index: number) => void) => {
          const count = (map[list] as unknown[] | undefined)?.length ?? 0;
          // (a setting set to undefined is left out of the file)
          for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
          const result = applyEdit(map.id, (f) => {
            ((f[list] ?? (f[list] = [] as never)) as unknown[]).push(entry);
            return f;
          });
          if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
          else {
            replaceMap(result.map);
            select(count);
          }
        };
        const spec = structuredClone(clip.spec);
        if (clip.kind === "prop") {
          const place = propPlace(spec.prop as string, target);
          if (place) paste("props", { ...spec, ...place }, setSelectedProp);
        } else if (clip.kind === "decal") {
          const sp = target.surfacePoint;
          if (sp) paste("decals", { ...spec, x: sp.cell.x, y: sp.cell.y, surface: sp.surface, px: Math.round(sp.u), py: Math.round(sp.v) }, setSelectedDecal);
        } else if (clip.kind === "item") {
          const point = target.point;
          if (point) {
            const [dx, up, dz] = point.pos;
            const clamp = (v: number) => Math.round(Math.min(0.45, Math.max(-0.45, v)) * 100) / 100;
            paste("items", { ...spec, x: point.cell.x, y: point.cell.y, offset: [clamp(dx), clamp(dz)], elevation: up > 0.03 ? Math.round(up * 100) / 100 : undefined }, setSelectedItem);
          }
        } else if (clip.kind === "light") {
          // a free-standing light just off the surface pointed at; a ceiling
          // lamp in the cell's ceiling (not one that has a lamp already)
          if (spec.pos && target.spot) paste("lights", { ...spec, x: target.spot.cell.x, y: target.spot.cell.y, pos: target.spot.pos }, setSelectedLight);
          else if (!spec.pos && target.kind !== "wall" && ownCeilingLight(map, target.cell) < 0) paste("lights", { ...spec, x: target.cell.x, y: target.cell.y }, setSelectedLight);
        } else if (target.kind !== "wall") {
          // a robot: in the floor pointed at, its route left behind
          paste("actors", { ...spec, x: target.cell.x, y: target.cell.y, patrol: undefined }, setSelectedActor);
        }
        setEdits((n) => n + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, editTool, selectedProp, selectedDecal, selectedItem, selectedLight, selectedActor, map]);
  // The Roof tool (see roofAutotile.ts, roofEdits.ts): a stroke over floor cells roofs them - the
  // pieces, their turns and heights follow from the cells; the right button takes the roof off
  // (Shift: the whole roof), Shift roofs the whole raised block under the pointer, Ctrl starts a
  // roof of its own instead of joining the one beside it. A stroke is one undo step.
  const roofPaint = (target: EditTarget, stroke: { first: boolean; erase: boolean; shift: boolean; ctrl: boolean }) => {
    // (a wall, or a step's face - that cell is the lower one beside it, not what is pointed at)
    if (target.kind === "wall" || target.face) return;
    const file = mapFile(map.id);
    if (!file) return;
    const cell = target.cell;
    if (stroke.first) roofStrokeSerial.current++;
    const merge = `roof stroke ${roofStrokeSerial.current}`;
    let result: ReturnType<typeof applyEdit>;
    let log: string;
    if (stroke.erase) {
      const there = file.props?.find((p) => p.x === cell.x && p.y === cell.y && p.auto);
      if (!there) return;
      const group = there.auto!;
      result = applyEdit(map.id, (f) => (stroke.shift ? eraseRoofGroup(f, group) : eraseRoof(f, [cell])), merge);
      log = stroke.shift ? t("roofauto.erasedRoof", { group }) : t("roofauto.erased", { count: 1 });
      setSelectedProp(null);
    } else {
      let cells: Vec2[] = [cell];
      if (stroke.shift) {
        const block = roofFootprint(file, cell);
        if (!block) {
          pushLog(t("roofauto.notBlock"), "editor");
          return;
        }
        cells = block;
      }
      // (the roof the stroke paints into: the one at or beside its first cell, else a new one)
      if (stroke.first || !roofStroke.current) roofStroke.current = { id: roofStrokeSerial.current, group: roofGroupFor(file, cell, roofForm, stroke.ctrl) };
      const group = roofStroke.current.group;
      const texture = roofTexture || undefined;
      result = applyEdit(map.id, (f) => paintRoof(f, cells, group, texture), merge);
      log = t("roofauto.painted", { count: cells.length, group });
      setSelectedProp(null);
    }
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      replaceMap(result.map);
      // (one line per stroke, not one per cell)
      if (stroke.first) pushLog(log, "editor");
    }
    setEdits((n) => n + 1);
  };
  // The fence and block tools (see game/fences.ts, editor/fenceEdits.ts): a stroke puts a piece in each cell it
  // crosses - the edge tool on the side of the cell the stroke began on: the one nearest the first click, or the
  // one picked in the panel - and the right button takes them out. A stroke is one undo step.
  const FENCE_TOOLS: Partial<Record<EditTool, FenceForm>> = { fenceblock: "block", fenceedge: "edge", fencemid: "mid" };
  const fencePaint = (target: EditTarget, stroke: { first: boolean; erase: boolean }) => {
    const form = FENCE_TOOLS[editTool];
    // (a wall, or a step's face - that cell is the lower one beside it, not what is pointed at)
    if (!form || target.kind === "wall" || target.face) return;
    const file = mapFile(map.id);
    if (!file) return;
    const cell = target.cell;
    if (stroke.first) {
      fenceStrokeSerial.current++;
      fenceStroke.current = null;
    }
    const merge = `fence stroke ${fenceStrokeSerial.current}`;
    let side: Direction | undefined;
    if (form === "edge") {
      if (!fenceStroke.current) {
        const picked: Direction | null = fence.side !== "auto" ? fence.side : target.at ? sideFromPoint(target.at[0] - cell.x, target.at[1] - cell.y) : null;
        // (in the middle of the cell the click does not say which edge: the panel does)
        if (!picked) {
          pushLog(t("fence.pickSide"), "editor");
          return;
        }
        fenceStroke.current = { side: picked };
      }
      side = fenceStroke.current.side ?? undefined;
    }
    const paint = { texture: fence.texture || undefined, style: fence.style, rotation: fence.rotation };
    if (stroke.erase) lastFenceStroke.current = null;
    else if (stroke.first || lastFenceStroke.current?.serial !== fenceStrokeSerial.current) lastFenceStroke.current = { form, side, cells: [cell], serial: fenceStrokeSerial.current };
    else if (!lastFenceStroke.current.cells.some((c) => c.x === cell.x && c.y === cell.y)) lastFenceStroke.current.cells.push(cell);
    const result = applyEdit(map.id, (f) => (stroke.erase ? eraseFence(f, form, [cell], side) : paintFence(f, form, [cell], paint, side)), merge);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setSelectedProp(null);
    setEdits((n) => n + 1);
  };
  // The fence tools' panel: its settings are what the next pieces are made with, and - until another tool is
  // picked or a new stroke begins - what the pieces of the last stroke are made of too (so the thickness,
  // texture, top and decoration of what was just built can be tuned straight away).
  const onFencePanel = (patch: Partial<FenceToolState>) => {
    const next = { ...fence, ...patch };
    setFence(next);
    const last = lastFenceStroke.current;
    if (!last || FENCE_TOOLS[editTool] !== last.form || !("texture" in patch || "style" in patch || "rotation" in patch)) return;
    const paint = { texture: next.texture || undefined, style: next.style, rotation: next.rotation };
    const result = applyEdit(map.id, (f) => restyleFence(f, last.form, last.cells, paint, last.side), `fence stroke ${last.serial} restyle`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  // The map editor's edits: a click digs out the wall pointed at or fills in
  // the floor (the Fill tool, or the right button), paints the surface with
  // the set picked in the palette (the right button paints the map's own
  // texture back), or toggles the cell's ceiling light.
  // Link mode of the operable props (see editor/operableLink.ts): a click names a target of the source being linked - a
  // door or a wall trap; the right button ends it
  const operableLinkClick = (target: EditTarget, alt: boolean): boolean => {
    const from = operableLink.get();
    if (!from) return false;
    if (alt) {
      operableLink.cancel();
      return true;
    }
    const to = linkTargetFor(map, { door: target.door, prop: target.prop, cell: target.cell });
    if (!to) {
      pushLog(t("operable.link.nothing"), "editor");
      return true;
    }
    const result = applyEdit(map.id, (file) => addTarget(file, from, to));
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      replaceMap(result.map);
      pushLog(t("operable.link.added", { what: t(to.kind === "door" ? "operable.target.door" : "operable.target.trap", { x: to.x, y: to.y, side: to.kind === "trap" && to.side ? ` ${to.side}` : "" }) }), "editor");
    }
    setEdits((n) => n + 1);
    return true;
  };
  const onEdit = (target: EditTarget, alt: boolean, shift = false, ctrl = false) => {
    // an area being pasted takes the clicks: the left button puts it down, the right one stops
    if (areaClip.pasting) {
      if (alt) areaClip.cancel();
      else areaClip.place(target.cell);
      return;
    }
    if (operableLinkClick(target, alt)) return;
    let result: ReturnType<typeof applyEdit> | null = null;
    if (!(["dig", "fill", "height", "texture"] as EditTool[]).includes(editTool) && target.cell) lastTouched.current = { x: target.cell.x, y: target.cell.y };
    if (selecting) {
      // the nearest thing under the pointer (the view picked it: NPC, item, prop, decal, light, emitter); nothing: let go
      if (target.actor !== undefined) selectOnly("actor", target.actor);
      else if (target.item !== undefined) selectOnly("item", target.item);
      else if (target.prop !== undefined) selectOnly("prop", target.prop);
      else if (target.decal !== undefined) selectOnly("decal", target.decal);
      else if (target.light !== undefined) selectOnly("light", target.light);
      else if (target.smoke !== undefined) selectOnly("smoke", target.smoke);
      else {
        // (a gate or staircase marks a floor cell: a click on that cell picks it - its panel is the Exit or Stairs tool's)
        const cell = target.kind === "wall" ? undefined : target.cell;
        const exit = cell && (map.exits ?? []).some((e) => e.cell.x === cell.x && e.cell.y === cell.y);
        const stairs = cell && (map.stairs ?? []).some((s) => s.cell.x === cell.x && s.cell.y === cell.y);
        selectOnly(null);
        if (exit) setSelectedExit(cell!);
        else if (stairs) setSelectedStairs(cell!);
      }
      return;
    }
    if (editTool === "texture" && target.face) {
      // a step face (a riser or header) has a texture of its own: the open cell
      // it's seen from and its side (the right button: back to the cell's)
      const { cell, side } = target.face;
      const setId = alt ? null : paint.wall;
      result = applyEdit(map.id, (file) => paintFace(file, cell, side, setId));
      if (!("error" in result)) {
        pushLog(t("app.faceTextureAt", { side, x: cell.x, y: cell.y, texture: setId ?? t("app.ownTexture") }), "editor");
      }
    } else if (editTool === "texture") {
      // a wall's texture set is the open cell its face is seen from
      const cell = target.kind === "wall" ? target.from : target.cell;
      const layer: TextureLayer =
        target.kind === "wall" ? "wallTexture" : target.kind === "floor" ? "floorTexture" : "ceilingTexture";
      if (cell) {
        const setId = alt ? null : paint[target.kind];
        result = applyEdit(map.id, (file) => paintTexture(file, layer, cell, setId));
        if (!("error" in result)) {
          pushLog(t("app.textureAt", { surface: t(`app.${target.kind}`), x: cell.x, y: cell.y, texture: setId ?? t("app.ownTexture") }), "editor");
        }
      }
    } else if (editTool === "light") {
      // Light tool: a click picks a light (its bulb, or a cell's ceiling
      // lamp), or places one where there's none; the right button removes it
      const cell = target.cell;
      const count = map.lights?.length ?? 0;
      const own = target.light ?? (target.kind === "wall" ? -1 : ownCeilingLight(map, cell));
      if (alt) {
        if (own >= 0) {
          result = applyEdit(map.id, (file) => removeLight(file, own));
          setSelectedLight((sel) => (sel === null || sel === own ? null : sel > own ? sel - 1 : sel));
        }
      } else if (target.light !== undefined) {
        setSelectedLight(target.light);
        return;
      } else if ((shift || lightPlace === "point") && target.spot) {
        const { cell: at, pos } = target.spot;
        result = applyEdit(map.id, (file) => addLight(file, { ...(templates.current.light as object), x: at.x, y: at.y, pos }));
        setSelectedLight(count);
      } else if (target.kind !== "wall") {
        if (own >= 0) {
          setSelectedLight(own);
          return;
        }
        result = applyEdit(map.id, (file) => addLight(file, { ...(templates.current.light as object), x: cell.x, y: cell.y }));
        setSelectedLight(count);
      }
    } else if (editTool === "height") {
      // raise (lower: right button) the floor or ceiling pointed at; Ctrl: a whole block (1.0) instead of a quarter
      if (target.kind === "wall") return;
      const cell = target.cell;
      const floor = floorHeight(map, cell.x, cell.y);
      const step = (ctrl ? 1 : 0.25) * (alt ? -1 : 1);
      if (target.kind === "ceiling") {
        const value = ceilingHeight(map, cell.x, cell.y) + step;
        // one panel above the floor is the default: no need to write it
        result = applyEdit(map.id, (file) => setHeight(file, "ceiling", cell, value === floor + 1 ? null : value));
        if (!("error" in result)) pushLog(t("app.ceilingAt", { x: cell.x, y: cell.y, height: value }), "editor");
      } else {
        const value = floor + step;
        result = applyEdit(map.id, (file) => setHeight(file, "floor", cell, value === 0 ? null : value));
        if (!("error" in result)) pushLog(t("app.floorAt", { x: cell.x, y: cell.y, height: value }), "editor");
      }
    } else if (editTool === "ladder") {
      // against the side of the cell nearest the click (a click on a step's
      // face: the lower cell's side toward it)
      const spot = target.spot;
      if (!spot) return;
      const [dx, , dz] = spot.pos;
      const wall: Direction = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "E" : "W") : dz > 0 ? "S" : "N";
      result = applyEdit(map.id, (file) => toggleLadder(file, spot.cell, wall));
    } else if (editTool === "bridge") {
      // across the cell the way the party faces, at its ledges' height
      if (target.kind === "wall") return;
      const cell = target.cell;
      const axis = dir === "N" || dir === "S" ? "NS" : "EW";
      const v = axis === "NS" ? { x: 0, y: 1 } : { x: 1, y: 0 };
      const ledge = Math.max(
        ...[-1, 1].map((s) => {
          const n = { x: cell.x + v.x * s, y: cell.y + v.y * s };
          return cellAt(map, n.x, n.y) === "wall" ? -Infinity : floorHeight(map, n.x, n.y);
        }),
      );
      result = applyEdit(map.id, (file) => toggleBridge(file, cell, axis, ledge));
    } else if (editTool === "robot") {
      // a click on a robot picks it (the right button takes it out); on a
      // floor it puts in one of the kind picked - or, Shift+click with a
      // robot picked, adds that floor to its patrol route
      const picked = target.actor;
      if (picked !== undefined) {
        if (!alt) {
          setSelectedActor(picked);
          return;
        }
        result = applyEdit(map.id, (file) => removeActor(file, picked));
        setSelectedActor(null);
      } else if (target.kind !== "wall" && !alt) {
        const cell = target.cell;
        const sel = selectedActor === null ? undefined : map.actors?.[selectedActor];
        if (shift && sel && selectedActor !== null) {
          const route = (sel.patrol.length ? sel.patrol : [sel.cell]).map((p): [number, number] => [p.x, p.y]);
          const index = selectedActor;
          result = applyEdit(map.id, (file) => updateActor(file, index, { patrol: [...route, [cell.x, cell.y]] }));
        } else {
          const choice = robotChoice && ACTOR_TYPES[robotChoice] && assetInWorld(robotChoice) ? robotChoice : null;
          if (!choice) {
            pushLog(t("app.pickActor"), "editor");
            return;
          }
          const count = map.actors?.length ?? 0;
          result = applyEdit(map.id, (file) => addActor(file, { ...(templates.current.actor as object), actor: choice, x: cell.x, y: cell.y, facing: behindOf(dir) }));
          setSelectedActor(count);
        }
      }
    } else if (editTool === "door") {
      // a click on a door picks it (the right button turns it back into
      // floor); on a floor it makes the cell a door (and picks it)
      const cell = target.door ?? target.cell;
      const isDoor = cellAt(map, cell.x, cell.y) === "door";
      if (isDoor && !alt) {
        setSelectedDoor(cell);
        return;
      }
      if (target.kind === "wall" && !target.door) return;
      if (alt && !isDoor) return;
      if (cell.x === pos.x && cell.y === pos.y && !isDoor) {
        pushLog(t("app.doorAtParty"), "editor");
        return;
      }
      const type = doorTypeChoice && doorTypeChoice.startsWith(map.world + "_") ? doorTypeChoice : undefined;
      result = applyEdit(map.id, (file) => {
        const next = toggleDoor(file, cell);
        return !isDoor && type
          ? updateDoor(next, cell, { kind: "standard", facing: doorFacingAt(map, cell, dir) }, { type })
          : next;
      });
      setSelectedDoor(isDoor ? null : cell);
    } else if (editTool === "decal") {
      // a click on a decal picks it (the right button takes it off); on a
      // surface it puts the palette's decal there, centered on the click
      const picked = target.decal;
      if (picked !== undefined) {
        if (!alt) {
          setSelectedDecal(picked);
          return;
        }
        result = applyEdit(map.id, (file) => removeDecal(file, picked));
        setSelectedDecal((sel) => (sel === null || sel === picked ? null : sel > picked ? sel - 1 : sel));
      } else if (!alt && target.surfacePoint) {
        if (!decalChoice) {
          pushLog(t("app.pickDecal"), "editor");
          return;
        }
        const { cell, surface, u, v } = target.surfacePoint;
        const allowedSurface = sharedImage(decalChoice.name)?.surface;
        const surfaceKind = surface === "floor" || surface === "ceiling" ? surface : "wall";
        if (allowedSurface && allowedSurface !== surfaceKind) {
          pushLog(t("assetManager.image.wrongSurface", { surface: t(`editorBar.${allowedSurface}`) }), "editor");
          return;
        }
        const count = map.decals?.length ?? 0;
        result = applyEdit(map.id, (file) =>
          addDecal(file, {
            decal: decalChoice.name,
            x: cell.x,
            y: cell.y,
            surface,
            px: Math.round(u - decalChoice.width / 2),
            py: Math.round(v - decalChoice.height / 2),
            ...(decalRotation ? { rotation: decalRotation } : {}),
          }),
        );
        setSelectedDecal(count);
      }
    } else if (editTool === "prop") {
      // a click on a prop picks it (the right button takes it out); on a
      // floor it puts in the palette's prop there (and picks it)
      const picked = target.prop;
      if (picked !== undefined) {
        if (!alt) {
          setSelectedProp(picked);
          return;
        }
        const gone = map.props?.[picked];
        result = applyEdit(map.id, (file) => {
          // (a torch takes its fire with it)
          const at = gone && flamePosition(gone);
          const found = at && gone ? flameSmokeIndex(file, gone.cell, at) : -1;
          if (found >= 0) removeSmoke(file, found);
          return removePropIndex(file, picked);
        });
        setSelectedProp((sel) => (sel === null || sel === picked ? null : sel > picked ? sel - 1 : sel));
      } else {
        const wallProp = !!PROP_TYPES[propChoice]?.wall;
        // a prop hung on a wall: a click on the wall itself puts it there (on
        // the open cell in front of it, at that side)
        // (or on a step face - a riser or header - at the height pointed at)
        const onFace = target.face && wallProp && !alt ? target.face : undefined;
        const onWall = onFace ? { cell: onFace.cell, surface: onFace.side } : target.kind === "wall" && wallProp && !alt ? target.surfacePoint : undefined;
        if (target.kind === "wall" && !(onWall && onWall.surface !== "floor" && onWall.surface !== "ceiling")) return;
        const cell = onWall ? onWall.cell : target.cell;
        const elevation = onFace ? faceElevation(propChoice, target) : undefined;
        const [dx, , dz] = target.spot && target.spot.cell.x === cell.x && target.spot.cell.y === cell.y ? target.spot.pos : [0, 0, 0];
        // (on a floor: the nearest side that really is a wall)
        const wallSide = (): PropAnchor => {
          const sides = (Object.keys(DIR_VECTOR) as Direction[])
            .map((d) => ({ d, score: dx * DIR_VECTOR[d].x + dz * DIR_VECTOR[d].y }))
            .sort((a, b) => b.score - a.score);
          return (sides.find((s) => cellAt(map, cell.x + DIR_VECTOR[s.d].x, cell.y + DIR_VECTOR[s.d].y) === "wall") ?? sides[0]).d;
        };
        if (alt) {
          result = applyEdit(map.id, (file) => removeProp(file, cell, anchorAt(dx, dz)));
          setSelectedProp(null);
        } else {
          const anchor: PropAnchor = onWall ? (onWall.surface as Direction) : wallProp ? wallSide() : anchorAt(dx, dz);
          const count = map.props?.length ?? 0;
          result = applyEdit(map.id, (file) => {
            addProp(file, propChoice, cell, anchor, propRotation, elevation === undefined ? {} : { elevation });
            if (Object.keys(templates.current.prop).length) updateProp(file, count, templates.current.prop as Parameters<typeof updateProp>[2]);
            const flame = flamePosition({ prop: propChoice, cell, at: anchor, rotation: propRotation, elevation });
            if (flame) addSmoke(file, { x: cell.x, y: cell.y, pos: flame, fire: true, decorative: true });
            return file;
          });
          setSelectedProp(count);
        }
      }
    } else if (editTool === "roofauto") {
      // (the view's strokes reach the tool through onEditPaint; this is a click on the minimap)
      roofPaint(target, { first: true, erase: alt, shift, ctrl: false });
      return;
    } else if (editTool === "fenceblock" || editTool === "fenceedge" || editTool === "fencemid") {
      // (the same: the view's strokes come through onEditPaint, this is a click on the minimap)
      fencePaint(target, { first: true, erase: alt });
      return;
    } else if (editTool === "smoke") {
      // a click on an emitter's marker picks it (the right button takes it
      // out); anywhere else it puts one just off the surface pointed at
      const picked = target.smoke;
      if (picked !== undefined) {
        if (!alt) {
          setSelectedSmoke(picked);
          return;
        }
        result = applyEdit(map.id, (file) => removeSmoke(file, picked));
        setSelectedSmoke((sel) => (sel === null || sel === picked ? null : sel > picked ? sel - 1 : sel));
      } else {
        if (alt || !target.spot) return;
        const { cell: at, pos } = target.spot;
        const count = map.smokes?.length ?? 0;
        result = applyEdit(map.id, (file) => addSmoke(file, { ...(templates.current.smoke as object), x: at.x, y: at.y, pos }));
        setSelectedSmoke(count);
      }
    } else if (editTool === "exit") {
      // a click on a floor puts a way off the ship there (or picks the one
      // there); the right button takes it out
      if (target.kind === "wall") return;
      const cell = target.cell;
      const there = (map.exits ?? []).some((e) => e.cell.x === cell.x && e.cell.y === cell.y);
      if (there && !alt) {
        setSelectedExit(cell);
        return;
      }
      if (!there && alt) return;
      result = applyEdit(map.id, (file) => toggleExit(file, cell));
      setSelectedExit(there ? null : cell);
    } else if (editTool === "stairs") {
      // a click on a floor puts stairs there (or picks the ones there); the right button takes them out
      if (target.kind === "wall") return;
      const cell = target.cell;
      const there = (map.stairs ?? []).some((s) => s.cell.x === cell.x && s.cell.y === cell.y);
      if (there && !alt) {
        setSelectedStairs(cell);
        return;
      }
      if (!there && alt) return;
      result = applyEdit(map.id, (file) => toggleStairs(file, cell));
      setSelectedStairs(there ? null : cell);
    } else if (editTool === "start") {
      // the party starts here, facing as it faces now; the start itself turns a quarter
      if (target.kind === "wall" || alt) return;
      const cell = target.cell;
      const here = map.start.cell.x === cell.x && map.start.cell.y === cell.y;
      const order: Direction[] = ["N", "E", "S", "W"];
      const facing: Direction = here ? order[(order.indexOf(map.start.facing) + 1) % 4] : dir;
      result = applyEdit(map.id, (file) => setStart(file, cell, facing));
      if (!("error" in result)) pushLog(t("app.startAt", { x: cell.x, y: cell.y, facing: facing }), "editor");
    } else if (editTool === "restricted") {
      // a click on a floor: restricted, or not any more
      if (target.kind === "wall") return;
      const cell = target.cell;
      result = applyEdit(map.id, (file) => toggleRestricted(file, cell));
    } else if (editTool === "item") {
      // a click on an item picks it (the right button takes it out); on a
      // floor or a prop's top it puts the palette's item there (picked)
      const picked = target.item;
      if (picked !== undefined) {
        if (!alt) {
          setSelectedItem(picked);
          return;
        }
        result = applyEdit(map.id, (file) => removeItem(file, picked));
        setSelectedItem((sel) => (sel === null || sel === picked ? null : sel > picked ? sel - 1 : sel));
      } else {
        const point = target.point;
        if (alt || !point) return;
        const [dx, up, dz] = point.pos;
        const clamp = (v: number) => Math.min(0.45, Math.max(-0.45, v));
        const count = map.items?.length ?? 0;
        result = applyEdit(map.id, (file) =>
          addItem(file, {
            ...(templates.current.item as object),
            item: itemChoice,
            x: point.cell.x,
            y: point.cell.y,
            offset: [clamp(dx), clamp(dz)],
            ...(up > 0.03 ? { elevation: Math.round(up * 100) / 100 } : {}),
          }),
        );
        setSelectedItem(count);
      }
    } else if (editTool === "wall") {
      // a click on a wall left to chance picks it (the right button makes it
      // a plain wall); on another wall or a floor it makes one there
      const cell = target.kind === "wall" ? target.cell : target.cell;
      const index = (map.chanceWalls ?? []).findIndex((w) => w.cell.x === cell.x && w.cell.y === cell.y);
      if (index >= 0) {
        if (!alt) {
          setSelectedChanceWall(index);
          return;
        }
        result = applyEdit(map.id, (file) => removeChanceWall(file, index));
        setSelectedChanceWall(null);
      } else {
        if (alt) return;
        if (cell.x === pos.x && cell.y === pos.y) {
          pushLog(t("app.wallAtParty"), "editor");
          return;
        }
        const count = map.chanceWalls?.length ?? 0;
        result = applyEdit(map.id, (file) => addChanceWall(file, cell));
        setSelectedChanceWall(count);
      }
    } else {
      const tool: EditTool = alt ? "fill" : editTool;
      if (tool === "dig" && target.kind === "wall" && target.from) {
        const from = target.from;
        result = applyEdit(map.id, (file) => dig(file, target.cell, from));
      } else if (tool === "fill" && target.kind !== "wall") {
        if (target.cell.x === pos.x && target.cell.y === pos.y) {
          pushLog(t("app.fillAtParty"), "editor");
          return;
        }
        result = applyEdit(map.id, (file) => fill(file, target.cell));
      }
    }
    if (!result) return;
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  // The minimap while editing: a click on a cell is a click on that cell's floor
  // or ceiling (as the minimap's toggle says) - or on the wall, for a wall cell
  // (it digs from an open side). So the ceiling and the floor can be reached
  // without looking at them.
  const [miniSurface, setMiniSurface] = useState<"floor" | "ceiling">("floor");
  const onMinimapCell = (cell: Vec2, alt: boolean) => {
    if (cellAt(map, cell.x, cell.y) === "wall") {
      const from = (Object.values(DIR_VECTOR) as { x: number; y: number }[])
        .map((v) => ({ x: cell.x + v.x, y: cell.y + v.y }))
        .find((n) => cellAt(map, n.x, n.y) !== "wall");
      if (from) onEdit({ kind: "wall", cell, from }, alt);
      return;
    }
    onEdit({ kind: miniSurface, cell }, alt);
  };
  // The zoomed minimap (editing, wide screens): a big one fills the left side
  // and a dragged block of cells is a selection - dig, fill, raise or lower
  // the floor or ceiling, or paint the surfaces, all of its cells in one
  // undo step. The 3D view stays on the right, drawing the changes quickly
  // (see GameViewport's applyStructure) and fully a few seconds later.
  // (the chart skips drawing when nothing it shows changed: its click goes through a ref, so it never acts on old state)
  const minimapCell = useRef(onMinimapCell);
  minimapCell.current = onMinimapCell;
  const [miniZoom, setMiniZoom] = useState(false);
  const [miniSel, setMiniSel] = useState<Rect | null>(null);
  // (the minimap block folds away to give the asset tree the column's height)
  const [minimapCollapsed, setMinimapCollapsed] = useState(() => {
    try {
      return localStorage.getItem(MINIMAP_COLLAPSE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const problems = useMemo(()=>editMode ? validateMap(map) : [],[editMode,map]);
  const repairProblems = (code:"inWall"|"duplicate") => {
    const result=applyEdit(map.id,code==="inWall"?removeInWall:removeDuplicates);
    if("error" in result)pushLog(t("app.editorError",{error:result.error}),"error");
    else replaceMap(result.map);
    setEdits(n=>n+1);
  };
  const zoomed = editMode && miniZoom && !compact;
  // Ctrl+C on the block of cells copies everything in it, Ctrl+V pastes it where the pointer is (see editor/useAreaClipboard)
  const areaClip = useAreaClipboard({
    editMode,
    mapId: map.id,
    selection: zoomed ? miniSel : null,
    getFile: () => mapFile(map.id),
    edit: (change) => applyEdit(map.id, change),
    applied: (next) => {
      replaceMap(next);
      setEdits((n) => n + 1);
    },
    log: (text, kind) => pushLog(text, kind),
  });
  const editArea =(message: Key, change: (file: NonNullable<ReturnType<typeof mapFile>>, cells: Vec2[]) => NonNullable<ReturnType<typeof mapFile>>) => {
    if (!miniSel) return;
    const cells = rectCells(miniSel).filter((c) => c.x < map.width && c.y < map.height);
    const result = applyEdit(map.id, (file) => change(file, cells));
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      replaceMap(result.map);
      pushLog(t(message, { count: cells.length }), "editor");
    }
    setEdits((n) => n + 1);
  };
  const openCells = (cells: Vec2[]) => cells.filter((c) => cellAt(map, c.x, c.y) !== "wall");
  const areaDig = () => editArea("app.areaDig", (file, cells) => digCells(file, cells));
  const areaFill = () =>
    editArea("app.areaFill", (file, cells) =>
      fillCells(
        file,
        // (not under the party, nor the deck's start)
        cells.filter((c) => !(c.x === pos.x && c.y === pos.y) && !(c.x === map.start.cell.x && c.y === map.start.cell.y)),
      ),
    );
  const areaHeight = (which: "floor" | "ceiling", step: number) =>
    editArea(`app.area${which}${step > 0 ? "Raised" : "Lowered"}`, (file, cells) => {
      for (const c of openCells(cells)) {
        const floor = floorHeight(map, c.x, c.y);
        const value = Math.round(((which === "floor" ? floor : ceilingHeight(map, c.x, c.y)) + step) * 100) / 100;
        // (a floor of 0 and a ceiling one panel above its floor are the defaults: no need to write them)
        setHeight(file, which, c, which === "floor" ? (value === 0 ? null : value) : value === floor + 1 ? null : value);
      }
      return file;
    });
  const areaPaint = (surface: EditSurface) =>
    editArea(`app.area${surface}Painted`, (file, cells) => {
      const layer: TextureLayer = surface === "wall" ? "wallTexture" : surface === "floor" ? "floorTexture" : "ceilingTexture";
      for (const c of openCells(cells)) paintTexture(file, layer, c, paint[surface]);
      return file;
    });
  // Escape lets go of the selection
  useEffect(() => {
    if (!miniSel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMiniSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [miniSel]);
  // layers hidden from the view while editing (NPCs, particles, props, decals, items)
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<string>>(() => new Set());
  const toggleLayer = (layer: string) =>
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (!next.delete(layer)) next.add(layer);
      return next;
    });
  // layers locked from picking and editing in the view (they stay visible)
  const [lockedLayers, setLockedLayers] = useState<ReadonlySet<string>>(() => new Set());
  const toggleLayerLock = (layer: string) =>
    setLockedLayers((prev) => {
      const next = new Set(prev);
      if (!next.delete(layer)) next.add(layer);
      return next;
    });
  const editUndo = () => {
    const m = undo(map.id);
    if (m) replaceMap(m);
    setEdits((n) => n + 1);
  };
  const editRedo = () => {
    const m = redo(map.id);
    if (m) replaceMap(m);
    setEdits((n) => n + 1);
  };
  const editSave = () => {
    saveMap(map.id)
      .then((file) => pushLog(t("app.savedMap", { path: file }), "success"))
      .catch((err) => pushLog(t("app.saveFailed", { error: err instanceof Error ? err.message : err }), "error"))
      .finally(() => setEdits((n) => n + 1));
  };
  // Tab: the editor on and off; while on, Z / Y undo and redo, Ctrl+S saves
  const editKeys = useRef({ editUndo, editRedo, editSave });
  editKeys.current = { editUndo, editRedo, editSave };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTextEntry(e.target)) return;
      if (e.key === "Tab" && !aimRef.current) {
        e.preventDefault();
        if (e.repeat) return;
        setEditMode((on) => !on);
        return;
      }
      if (!editMode) return;
      const key = e.key.toLowerCase();
      if (key === "?") {
        e.preventDefault();
        if (!e.repeat) setShortcutHelp((open) => !open);
        return;
      }
      if (key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        editKeys.current.editSave();
      } else if (key === "z") editKeys.current.editUndo();
      else if (key === "y") editKeys.current.editRedo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);
  // leaving the editor puts the help away too
  useEffect(() => {
    if (!editMode) setShortcutHelp(false);
  }, [editMode]);

  // The Map tool: the grid grows or shrinks at an edge; other decks are
  // opened, made or copied (the URL's ?map= follows, so a reload stays on
  // the deck)
  const openMap = (to: GameMap) => {
    setSelectedLight(null);
    setSelectedProp(null);
    setSelectedDecal(null);
    enterMap(to);
    const url = new URL(location.href);
    url.searchParams.set("map", to.id);
    history.replaceState(null, "", url);
  };
  // a shared revision from the Map settings picker (guests may open it too)
  const openSharedMap = (head: SharedMapHead) => {
    void loadSharedMap(map.world, head).then(openMap).catch((error) => {
      pushLog(t("app.editorError", { error: error instanceof Error ? error.message : String(error) }), "error");
    });
  };
  const saveRender = (clear = false) => {
    const render = clear ? undefined : pickRender(settings, DEFAULT_SETTINGS);
    // nothing differs from the defaults: say so instead of wiping what the map has
    if (!clear && !render) {
      pushLog(t("app.defaultRender"), "editor");
      return;
    }
    const result = applyEdit(map.id, (file) => {
      if (render) file.render = render;
      else delete file.render;
      return file;
    });
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      replaceMap(result.map);
      // (in dev straight to disk too: it is meant to be kept)
      const note = render ? "renderSaved" : "renderRemoved";
      if (import.meta.env.DEV) {
        saveMap(map.id)
          .then((path) => pushLog(t(`app.${note}File`, { path }), "success"))
          .catch((err) => pushLog(t(`app.${note}Error`, { error: err instanceof Error ? err.message : err }), "error"));
      } else pushLog(t(`app.${note}Download`), "editor");
    }
    if (clear) setSettings((s) => ({ ...s, ...renderDefaults(DEFAULT_SETTINGS) }));
    setEdits((n) => n + 1);
  };
  // one of the map's default texture sets (wall, accent, floor, ceiling, doors...)
  // the decorative fire nearest `at` (cell-relative) in a cell: a torch's flame
  const flameSmokeIndex = (file: Parameters<typeof updateProp>[0], cell: Vec2, at: [number, number, number]) => {
    let best = -1;
    let bestDist = 0.6;
    (file.smokes ?? []).forEach((s, i) => {
      if (!s.fire || !s.decorative || s.x !== cell.x || s.y !== cell.y) return;
      const d = Math.hypot(s.pos[0] - at[0], s.pos[1] - at[1], s.pos[2] - at[2]);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  };
  const changeMapTexture = (slot: string, setId: string | undefined) => {
    const textures: Record<string, string> = { ...(map.textures as Record<string, string> | undefined) };
    if (setId) textures[slot] = setId;
    else delete textures[slot];
    changeMapLook({ textures: Object.keys(textures).length ? textures : undefined } as MapLook);
  };
  // the map's own look (undefined: back to the viewer's default)
  const changeMapLook = (patch: MapLook, merge?: string) => {
    const result = applyEdit(map.id, (file) => Object.assign(file, patch), merge && `map ${Object.keys(patch).join()} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const resize = (edge: Direction, grow: boolean) => {
    const result = applyEdit(map.id, (file) => resizeMap(file, edge, grow));
    if ("error" in result) {
      pushLog(t("app.editorError", { error: result.error }), "error");
      return;
    }
    replaceMap(result.map);
    const shift = grow ? 1 : -1;
    if (edge === "N") shiftParty(0, shift);
    if (edge === "W") shiftParty(shift, 0);
    setSelectedLight(null);
    setSelectedProp(null);
    setSelectedDecal(null);
    setEdits((n) => n + 1);
  };
  // new map / save as / rename: one in-app dialog (place + name; the id is derived)
  const [mapDialog, setMapDialog] = useState<MapDialogMode | null>(null);
  const newMap = () => setMapDialog("new");
  const saveMapAs = () => setMapDialog("saveAs");
  const renameCurrentMap = () => setMapDialog("rename");
  const submitMapDialog = (mode: MapDialogMode, v: MapDialogValues): string | null => {
    if (mode === "rename") {
      const result = renameMap(map.id, v.place, v.name);
      if ("error" in result) return result.error;
      replaceMap(result.map);
      setEdits((n) => n + 1);
      pushLog(t("mapDialog.renamed", { place: v.place, name: v.name }), "editor");
    } else if (mode === "new") {
      const id = deriveMapId(v.place, v.name);
      const like = map.world === v.world ? mapFile(map.id) ?? undefined : undefined;
      const result = createMap(id, blankMap(v.name, map.deck, v.width || 16, v.height || 10, like, v.place), undefined, v.world);
      if ("error" in result) return result.error;
      openMap(result.map);
      pushLog(t("app.mapCreated", { id: id }), "editor");
    } else saveMapAsCopy(v.place, v.name);
    setMapDialog(null);
    return null;
  };
  const saveMapAsCopy = (place: string, name: string) => {
    const id = deriveMapId(place, name);
    const file = structuredClone(mapFile(map.id));
    if (!file) return;
    const { name: _n, place: _p, ...rest } = file;
    const result = createMap(id, { name, place, ...rest }, map.id);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      openMap(result.map);
      // (straight to disk in dev: a copy is meant to be kept)
      if (import.meta.env.DEV) {
        saveMap(id)
          .then((path) => pushLog(t("app.savedMap", { path: path }), "success"))
          .catch((err) => pushLog(t("app.saveFailed", { error: err instanceof Error ? err.message : err }), "error"));
      }
      pushLog(t("app.mapCopied", { source: map.id, id: id }), "editor");
    }
  };

  // The selected actor, as the panel shows it
  const selectedActorInfo: ActorInfo | null = (() => {
    const spec = selectedActor === null ? undefined : map.actors?.[selectedActor];
    return spec
      ? { type: spec.actor, facing: spec.facing, chance: spec.chance ?? 1, route: spec.patrol.length, links: linksOf(spec), wake: spec.wake, friendly: isFriendlySpec(spec), dialogue: spec.dialogue, portrait: spec.portrait, shop: spec.shop, greeting: spec.greeting }
      : null;
  })();
  const changeActor = (patch: Parameters<typeof updateActor>[2], merge?: string) => {
    if (selectedActor === null) return;
    remember("actor", patch);
    const index = selectedActor;
    const result = applyEdit(map.id, (file) => updateActor(file, index, patch), merge && `actor ${index} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteActor = () => {
    if (selectedActor === null) return;
    const index = selectedActor;
    const result = applyEdit(map.id, (file) => removeActor(file, index));
    if (!("error" in result)) replaceMap(result.map);
    setSelectedActor(null);
    setEdits((n) => n + 1);
  };

  // The selected door, as the panel shows it
  const selectedDoorInfo: DoorInfo | null = (() => {
    if (!selectedDoor || cellAt(map, selectedDoor.x, selectedDoor.y) !== "door") return null;
    const spec = doorAt(map, selectedDoor.x, selectedDoor.y);
    return {
      offset: spec.offset ?? 0,
      facing: spec.facing,
      kind: spec.kind,
      type: spec.type,
      leafTexture: spec.leafTexture,
      frameTexture: spec.frameTexture,
      label: spec.label ?? "",
      chance: spec.chance ?? 1,
      links: linksOf(spec),
      lock: spec.lock,
    };
  })();
  const changeDoor = (patch: { kind?: "standard" | "lift"; type?: string; leafTexture?: string; frameTexture?: string; offset?: number; facing?: Direction; label?: string; chance?: number; lock?: Lock } & Linked, merge?: string) => {
    if (!selectedDoor) return;
    const cell = selectedDoor;
    const spec = doorAt(map, cell.x, cell.y);
    const base = { kind: spec.kind, facing: spec.facing };
    const result = applyEdit(map.id, (file) => updateDoor(file, cell, base, patch), merge && `door ${cell.x},${cell.y} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteDoor = () => {
    if (!selectedDoor) return;
    const cell = selectedDoor;
    const result = applyEdit(map.id, (file) => toggleDoor(file, cell));
    if (!("error" in result)) replaceMap(result.map);
    setSelectedDoor(null);
    setEdits((n) => n + 1);
  };
  // the selected door: the arrows move it along its passage, as the party
  // sees it (0.02 cells a press, Shift: 0.1), up to flush with an edge;
  // Delete turns it back into floor
  const doorKeys = useRef({ changeDoor, deleteDoor, info: selectedDoorInfo });
  doorKeys.current = { changeDoor, deleteDoor, info: selectedDoorInfo };
  useEffect(() => {
    if (!editMode || editTool !== "door") return;
    function onKey(e: KeyboardEvent) {
      const { changeDoor: change, deleteDoor: remove, info } = doorKeys.current;
      if (!info) return;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Delete") {
        stop();
        remove();
        return;
      }
      const ahead = DIR_VECTOR[facingRef.current];
      const right = DIR_VECTOR[rightOf(facingRef.current)];
      const moves: Record<string, Vec2> = {
        ArrowUp: ahead,
        ArrowDown: { x: -ahead.x, y: -ahead.y },
        ArrowRight: right,
        ArrowLeft: { x: -right.x, y: -right.y },
      };
      const m = moves[e.key];
      if (!m) return;
      stop();
      // how much of that way runs along the door's front
      const v = DIR_VECTOR[info.facing];
      const along = m.x * v.x + m.y * v.y;
      if (!along) return;
      const step = (e.shiftKey ? 0.1 : 0.02) * along;
      const offset = Math.round(Math.min(DOOR_EDGE_OFFSET, Math.max(-DOOR_EDGE_OFFSET, info.offset + step)) * 100) / 100;
      change({ offset: offset || undefined }, "offset");
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, editTool]);

  // The selected decal, as the panel shows it
  const selectedSmokeSpec = selectedSmoke === null ? undefined : map.smokes?.[selectedSmoke];
  const selectedSmokeInfo: SmokeInfo | null = selectedSmokeSpec
    ? {
        effect: selectedSmokeSpec.effect,
        mistStyle: selectedSmokeSpec.mistStyle,
        sprite: selectedSmokeSpec.sprite,
        spread: selectedSmokeSpec.spread,
        effectHeight: selectedSmokeSpec.height,
        density: selectedSmokeSpec.density ?? 1,
        size: selectedSmokeSpec.size ?? 1,
        color: selectedSmokeSpec.color ?? "#b4b8bc",
        height: selectedSmokeSpec.pos[1],
        roomHeight:
          ceilingHeight(map, selectedSmokeSpec.cell.x, selectedSmokeSpec.cell.y) - floorHeight(map, selectedSmokeSpec.cell.x, selectedSmokeSpec.cell.y),
        blow: { speed: selectedSmokeSpec.blow?.speed ?? 0, yaw: selectedSmokeSpec.blow?.yaw ?? 0, pitch: selectedSmokeSpec.blow?.pitch ?? 0 },
        fire: !!selectedSmokeSpec.fire,
        lightColor: `#${fireLightColor(selectedSmokeSpec).toString(16).padStart(6, "0")}`,
        lightIntensity: selectedSmokeSpec.lightIntensity ?? 1,
        lightReach: selectedSmokeSpec.lightReach ?? 1,
        decorative: !!selectedSmokeSpec.decorative,
        opacity: selectedSmokeSpec.opacity ?? 1,
        opacityDark: selectedSmokeSpec.opacityDark ?? 0.3,
        petals: !!selectedSmokeSpec.petals,
        chance: selectedSmokeSpec.chance ?? 1,
        links: linksOf(selectedSmokeSpec),
      }
    : null;
  // (a `pos` patch with NaN parts keeps the emitter's own there: the
  // panel's Height slider moves it up and down only)
  const changeSmoke = (patch: Parameters<typeof updateSmoke>[2], merge?: string) => {
    if (selectedSmoke === null || !selectedSmokeSpec) return;
    remember("smoke", patch);
    const index = selectedSmoke;
    const own = selectedSmokeSpec.pos;
    const fixed = patch.pos ? { ...patch, pos: patch.pos.map((v, i) => (Number.isNaN(v) ? own[i] : v)) as [number, number, number] } : patch;
    const result = applyEdit(map.id, (file) => updateSmoke(file, index, fixed), merge && `smoke ${index} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteSmoke = () => {
    if (selectedSmoke === null) return;
    const index = selectedSmoke;
    const result = applyEdit(map.id, (file) => removeSmoke(file, index));
    if (!("error" in result)) replaceMap(result.map);
    setSelectedSmoke(null);
    setEdits((n) => n + 1);
  };
  // the selected emitter: arrows move it (as the party sees it), Page Up /
  // Page Down raise and lower it, Delete takes it out
  const smokeKeys = useRef({ selectedSmokeInfo, selectedSmokeSpec, changeSmoke, deleteSmoke });
  smokeKeys.current = { selectedSmokeInfo, selectedSmokeSpec, changeSmoke, deleteSmoke };
  useEffect(() => {
    if (!editMode || keyTool !== "smoke") return;
    function onKey(e: KeyboardEvent) {
      const { selectedSmokeInfo: info, selectedSmokeSpec: spec, changeSmoke: change, deleteSmoke: remove } = smokeKeys.current;
      if (!info || !spec) return;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Delete") {
        stop();
        remove();
        return;
      }
      const step = e.shiftKey ? 0.2 : 0.05;
      const ahead = DIR_VECTOR[facingRef.current];
      const right = DIR_VECTOR[rightOf(facingRef.current)];
      const move: Record<string, [number, number, number]> = {
        ArrowLeft: [-right.x * step, 0, -right.y * step],
        ArrowRight: [right.x * step, 0, right.y * step],
        ArrowUp: [ahead.x * step, 0, ahead.y * step],
        ArrowDown: [-ahead.x * step, 0, -ahead.y * step],
        PageUp: [0, step, 0],
        PageDown: [0, -step, 0],
      };
      const d = move[e.key];
      if (!d) return;
      stop();
      const [x, y, z] = spec.pos;
      const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
      change({ pos: [clamp(x + d[0], -0.5, 0.5), clamp(y + d[1], 0, info.roomHeight - 0.05), clamp(z + d[2], -0.5, 0.5)] }, "pos");
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, keyTool]);

  // the Exit tool's pick (its cell)
  const [selectedExit, setSelectedExit] = useState<Vec2 | null>(null);
  const selectedExitSpec = selectedExit && (map.exits ?? []).find((e) => e.cell.x === selectedExit.x && e.cell.y === selectedExit.y);
  const selectedExitInfo = selectedExitSpec ? { name: selectedExitSpec.name ?? "", to: selectedExitSpec.to } : null;
  // the Stairs tool's pick (its cell)
  const [selectedStairs, setSelectedStairs] = useState<Vec2 | null>(null);
  const selectedStairsSpec = selectedStairs && (map.stairs ?? []).find((s) => s.cell.x === selectedStairs.x && s.cell.y === selectedStairs.y);
  const selectedStairsInfo = selectedStairsSpec ? { direction: selectedStairsSpec.direction, style: selectedStairsSpec.style ?? "straight" as const, name: selectedStairsSpec.name ?? "", to: selectedStairsSpec.to } : null;
  // the Item tool: the palette's item (the pick is further up)
  const [itemChoice, setItemChoice] = useState(Object.keys(ITEM_TYPES)[0]);
  const selectedItemInfo: ItemInfo | null = (() => {
    const spec = selectedItem === null ? undefined : map.items?.[selectedItem];
    if (!spec) return null;
    return {
      item: spec.item,
      count: spec.count ?? 1,
      elevation: spec.elevation ?? 0,
      roomHeight: ceilingHeight(map, spec.cell.x, spec.cell.y) - floorHeight(map, spec.cell.x, spec.cell.y),
      chance: spec.chance ?? 1,
      links: linksOf(spec),
      name: spec.name,
      sets: spec.sets,
    };
  })();
  const changeItem = (patch: Parameters<typeof updateItem>[2], merge?: string) => {
    if (selectedItem === null) return;
    remember("item", patch);
    const index = selectedItem;
    const result = applyEdit(map.id, (file) => updateItem(file, index, patch), merge && `item ${index} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteItem = () => {
    if (selectedItem === null) return;
    const index = selectedItem;
    const result = applyEdit(map.id, (file) => removeItem(file, index));
    if (!("error" in result)) replaceMap(result.map);
    setSelectedItem(null);
    setEdits((n) => n + 1);
  };
  // the selected item: arrows nudge it (as the party sees it), Page Up /
  // Page Down raise and lower it, Delete takes it out
  const itemKeys = useRef({ selectedItemInfo, changeItem, deleteItem, items: map.items, selectedItem });
  itemKeys.current = { selectedItemInfo, changeItem, deleteItem, items: map.items, selectedItem };
  useEffect(() => {
    if (!editMode || keyTool !== "item") return;
    function onKey(e: KeyboardEvent) {
      const { selectedItemInfo: info, changeItem: change, deleteItem: remove, items, selectedItem: index } = itemKeys.current;
      const spec = index === null ? undefined : items?.[index];
      if (!info || !spec) return;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Delete") {
        stop();
        remove();
        return;
      }
      const step = e.shiftKey ? 0.1 : 0.03;
      const ahead = DIR_VECTOR[facingRef.current];
      const right = DIR_VECTOR[rightOf(facingRef.current)];
      const round = (v: number) => Math.round(v * 100) / 100;
      const [ox, oz] = spec.offset ?? itemSpot(undefined, index!);
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-right.x, -right.y],
        ArrowRight: [right.x, right.y],
        ArrowUp: [ahead.x, ahead.y],
        ArrowDown: [-ahead.x, -ahead.y],
      };
      if (nudge[e.key]) {
        stop();
        const [dx, dz] = nudge[e.key];
        const clamp = (v: number) => round(Math.min(0.45, Math.max(-0.45, v)));
        change({ offset: [clamp(ox + dx * step), clamp(oz + dz * step)] }, "offset");
      } else if (e.key === "PageUp" || e.key === "PageDown") {
        stop();
        const up = (e.key === "PageUp" ? 1 : -1) * (e.shiftKey ? 0.1 : 0.02);
        const elevation = round(Math.min(info.roomHeight - 0.05, Math.max(0, info.elevation + up)));
        change({ elevation: elevation || undefined }, "elevation");
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, keyTool]);

  // the Chance wall tool's pick (its index in the map's chanceWalls)
  const [selectedChanceWall, setSelectedChanceWall] = useState<number | null>(null);
  const selectedChanceWallInfo = (() => {
    const wall = selectedChanceWall === null ? undefined : map.chanceWalls?.[selectedChanceWall];
    return wall ? { chance: wall.chance ?? 1, links: linksOf(wall) } : null;
  })();
  const changeChanceWall = (patch: { chance?: number } & Linked, merge = "") => {
    if (selectedChanceWall === null) return;
    const index = selectedChanceWall;
    const result = applyEdit(map.id, (file) => updateChanceWall(file, index, patch), `wall ${index} ${Object.keys(patch).join()} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  // every name items go by in the map (see Linked)
  const linkIds = [
    ...new Set(
      [map.props, map.decals, map.actors, map.lights, map.doors, map.chanceWalls].flatMap((items) =>
        (items ?? []).flatMap((i: Linked) => (i.id ? [i.id] : [])),
      ),
    ),
  ].sort();

  const selectedDecalInfo: DecalInfo | null = (() => {
    const spec = selectedDecal === null ? undefined : map.decals?.[selectedDecal];
    return spec
      ? { name: spec.decal, rotation: spec.rotation ?? 0, scale: spec.scale ?? 1, action: spec.action, chance: spec.chance ?? 1, links: linksOf(spec), operable: decalOperableInfo(spec, selectedDecal!) }
      : null;
  })();
  const changeDecal = (patch: Parameters<typeof updateDecal>[2], merge?: string) => {
    if (selectedDecal === null) return;
    const index = selectedDecal;
    const result = applyEdit(map.id, (file) => updateDecal(file, index, patch), merge && `decal ${index} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteDecal = () => {
    if (selectedDecal === null) return;
    const index = selectedDecal;
    const result = applyEdit(map.id, (file) => removeDecal(file, index));
    if (!("error" in result)) replaceMap(result.map);
    setSelectedDecal(null);
    setEdits((n) => n + 1);
  };
  // the selected decal: arrows move it over its surface (4 pixels, Shift:
  // 16 - as seen looking at it; a floor's top is north), R turns it 90
  // degrees (Shift+R: 15), Delete takes it off; with none selected, R turns
  // the next one
  const decalKeys = useRef({ changeDecal, deleteDecal, decals: map.decals, selectedDecal });
  decalKeys.current = { changeDecal, deleteDecal, decals: map.decals, selectedDecal };
  useEffect(() => {
    if (!editMode || keyTool !== "decal") return;
    function onKey(e: KeyboardEvent) {
      const { changeDecal: change, deleteDecal: remove, decals, selectedDecal: index } = decalKeys.current;
      const spec = index === null ? undefined : decals?.[index];
      const turn = e.key === "r" || e.key === "R";
      if (!spec) {
        if (turn) setDecalRotation((r) => (r + (e.shiftKey ? 15 : 90)) % 360);
        return;
      }
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Delete") {
        stop();
        remove();
      } else if (turn) {
        stop();
        change({ rotation: ((spec.rotation ?? 0) + (e.shiftKey ? 15 : 90)) % 360 || undefined });
      } else {
        const step = e.shiftKey ? 16 : 4;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const d = move[e.key];
        if (!d) return;
        stop();
        change({ px: spec.x + d[0], py: spec.y + d[1] }, "move");
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, keyTool]);

  // The selected prop, as the panel shows it
  const selectedPropInfo: PropInfo | null = (() => {
    const spec = selectedProp === null ? undefined : map.props?.[selectedProp];
    if (!spec) return null;
    const type = PROP_TYPES[spec.prop];
    return {
      name: spec.prop,
      texture: spec.texture,
      retexturable: !!type && propRetexturable(type),
      links: linksOf(spec),
      rotation: spec.rotation ?? 0,
      scale: spec.scale ?? 1,
      elevation: spec.elevation ?? 0,
      chance: spec.chance ?? 1,
      roomHeight: ceilingHeight(map, spec.cell.x, spec.cell.y) - floorHeight(map, spec.cell.x, spec.cell.y),
      // where a prop stacked on it stands: on its top
      top: (spec.elevation ?? 0) + (type?.size[1] ?? 0),
      auto: spec.auto ? { group: spec.auto, detached: !!spec.detached } : undefined,
      fence: fenceFormOf(spec.prop) ? { form: fenceFormOf(spec.prop)!, style: cleanFenceStyle(spec.fence) ?? {}, side: isSide(spec.at) ? spec.at : "N" } : undefined,
      operable: operableInfo(spec, selectedProp!),
    };
  })();
  const changeProp = (patch: Parameters<typeof updateProp>[2], merge?: string) => {
    if (selectedProp === null) return;
    // (a fence's texture is its own: the next crate does not wear it)
    if (!fenceFormOf(map.props?.[selectedProp]?.prop ?? "")) remember("prop", patch);
    const index = selectedProp;
    const result = applyEdit(
      map.id,
      (file) => {
        // (a torch's flame moves with it)
        const before = file.props?.[index];
        const was = before && flamePosition({ ...before, cell: { x: before.x, y: before.y } } as PropSpec);
        const found = was && before ? flameSmokeIndex(file, { x: before.x, y: before.y }, was) : -1;
        updateProp(file, index, patch);
        const after = file.props?.[index];
        const now = after && flamePosition({ ...after, cell: { x: after.x, y: after.y } } as PropSpec);
        if (found >= 0 && now && file.smokes) file.smokes[found] = { ...file.smokes[found], pos: now };
        return file;
      },
      merge && `prop ${index} ${merge}`,
    );
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteProp = () => {
    if (selectedProp === null) return;
    const index = selectedProp;
    const result = applyEdit(map.id, (file) => {
      const gone = file.props?.[index];
      const at = gone && flamePosition({ ...gone, cell: { x: gone.x, y: gone.y } } as PropSpec);
      const found = at && gone ? flameSmokeIndex(file, { x: gone.x, y: gone.y }, at) : -1;
      if (found >= 0) removeSmoke(file, found);
      return removePropIndex(file, index);
    });
    if (!("error" in result)) replaceMap(result.map);
    setSelectedProp(null);
    setEdits((n) => n + 1);
  };
  // the selected roof piece of the Roof tool: detached from the autotile (it keeps what it is set to)
  // or given back to it
  const roofDetach = (detached: boolean) => {
    if (selectedProp === null) return;
    const index = selectedProp;
    const result = applyEdit(map.id, (file) => setRoofDetached(file, index, detached));
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  // the whole roof the selected piece belongs to, taken away (one undo step)
  const roofRemove = () => {
    const group = selectedProp === null ? undefined : map.props?.[selectedProp]?.auto;
    if (!group) return;
    const result = applyEdit(map.id, (file) => eraseRoofGroup(file, group));
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      replaceMap(result.map);
      pushLog(t("roofauto.erasedRoof", { group }), "editor");
    }
    setSelectedProp(null);
    setEdits((n) => n + 1);
  };
  // the whole run of fence pieces the selected one is part of, taken away (one undo step)
  const fenceRemoveRun = () => {
    if (selectedProp === null) return;
    const index = selectedProp;
    const result = applyEdit(map.id, (file) => {
      const run = new Set(fenceRun(file, index));
      file.props = (file.props ?? []).filter((_, i) => !run.has(i));
      if (!file.props.length) delete file.props;
      return file;
    });
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setSelectedProp(null);
    setEdits((n) => n + 1);
  };
  // the palette's prop on top of the selected one (and picked)
  const stackProp = () => {
    const spec = selectedProp === null ? undefined : map.props?.[selectedProp];
    if (!spec || !selectedPropInfo) return;
    const count = map.props?.length ?? 0;
    const result = applyEdit(map.id, (file) =>
      addProp(file, propChoice, spec.cell, spec.at, propRotation, {
        ...(spec.offset ? { offset: spec.offset } : {}),
        elevation: Math.round(selectedPropInfo.top * 100) / 100,
      }),
    );
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else {
      replaceMap(result.map);
      setSelectedProp(count);
    }
    setEdits((n) => n + 1);
  };
  // the selected prop: arrows nudge it (as the party sees it), Page Up /
  // Page Down raise and lower it, R turns it 90 degrees (Shift+R: 15),
  // Delete takes it out
  const propKeys = useRef({ selectedPropInfo, changeProp, deleteProp, props: map.props, selectedProp });
  propKeys.current = { selectedPropInfo, changeProp, deleteProp, props: map.props, selectedProp };
  useEffect(() => {
    if (!editMode || keyTool !== "prop") return;
    function onKey(e: KeyboardEvent) {
      const { selectedPropInfo: info, changeProp: change, deleteProp: remove, props, selectedProp: index } = propKeys.current;
      const spec = index === null ? undefined : props?.[index];
      if (!info || !spec) return;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Delete") {
        stop();
        remove();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        stop();
        change({ rotation: ((spec.rotation ?? 0) + (e.shiftKey ? 15 : 90)) % 360 || undefined });
        return;
      }
      const step = 0.05;
      const ahead = DIR_VECTOR[facingRef.current];
      const right = DIR_VECTOR[rightOf(facingRef.current)];
      const round = (v: number) => Math.round(v * 100) / 100;
      const [ox, oz] = spec.offset ?? [0, 0];
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-right.x, -right.y],
        ArrowRight: [right.x, right.y],
        ArrowUp: [ahead.x, ahead.y],
        ArrowDown: [-ahead.x, -ahead.y],
      };
      if (nudge[e.key]) {
        stop();
        const [dx, dz] = nudge[e.key];
        const clamp = (v: number) => round(Math.min(0.45, Math.max(-0.45, v)));
        const offset: [number, number] = [clamp(ox + dx * step), clamp(oz + dz * step)];
        change({ offset: offset[0] || offset[1] ? offset : undefined }, "offset");
      } else if (e.key === "PageUp" || e.key === "PageDown") {
        stop();
        const up = e.key === "PageUp" ? step : -step;
        const elevation = round(Math.min(info.roomHeight - 0.05, Math.max(-0.5, info.elevation + up)));
        change({ elevation: elevation || undefined }, "elevation");
      }
    }
    // before the movement keys' handlers (and the next prop's R)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, keyTool]);

  // The selected light, as the panel shows it: its own settings, or the
  // values it's lit with where it has none (see lights.ts)
  const selectedLightInfo: LightInfo | null = (() => {
    const own = selectedLight === null ? undefined : map.lights?.[selectedLight];
    const lit = own && generateLights(map).find((l) => l.source === selectedLight);
    if (!own || !lit) return null;
    return {
      color: `#${lit.color.toString(16).padStart(6, "0")}`,
      intensity: lit.intensity,
      range: lit.range,
      pos: own.pos,
      bulb: own.bulb,
      chance: own.chance ?? 1,
      effect: own.effect,
      links: linksOf(own),
      roomHeight: ceilingHeight(map, own.x, own.y) - floorHeight(map, own.x, own.y),
    };
  })();
  // a change from the panel (a slider dragged: one undo step per setting)
  const changeLight = (patch: Partial<MapLight>, merge = "") => {
    if (selectedLight === null) return;
    remember("light", patch);
    const index = selectedLight;
    const result = applyEdit(map.id, (file) => updateLight(file, index, patch), `light ${index} ${Object.keys(patch).join()} ${merge}`);
    if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteLight = () => {
    if (selectedLight === null) return;
    const index = selectedLight;
    const result = applyEdit(map.id, (file) => removeLight(file, index));
    if (!("error" in result)) replaceMap(result.map);
    setSelectedLight(null);
    setEdits((n) => n + 1);
  };
  // the selected free-standing light moves with the arrow keys (across the
  // cell, in 0.05 steps) and Page Up / Page Down (height) - instead of the
  // party; Delete removes the selected light
  const facingRef = useRef(dir);
  facingRef.current = dir;
  // Choosing a tool lets go of what was selected (a light or a prop left selected while other kinds
  // of thing are picked is just in the way): the inspector then shows the new thing's settings.
  const chooseTool = (tool: EditTool) => {
    setEventTarget(null);
    setSelectedProp(null);
    setSelectedDecal(null);
    setSelectedItem(null);
    setSelectedLight(null);
    setSelectedActor(null);
    setSelectedSmoke(null);
    setSelectedExit(null);
    setSelectedStairs(null);
    setSelectedChanceWall(null);
    setSelectedDoor(null);
    setEditTool(tool);
  };
  const editInteraction = (target: InteractionTarget, event?: Interaction, merge?: string) => {
    const result = applyEdit(map.id, file => setInteraction(file, map, target, event), merge && `event ${JSON.stringify(target)} ${merge}`);
    if ("error" in result) {
      pushLog(t("app.editorError", { error: result.error }), "error");
      return false;
    }
    replaceMap(result.map);
    setEdits(n => n + 1);
    return true;
  };
  const selectEventTarget = (target: InteractionTarget | null, remove: boolean) => {
    if (!target) {
      setEventTarget(null);
      return;
    }
    const existing = interactionAt(map, target);
    if (remove) {
      if (existing && editInteraction(target)) setEventTarget(null);
      return;
    }
    const event: Interaction = existing ?? (eventKind === "image"
      ? { kind: "image", text: "" }
      : eventKind === "shop"
      ? { kind: "shop", shop: [...getShopIds()].sort()[0] ?? "" }
      : { kind: "message", text: "", modal: false, position: "center" });
    if (existing || editInteraction(target, event)) {
      if (editTool !== "event") chooseTool("event");
      setEventKind(event.kind);
      setEventTarget(target);
    }
  };
  // Delete takes the selected event out (the same edit as the Remove button, so one undo brings it back)
  const eventKeys = useRef({ eventTarget, remove: () => {}, removeLink: undefined as (() => void) | undefined });
  // (a selected gate or staircase goes the same way: Delete is the panel's Remove button)
  const removeLink = selectedExit
    ? () => {
      const cell = selectedExit;
      const result = applyEdit(map.id, (file) => toggleExit(file, cell));
      if (!("error" in result)) replaceMap(result.map);
      setSelectedExit(null);
      setEdits((n) => n + 1);
    }
    : selectedStairs
      ? () => {
        const cell = selectedStairs;
        const result = applyEdit(map.id, (file) => toggleStairs(file, cell));
        if (!("error" in result)) replaceMap(result.map);
        setSelectedStairs(null);
        setEdits((n) => n + 1);
      }
      : undefined;
  eventKeys.current = {
    removeLink,
    eventTarget,
    remove: () => { if (eventTarget && editInteraction(eventTarget)) setEventTarget(null); },
  };
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const { eventTarget: target, remove, removeLink: link } = eventKeys.current;
      if (!target && !link) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (target) remove();
      else link?.();
    };
    // before the other keys' handlers
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode]);
  // The editor opens with Select; Esc (a click on empty space too) returns to it, V picks it; Alt held acts as it
  useEffect(() => {
    if (editMode) chooseTool("select");
    else setAltHeld(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return;
      if (e.key === "Alt") {
        // (the browser's own menu bar takes the key otherwise)
        e.preventDefault();
        setAltHeld(true);
      } else if (e.ctrlKey || e.metaKey || e.altKey || shortcutHelp) return;
      else if (e.key === "Escape") {
        if (editTool !== "select") chooseTool("select");
        else selectOnly(null);
      } else if (e.key === "v" || e.key === "V") chooseTool("select");
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, editTool, shortcutHelp]);
  // Step 2 bridge: observe the existing independent selections without changing
  // their owners. Only a newly selected value wins; clearing it shows Map settings.
  const inspectorPicks = {prop:selectedProp, decal:selectedDecal, item:selectedItem,
    light:selectedLight, actor:selectedActor, smoke:selectedSmoke, exit:selectedExit, stairs:selectedStairs,
    chanceWall:selectedChanceWall, door:selectedDoor};
  const inspectorSelection = useRef<{map:string; picks:typeof inspectorPicks; kind:InspectedKind|null}>({map:map.id,picks:inspectorPicks,kind:null});
  const previousInspector = inspectorSelection.current;
  let inspectedKind = previousInspector.map === map.id ? previousInspector.kind : null;
  for (const kind of Object.keys(inspectorPicks) as InspectedKind[]) {
    const next=inspectorPicks[kind], previous=previousInspector.picks[kind];
    const same=typeof next === "object" && next && typeof previous === "object" && previous
      ? next.x===previous.x && next.y===previous.y : next===previous;
    if (next!==null && !same) inspectedKind=kind;
  }
  if (inspectedKind && inspectorPicks[inspectedKind]===null) inspectedKind=null;
  inspectorSelection.current={map:map.id,picks:inspectorPicks,kind:inspectedKind};
  const inspectedCells = {prop:selectedProp===null?undefined:map.props?.[selectedProp]?.cell,
    decal:selectedDecal===null?undefined:map.decals?.[selectedDecal]?.cell,
    item:selectedItem===null?undefined:map.items?.[selectedItem]?.cell,
    light:selectedLight===null?undefined:map.lights?.[selectedLight],
    actor:selectedActor===null?undefined:map.actors?.[selectedActor]?.cell,
    smoke:selectedSmokeSpec?.cell, exit:selectedExit??undefined, stairs:selectedStairs??undefined,
    chanceWall:selectedChanceWall===null?undefined:map.chanceWalls?.[selectedChanceWall]?.cell,
    door:selectedDoor??undefined};
  // Where a tool puts things in and nothing is selected, the inspector shows the settings the next one gets (a kind
  // of fog or fire, a light's colour...): changing them changes the template, the click puts the thing in.
  const placingKind: "smoke" | "light" | null = editMode && !inspectedKind ? (editTool === "smoke" ? "smoke" : editTool === "light" ? "light" : null) : null;
  const smokeTemplate = templates.current.smoke as Partial<NonNullable<GameMap["smokes"]>[number]>;
  const smokeTemplateInfo: SmokeInfo = {
    effect: smokeTemplate.effect,
    mistStyle: smokeTemplate.mistStyle,
    sprite: smokeTemplate.sprite,
    spread: smokeTemplate.spread,
    effectHeight: smokeTemplate.height,
    density: smokeTemplate.density ?? 1,
    size: smokeTemplate.size ?? 1,
    color: smokeTemplate.color ?? "#b4b8bc",
    height: 0.5,
    roomHeight: 1,
    blow: { speed: smokeTemplate.blow?.speed ?? 0, yaw: smokeTemplate.blow?.yaw ?? 0, pitch: smokeTemplate.blow?.pitch ?? 0 },
    fire: false,
    lightColor: `#${fireLightColor(smokeTemplate).toString(16).padStart(6, "0")}`,
    lightIntensity: smokeTemplate.lightIntensity ?? 1,
    lightReach: smokeTemplate.lightReach ?? 1,
    decorative: !!smokeTemplate.decorative,
    opacity: smokeTemplate.opacity ?? 1,
    opacityDark: smokeTemplate.opacityDark ?? 0.3,
    petals: false,
    chance: smokeTemplate.chance ?? 1,
    links: {},
  };
  const lightTemplate = templates.current.light as Partial<MapLight>;
  const lightTemplateInfo: LightInfo = {
    color: lightTemplate.color ?? "#ffe9c0",
    intensity: lightTemplate.intensity ?? 1,
    range: lightTemplate.range ?? 4,
    bulb: lightTemplate.bulb,
    chance: lightTemplate.chance ?? 1,
    effect: lightTemplate.effect,
    links: {},
    roomHeight: 1,
  };
  const inspected=placingKind ? {kind:placingKind,placing:true as const} : inspectedKind ? {kind:inspectedKind,cell:inspectedCells[inspectedKind]} : null;

  const lightKeys = useRef({ selectedLightInfo, changeLight, deleteLight });
  lightKeys.current = { selectedLightInfo, changeLight, deleteLight };
  useEffect(() => {
    if (!editMode || keyTool !== "light") return;
    function onKey(e: KeyboardEvent) {
      const { selectedLightInfo: info, changeLight: change, deleteLight: remove } = lightKeys.current;
      if (!info) return;
      if (e.key === "Delete") {
        e.preventDefault();
        e.stopImmediatePropagation();
        remove();
        return;
      }
      if (!info.pos) return;
      // as seen by the party: up is away, right is to its right
      const step = 0.05;
      const ahead = DIR_VECTOR[facingRef.current];
      const right = DIR_VECTOR[rightOf(facingRef.current)];
      const move: Record<string, [number, number, number]> = {
        ArrowLeft: [-right.x * step, 0, -right.y * step],
        ArrowRight: [right.x * step, 0, right.y * step],
        ArrowUp: [ahead.x * step, 0, ahead.y * step],
        ArrowDown: [-ahead.x * step, 0, -ahead.y * step],
        PageUp: [0, step, 0],
        PageDown: [0, -step, 0],
      };
      const d = move[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const [x, y, z] = info.pos;
      const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
      // (through a wall, too: a light behind a window's glass shines in
      // without a highlight on it)
      change({ pos: [clamp(x + d[0], -0.75, 0.75), clamp(y + d[1], 0.05, info.roomHeight - 0.05), clamp(z + d[2], -0.75, 0.75)] });
    }
    // before the movement keys' handlers
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, keyTool]);

  // R: the Prop tool turns the next prop by 90 degrees
  useEffect(() => {
    if (!editMode || editTool !== "prop") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R") setPropRotation((r) => (r + 90) % 360);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, editTool]);

  // L: the headlamp
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "l" || e.key === "L") {
        // in the editor the lamp is its own switch (on by default); the game's setting stays as it was
        if (editMode) setEditLamp((on) => !on);
        else setSettings((s) => ({ ...s, headlamp: !s.headlamp }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  // 1-4: the use of what a crewmate holds in the right hand (the weapon,
  // see combat.ts; aiming needs the pointer); with Shift: the left hand
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = /^Digit[1-9]$/.test(e.code) ? Number(e.code.slice(5)) : NaN;
      if (n >= 1 && n <= crew.length && !aim && !editMode && !activeInteractionRef.current) {
        if (document.pointerLockElement) document.exitPointerLock();
        activateHand(n - 1, e.shiftKey ? LEFT : RIGHT);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crew.length, aim, activateHand, editMode]);
  // a click on a crewmate's hand box: use what it holds (false: not now, the box shows what it is)
  const onUseHand = (index: number, hand: HandIndex): boolean => {
    if (editMode || activeInteractionRef.current || inventoryShown) return false;
    if (document.pointerLockElement) document.exitPointerLock();
    return activateHand(index, hand);
  };

  // the inventory (I, or the Inventory action; the panel closes itself on I and Esc)
  const toggleInventory = () => setInventoryOpen((o) => !o && phase === "run" && !activeInteractionRef.current);

  // Use (Space or Enter) works in both movement modes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editMode || runEnd || isTextEntry(e.target)) return;
      if ((e.key === " " || e.key === "Enter") && !aimRef.current && !e.repeat) use();
      if ((e.key === "i" || e.key === "I") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !aimRef.current) toggleInventory();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use, editMode, runEnd, phase]);

  const viewport = (
    <GameViewport
      onTopdownExit={placePartyAt}
      map={map}
      pos={pos}
      dir={dir}
      elevation={elevation}
      openDoors={openDoors}
      ride={ride}
      transit={transit}
      actors={actors}
      aiming={aimWeapon}
      downAt={wipedAt}
      shipAccent={editMode ? null : accentOf(seed)}
      aimFrameRef={aimFrameRef}
      aimFocusRef={aimFocusRef}
      partyCoverRef={partyCoverRef}
      onTouch={touch}
      onInteraction={openInteraction}
      onEditInteraction={selectEventTarget}
      interactionUseRef={interactionUseRef}
      interactionOpen={!!activeInteraction || inventoryShown}
      editMode={editMode}
      hiddenLayers={hiddenLayers}
      lockedLayers={lockedLayers}
      editTool={altHeld && editMode ? "select" : editTool}
      onEdit={onEdit}
      onEditPaint={(target, stroke) => (areaClip.pasting ? undefined : editTool === "roofauto" ? roofPaint(target, stroke) : fencePaint(target, stroke))}
      selectedEvent={editMode && eventTarget && interactionAt(map, eventTarget) ? eventTarget : null}
      selectedLight={selectedLightInfo ? selectedLight : null}
      selectedProp={selectedPropInfo ? selectedProp : null}
      selectedItem={selectedItemInfo ? selectedItem : null}
      selectedSmoke={selectedSmokeInfo ? selectedSmoke : null}
      selectedDecal={selectedDecalInfo ? selectedDecal : null}
      selectedDoor={selectedDoorInfo ? selectedDoor : null}
      selectedLink={selectedExitSpec ? selectedExit : selectedStairsSpec ? selectedStairs : null}
      selectedActor={selectedActorInfo ? selectedActor : null}
      onEditHover={onEditHover}
      areaGhost={areaClip.size}
      onEditDrag={onEditDrag}
      onEditAdjust={onEditAdjust}
      onReady={(id) => { sceneReady(id); autoSharedSceneReady(); }}
      freeTick={grid ? undefined : free.tick}
      peekRef={view.peekRef}
      settings={viewSettings}
      onStats={setStats}
      lootedProps={lootedProps}
      takenItems={takenItems}
      spills={spills}
    />
  );
  const viewInput = view.handlers;
  // over the view: the aiming overlay, and a red flash when the crew is hit
  // the crew brought back for the next run: the downed as clones (a medkit
  // each - the haul's own count, if it comes home - else credits)
  const down = crew.filter((c) => c.hp <= 0).length;
  const homeStash = { ...meta.stash };
  if (!wipedAt) for (const [item, count] of Object.entries(haul)) homeStash[item] = (homeStash[item] ?? 0) + count;
  const revival = { down, crew: crew.length, ...revivalBill(down, homeStash, meta.credits) };
  const overlays = (
    <>
      {mapDialog && editMode && (
        <MapDialog
          key={mapDialog}
          mode={mapDialog}
          initial={{ place: mapDialog === "new" && !map.hasPlace ? "" : map.place, name: mapDialog === "rename" ? map.name : "", world: map.world, width: 16, height: 10 }}
          onSubmit={(v) => submitMapDialog(mapDialog, v)}
          onClose={() => setMapDialog(null)}
        />
      )}
      {!editMode && phase === "run" && !runEnd && <MapTitle key={map.id} map={map} />}
      {inventoryShown && <InventoryPanel partyDock={partyDock} onClose={() => setInventoryOpen(false)} />}
      <LoadingImagePreloader ids={loadingImageIds} />
      {linkPrompt && !editMode && !runEnd && !activeInteraction && !inventoryShown && <GatePrompt prompt={linkPrompt} onGo={confirmLink} onStay={declineLink} />}
      {!editMode && <DragGhost />}
      {!editMode && phase === "run" && !runEnd && WORLDS[map.world].loop === "ship" && <AlertMeter alert={alert} compact={compact} powerOn={powerOn} />}
      {terminal && !editMode && <TerminalPanel title={terminal.title} text={terminal.text} onClose={closeTerminal} />}
      {keypad && !editMode && (
        <KeypadPanel title={keypad.title} hack={keypad.hack} hacker={keypad.hacker} onCode={enterCode} onHack={hackKeypad} onClose={closeKeypad} />
      )}
      {wipedAt !== null && !editMode && (
        <WipeScreen
          wipedAt={wipedAt}
          lost={Object.values(haul).reduce((n, c) => n + c, 0)}
          revival={revival}
          wake={WORLDS[map.world].loop === "open"}
          onContinue={() => {
            if (WORLDS[map.world].loop === "open") {
              // no base here: the party wakes again where the world begins
              respawn();
              enterMap(MAPS[WORLDS[map.world].startMap] ?? START_MAP);
              pushLog(t("app.wakeAgain"));
              return;
            }
            // the haul lost, the whole crew cloned, back to the base
            failRun();
            payRevival(down);
            storySave();
            nextRun(true);
            setPhase("base");
          }}
        />
      )}
      {runEnd && !editMode && (
        <RunSummary
          exit={runEnd.exit}
          haul={haul}
          stash={meta.stash}
          kills={kills}
          crew={crew}
          minutes={(runEnd.at - runStart) / 60000}
          revival={revival}
          onContinue={() => {
            // the haul home to the stash, the downed cloned, and back to the base
            bankHaul(haul, ship?.depth ?? getMeta().depth);
            // (and what the crew holds in hand is their loadout from now on)
            bankRun();
            payRevival(down);
            storySave();
            nextRun();
            setPhase("base");
          }}
        />
      )}
      {phase !== "run" && !editMode && (
        <div className="fixed inset-0 z-50" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          {phase === "base" ? (
            <BaseScreen onLaunch={() => setPhase("pick")} />
          ) : (
            <ShipPicker offers={offers} onPick={boardShip} onBack={() => setPhase("base")} />
          )}
        </div>
      )}
      {aim && aimWeapon && (
        <AimOverlay
          key={aim.crew}
          frameRef={aimFrameRef}
          focusRef={aimFocusRef}
          hurtAt={hurtAt}
          weapon={aimWeapon}
          crewName={crew[aim.crew].name}
          miniGame={settings.aimMiniGame}
          onShot={resolveShot}
          onCancel={cancelAim}
        />
      )}
      {hurtAt > 0 && <div key={hurtAt} className="hurt-flash absolute inset-0 pointer-events-none" />}
      {activeInteraction && !editMode && ((activeInteraction.kind === "dialogue" || activeInteraction.kind === "shop") && storyTalking
        ? <StoryDialoguePopup event={activeInteraction} close={closeInteraction} partyDock={partyDock}/>
        : activeInteraction.kind === "dialogue"
        ? <DialoguePopup event={activeInteraction} close={closeInteraction} partyDock={partyDock}/>
        : activeInteraction.kind === "shop"
        ? <ShopPanel shopId={activeInteraction.shop} partyDock={partyDock} onClose={closeInteraction}
            intro={{ portrait: activeInteraction.portrait, text: activeInteraction.greeting?.trim() || t("shop.greeting"), npc: activeInteraction.npc ? ACTOR_TYPES[activeInteraction.npc]?.name : undefined }}/>
        : <InteractionPopup event={activeInteraction} close={closeInteraction} partyDock={partyDock}/>)}
      {editMode && <PropEditor />}
      {editMode && (
        <Inspector
          assetDock={assetDock}
          onAssetEffect={(kind, effect) => { remember(kind, {effect, ...(kind === "smoke" ? {fire: undefined, petals: undefined} : {})}); setTemplateTick(n => n + 1); }}
          inspected={inspected}
          dock={editDock}
          tool={editTool}
          onTool={chooseTool}
          eventKind={eventKind}
          eventWorld={map.world}
          onEventKind={setEventKind}
          selectedEvent={eventTarget ? interactionAt(map, eventTarget) : undefined}
          onEventChange={(event, merge) => { if (eventTarget) editInteraction(eventTarget, event, merge); }}
          onEventRemove={() => { if (eventTarget && editInteraction(eventTarget)) setEventTarget(null); }}
          surface={editSurface}
          paint={paint}
          onPaint={(surface, setId) => setPaint((p) => ({ ...p, [surface]: setId }))}
          canUndo={canUndo(map.id)}
          canRedo={canRedo(map.id)}
          onUndo={editUndo}
          onRedo={editRedo}
          unsaved={hasUnsavedEdits(map.id)}
          onSave={editSave}
          onDownload={() => downloadMap(map.id)}
          onExit={() => setEditMode(false)}
          hiddenLayers={hiddenLayers}
          onToggleLayer={toggleLayer}
          lockedLayers={lockedLayers}
          onToggleLayerLock={toggleLayerLock}
          propChoice={propChoice}
          onPropChoice={setPropChoice}
          roofForm={roofForm}
          onRoofForm={setRoofForm}
          roofTexture={roofTexture}
          onRoofTexture={setRoofTexture}
          fence={fence}
          onFence={onFencePanel}
          propRotation={propRotation}
          onPropRotate={() => setPropRotation((r) => (r + 90) % 360)}
          robotChoice={robotChoice}
          onRobotChoice={setRobotChoice}
          actor={selectedActorInfo}
          onActorChange={(patch, merge) => changeActor(patch, Object.keys(patch).join() + (merge ?? ""))}
          onActorClearRoute={() => changeActor({ patrol: undefined })}
          onActorDelete={deleteActor}
          onActorDeselect={() => setSelectedActor(null)}
          door={selectedDoorInfo}
          doorWorld={map.world}
          doorTypeChoice={doorTypeChoice}
          onDoorTypeChoice={setDoorTypeChoice}
          onDoorChange={(patch, merge) => changeDoor(patch, Object.keys(patch).join() + (merge ?? ""))}
          onDoorFlip={() =>
            selectedDoorInfo &&
            changeDoor({ facing: behindOf(selectedDoorInfo.facing), offset: -selectedDoorInfo.offset || undefined })
          }
          onDoorDelete={deleteDoor}
          onDoorDeselect={() => setSelectedDoor(null)}
          mapId={map.id}
          mapSize={{ width: map.width, height: map.height }}
          mapIds={mapIds(map.world)}
          onResize={resize}
          onOpenMap={(id) => MAPS[id] && openMap(MAPS[id])}
          onOpenSharedMap={openSharedMap}
          onNewMap={newMap}
          onSaveMapAs={saveMapAs}
          onRenameMap={renameCurrentMap}
          mapLook={{ weather: map.weather, lightGridDensity: map.lightGridDensity, lightGridAmbient: map.lightGridAmbient, reliefDepth: map.reliefDepth, accent: map.accent, textures: map.textures, showTitle: map.showTitle, loadingImage: map.loadingImage, pickup: map.pickup }}
          onMapLook={changeMapLook}
          renderSettings={settings}
          onRenderSettings={setSettings}
          mapHasRender={!!map.render}
          onSaveRender={() => saveRender()}
          onClearRender={() => saveRender(true)}
          decalChoice={decalChoice?.name ?? null}
          onDecalChoice={setDecalChoice}
          decalRotation={decalRotation}
          decal={selectedDecalInfo}
          onDecalChange={(patch, merge) => changeDecal(patch, Object.keys(patch).join() + (merge ?? ""))}
          onDecalDelete={deleteDecal}
          onDecalDeselect={() => setSelectedDecal(null)}
          prop={selectedPropInfo}
          onPropChange={(patch, merge) => changeProp(patch, Object.keys(patch).join() + (merge ?? ""))}
          onPropStack={stackProp}
          onPropRoofDetach={roofDetach}
          onPropRoofRemove={roofRemove}
          onPropFenceRemoveRun={fenceRemoveRun}
          onPropDelete={deleteProp}
          onPropDeselect={() => setSelectedProp(null)}
          linkIds={linkIds}
          keyFlags={keyFlags(map)}
          smoke={placingKind === "smoke" ? smokeTemplateInfo : selectedSmokeInfo}
          onSmokeChange={
            placingKind === "smoke"
              ? (patch) => {
                  remember("smoke", patch);
                  setTemplateTick((n) => n + 1);
                }
              : (patch, merge) => changeSmoke(patch, Object.keys(patch).join() + (merge ?? ""))
          }
          onSmokeDelete={deleteSmoke}
          onSmokeDeselect={() => setSelectedSmoke(null)}
          exit={selectedExitInfo}
          onExitChange={(patch, merge) => {
            if (!selectedExit) return;
            const cell = selectedExit;
            const result = applyEdit(map.id, (file) => updateExit(file, cell, patch), `exit ${cell.x},${cell.y} ${Object.keys(patch).join()}${merge ?? ""}`);
            if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
            else replaceMap(result.map);
            setEdits((n) => n + 1);
          }}
          onExitRemove={() => {
            if (!selectedExit) return;
            const cell = selectedExit;
            const result = applyEdit(map.id, (file) => toggleExit(file, cell));
            if (!("error" in result)) replaceMap(result.map);
            setSelectedExit(null);
            setEdits((n) => n + 1);
          }}
          onExitDeselect={() => setSelectedExit(null)}
          stairs={selectedStairsInfo}
          onStairsChange={(patch, merge) => {
            if (!selectedStairs) return;
            const cell = selectedStairs;
            const result = applyEdit(map.id, (file) => updateStairs(file, cell, patch), `stairs ${cell.x},${cell.y} ${Object.keys(patch).join()}${merge ?? ""}`);
            if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
            else replaceMap(result.map);
            setEdits((n) => n + 1);
          }}
          onStairsRemove={() => {
            if (!selectedStairs) return;
            const cell = selectedStairs;
            const result = applyEdit(map.id, (file) => toggleStairs(file, cell));
            if (!("error" in result)) replaceMap(result.map);
            setSelectedStairs(null);
            setEdits((n) => n + 1);
          }}
          onStairsDeselect={() => setSelectedStairs(null)}
          itemChoice={itemChoice}
          onItemChoice={setItemChoice}
          item={selectedItemInfo}
          onItemChange={(patch, merge) => changeItem(patch, Object.keys(patch).join() + (merge ?? ""))}
          onItemDelete={deleteItem}
          onItemDeselect={() => setSelectedItem(null)}
          chanceWall={selectedChanceWallInfo}
          onChanceWallChange={changeChanceWall}
          onChanceWallRemove={() => {
            if (selectedChanceWall === null) return;
            const index = selectedChanceWall;
            const result = applyEdit(map.id, (file) => removeChanceWall(file, index));
            if ("error" in result) pushLog(t("app.editorError", { error: result.error }), "error");
            else replaceMap(result.map);
            setSelectedChanceWall(null);
            setEdits((n) => n + 1);
          }}
          onChanceWallDeselect={() => setSelectedChanceWall(null)}
          lightPlace={lightPlace}
          onLightPlace={setLightPlace}
          light={placingKind === "light" ? lightTemplateInfo : selectedLightInfo}
          onLightChange={placingKind === "light" ? (patch: Partial<MapLight>) => { if ("pos" in patch) setLightPlace(patch.pos ? "point" : "ceiling"); remember("light", patch); setTemplateTick((n) => n + 1); } : (patch, merge) => changeLight(patch, merge)}
          onLightDelete={deleteLight}
          onLightDeselect={() => setSelectedLight(null)}
          compact={compact}
        />
      )}
      {editMode && <ShortcutHelp open={shortcutHelp} onClose={() => setShortcutHelp(false)} />}
    </>
  );
  // free movement: touch gets twin sticks; a mouse gets a hint
  const joysticks = grid ? null : (
    <>
      <VirtualJoysticks axesRef={free.axesRef} />
      {finePointer && (
        <div className="absolute bottom-16 inset-x-0 text-center text-[11px] text-neutral-300/80 pointer-events-none">
          {t("app.mouseHint")}
        </div>
      )}
    </>
  );
  // what the Use button is called, by what's ahead of the party
  const useLabel = (() => {
    const ahead = { x: pos.x + DIR_VECTOR[dir].x, y: pos.y + DIR_VECTOR[dir].y };
    if (cellAt(map, ahead.x, ahead.y) === "door") return t("app.open");
    const container = (map.props ?? []).some(
      (p) => p.cell.x === ahead.x && p.cell.y === ahead.y && PROP_TYPES[p.prop]?.container,
    );
    return container ? t("app.search") : t("app.use");
  })();
  // the old action menu is left out (the movement pad replaced it)
  const SHOW_ACTION_MENU = false;
  const actionMenu = grid ? (
    <ActionMenu
      onForward={moveForward}
      onBack={moveBackward}
      onTurnLeft={turnL}
      onTurnRight={turnR}
      onJumpDown={jumpDown ?? undefined}
      onUse={use}
      onInventory={toggleInventory}
      compact={compact}
    />
  ) : (
    <ActionMenu onUse={use} onInventory={toggleInventory} compact={compact} />
  );
  // the left column's map (edit mode wraps it in the collapsible block below)
  const minimap = (
    <Minimap
      map={map}
      pos={pos}
      dir={dir}
      loot={editMode ? undefined : lootMarks}
      locked={lockedDoors}
      showRestricted={editMode}
      edit={
        editMode
          ? {
              hiddenCategories: hiddenLayers,
              onMarker: (category,index) => {
                switch(category){
                  case "prop":setEditTool("prop");setSelectedProp(index);break;
                  case "npc":setEditTool("robot");setSelectedActor(index);break;
                  case "item":setEditTool("item");setSelectedItem(index);break;
                  case "smoke":setEditTool("smoke");setSelectedSmoke(index);break;
                  case "light":setEditTool("light");setSelectedLight(index);break;
                  case "decal":setEditTool("decal");setSelectedDecal(index);break;
                }
              },
              verb: editTool === "height" ? t("app.raiseVerb") : editTool === "texture" ? t("app.paintVerb") : editTool === "dig" || editTool === "fill" ? t("app.digVerb") : t("app.editVerb"),
              surface: miniSurface,
              onSurface: setMiniSurface,
              onCell: (cell: Vec2, alt: boolean) => minimapCell.current(cell, alt),
              zoomed,
              onZoom: () => {
                setMiniZoom((z) => !z);
                setMiniSel(null);
              },
              selection: zoomed ? miniSel : null,
              onSelect: zoomed && !areaClip.pasting ? setMiniSel : undefined,
              paste: areaClip.ghost,
              onHover: areaClip.onHover,
            }
          : undefined
      }
    />
  );

  if (compact && !editMode) {
    // The game fills the screen; panels float on top with translucent
    // backgrounds. The left column and party strip ignore pointer events so
    // swipes on them still reach the viewport.
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden font-sans">
        <div className="absolute inset-0" {...viewInput}>
          {(phase === "run" || editMode) && viewport}
          {joysticks}
          {overlays}
        </div>

        <div className="absolute top-2 left-2 flex gap-1 pointer-events-none portrait:right-12 landscape:w-52 landscape:max-w-[48vw] landscape:flex-col">
          <div className="w-28 shrink-0">
            <Minimap map={map} pos={pos} dir={dir} compact loot={editMode ? undefined : lootMarks} locked={lockedDoors} showRestricted={editMode} />
          </div>
          <div className="min-w-0 portrait:flex-1 portrait:h-28 landscape:h-36">
            <LogPanel log={log} compact />
          </div>
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? t("app.closeMenu") : t("app.openMenu")}
          className="absolute top-2 right-2 pointer-events-auto w-9 h-9 flex items-center justify-center border border-neutral-700 bg-neutral-950/90 text-neutral-200 text-lg rounded-sm"
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        {/* the party at the bottom, the menu (action + debug) under it: scrolls when it is long */}
        <div className="absolute bottom-2 inset-x-2 max-h-[calc(100%-8.5rem)] overflow-y-auto flex flex-col gap-1 pointer-events-none landscape:max-h-none landscape:overflow-visible">
          {!editMode && !menuOpen && <div ref={setPartyDock}><PartyPanel crew={crew} compact readyAt={readyAt} aiming={aim?.crew ?? null} onUseHand={onUseHand} /></div>}
          {menuOpen && (
            <div className="pointer-events-auto flex flex-col gap-1 landscape:fixed landscape:top-12 landscape:right-2 landscape:bottom-16 landscape:w-48 landscape:overflow-y-auto">
              {SHOW_ACTION_MENU && actionMenu}
              <DebugPanel
                settings={settings}
                onChange={setSettings}
                stats={stats}
                mapId={map.id}
                onEditMap={() => setEditMode(true)}
                seed={seed}
                onReroll={reroll}
                mood={mood}
                moodOverride={moodOverride}
                onMood={setMoodOverride}
                world={map.world}
                mapTextures={map.textures}
                onMapTexture={changeMapTexture}
                compact
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-screen flex flex-col p-2 gap-2 overflow-hidden bg-neutral-950 font-sans">
      <ReleaseNotes />
      <div className="flex-1 flex gap-2 min-h-0">
        <div className={`${zoomed ? "w-[40vw]" : editMode ? "w-40 xl:w-56" : "w-56"} flex shrink-0 flex-col gap-2 min-h-0 ${editMode ? "max-md:hidden" : ""}`}>
          {editMode && !zoomed ? (
            <section className="flex shrink-0 flex-col">
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 border border-neutral-700 bg-neutral-900 px-2 py-1 text-left text-[11px] font-semibold text-neutral-200"
                aria-expanded={!minimapCollapsed}
                aria-label={t(minimapCollapsed ? "minimap.expand" : "minimap.collapse")}
                title={t(minimapCollapsed ? "minimap.expand" : "minimap.collapse")}
                onClick={() =>
                  setMinimapCollapsed((folded) => {
                    const next = !folded;
                    try {
                      localStorage.setItem(MINIMAP_COLLAPSE_KEY, String(next));
                    } catch {
                      /* storage unavailable: the block just won't remember */
                    }
                    return next;
                  })
                }
              >
                {minimapCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                {t("minimap.title")}
              </button>
              {!minimapCollapsed && minimap}
            </section>
          ) : (
            <div className={zoomed ? "flex-1 min-h-0" : ""}>{minimap}</div>
          )}
          {zoomed ? (
            <div className="shrink-0 border border-green-800 bg-black/60 p-2 text-[10px] font-mono text-neutral-200 flex flex-wrap items-center gap-1">
              {miniSel ? (
                (() => {
                  const btn = "border border-neutral-600 rounded-sm px-2 py-0.5 hover:bg-neutral-800";
                  return (
                    <>
                      <span className="text-amber-200">
                        {t("app.block", { w: miniSel.x1 - miniSel.x0 + 1, h: miniSel.y1 - miniSel.y0 + 1 })}
                      </span>
                      <button className={btn} onClick={areaDig} title={t("app.digTitle")}>{t("app.dig")}</button>
                      <button className={btn} onClick={areaFill} title={t("app.fillTitle")}>{t("app.fill")}</button>
                      <span className="text-neutral-400">{t("app.floor")}</span>
                      <button className={btn} onClick={() => areaHeight("floor", 0.25)} title={t("app.raiseFloor")}>▲</button>
                      <button className={btn} onClick={() => areaHeight("floor", -0.25)} title={t("app.lowerFloor")}>▼</button>
                      <span className="text-neutral-400">{t("app.ceiling")}</span>
                      <button className={btn} onClick={() => areaHeight("ceiling", 0.25)} title={t("app.raiseCeiling")}>▲</button>
                      <button className={btn} onClick={() => areaHeight("ceiling", -0.25)} title={t("app.lowerCeiling")}>▼</button>
                      <span className="text-neutral-400">{t("app.paint")}</span>
                      {(["floor", "wall", "ceiling"] as const).map((s) => (
                        <button key={s} className={btn} onClick={() => areaPaint(s)} title={t("app.paintSurface", { surface: t(`app.${s}Plural`), texture: paint[s] ?? t("app.nonePicked") })}>
                          {t(`app.${s}Plural`)}
                          <span className="text-neutral-500"> {paint[s] ?? t("app.own")}</span>
                        </button>
                      ))}
                      <AreaClipButtons area={areaClip} canCopy className={btn} />
                      <button className={`${btn} ml-auto`} onClick={() => setMiniSel(null)} title={t("app.release")}>✕</button>
                    </>
                  );
                })()
              ) : (
                <>
                  <span className="text-neutral-400">{t("app.blockHint")}</span>
                  <AreaClipButtons area={areaClip} canCopy={false} className="border border-neutral-600 rounded-sm px-2 py-0.5 hover:bg-neutral-800" />
                </>
              )}
            </div>
          ) : (
            <>
              <div className="text-[10px] text-neutral-500 px-1">
                <div>{map.name}</div>
                <div>{WORLDS[map.world].loop === "ship" ? <>{t("app.deckDay", { deck: map.deck })}</> : WORLDS[map.world].name}</div>
              </div>
              {editMode && !zoomed && <div ref={setAssetDock} className="flex-1 min-h-0 overflow-hidden"/>}
              {!editMode && <div className="flex-1 min-h-0">
                <LogPanel log={log} />
              </div>}
            </>
          )}
        </div>

        <div className="relative flex-1 min-w-0" {...viewInput}>
          {(phase === "run" || editMode) && viewport}
          {joysticks}
          {overlays}
          {editMode && <FloatToolbar view={settings.geometryView} onView={(v) => setSettings({ ...settings, geometryView: v })} onHelp={() => setShortcutHelp(true)} debugOpen={editorDebug} onDebug={() => setEditorDebug(!editorDebug)} tool={editTool} onTool={chooseTool} canUndo={canUndo(map.id)} canRedo={canRedo(map.id)} onUndo={editUndo} onRedo={editRedo} unsaved={hasUnsavedEdits(map.id)} onSave={editSave} onDownload={() => downloadMap(map.id)} onExit={() => setEditMode(false)} onNewMap={newMap} onMapProps={() => selectOnly(null)} shared={<div className="flex flex-wrap gap-2">{sharedConfigured && <SharedEditor key={map.world} map={map} openMap={openMap} changed={() => setEdits(n => n + 1)} />}<AssetManager reliefMode={settings.reliefMode} reliefDepth={map.reliefDepth ?? settings.reliefDepth} wallDetail={settings.wallDetail} /></div>} compact={compact} hint={areaClip.hint} />}
        </div>

        <div className={`${editMode ? "w-64 xl:w-80 max-md:w-44" : "w-56"} flex shrink-0 flex-col gap-2 min-h-0`}>
          {SHOW_ACTION_MENU && actionMenu}
          {/* the map editor's tools dock here while editing (see EditorBar) */}
          {editMode && <section className="flex min-h-0 flex-1 flex-col rounded border border-neutral-700 bg-neutral-900 p-2 text-neutral-200"><strong className="mb-2 text-xs">{t("editorShell.properties")}</strong><div ref={setEditDock} className="min-h-0 flex-1 overflow-auto"/>
              <details className="mt-2 shrink-0 text-xs"><summary className="cursor-pointer">{t("minimap.problems",{count:problems.length})}</summary><ProblemsPanel problems={problems} onFix={repairProblems} onGoto={cell=>{setMiniZoom(true);setMiniSel({x0:cell.x,y0:cell.y,x1:cell.x,y1:cell.y});}}/></details>
            </section>}
          {(!editMode || editorDebug) && <div className={editMode ? "absolute right-2 top-2 bottom-2 z-50 w-[min(26rem,96vw)] overflow-auto border border-neutral-500 bg-neutral-950 p-2 shadow-xl" : "flex-1 min-h-0"}>
            {editMode && <button className="mb-2 w-full rounded border border-neutral-600 px-2 py-1 text-neutral-200" onClick={()=>setEditorDebug(false)}>{t("editorShell.closeDebug")} ×</button>}
            <DebugPanel
              settings={settings}
              onChange={setSettings}
              stats={stats}
              mapId={map.id}
              onEditMap={() => setEditMode(true)}
              seed={seed}
              onReroll={reroll}
              mood={mood}
              moodOverride={moodOverride}
              onMood={setMoodOverride}
              world={map.world}
              mapTextures={map.textures}
              onMapTexture={changeMapTexture}
              inEditor
            />
          </div>}
        </div>
      </div>

      {draftNotice}
      {editMode && <EditorStatusBar log={log} mapName={map.name} unsaved={hasUnsavedEdits(map.id)} tool={editorToolLabel(editTool)}/>}
      {!editMode && (
        <div className="flex gap-2 items-end">
          {grid && (
            <MoveControls
              onTurnLeft={turnL}
              onForward={moveForward}
              onTurnRight={turnR}
              onStrafeLeft={strafeLeft}
              onBack={moveBackward}
              onStrafeRight={strafeRight}
              onUse={use}
              useLabel={useLabel}
              onInventory={toggleInventory}
              onJumpDown={jumpDown ?? undefined}
            />
          )}
          <div ref={setPartyDock} className="flex-1 min-w-0">
            <PartyPanel crew={crew} readyAt={readyAt} aiming={aim?.crew ?? null} onUseHand={onUseHand} />
          </div>
        </div>
      )}
    </div>
  );
}

