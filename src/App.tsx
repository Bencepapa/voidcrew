import { useEffect, useRef, useState } from "react";
import { useGameState } from "./game/useGameState";
import { GameViewport, DEFAULT_SETTINGS } from "./components/GameViewport";
import type { AimFocus, AimFrame, EditTarget, ViewportSettings, ViewportStats } from "./components/GameViewport";
import { EditorBar } from "./editor/EditorBar";
import {
  applyEdit,
  canRedo,
  canUndo,
  createMap,
  downloadMap,
  hasUnsavedEdits,
  mapFile,
  mapIds,
  redo,
  saveMap,
  undo,
} from "./editor/mapStore";
import { MAPS } from "./game/map";
import type { GameMap } from "./game/types";
import {
  blankMap,
  resizeMap,
  addDecal,
  removeDecal,
  updateDecal,
  addLight,
  addProp,
  anchorAt,
  dig,
  fill,
  paintTexture,
  removeLight,
  removeProp,
  removePropIndex,
  updateProp,
  setHeight,
  toggleBridge,
  toggleDoor,
  toggleLadder,
  updateLight,
} from "./editor/mapEdits";
import { PROP_TYPES } from "./game/props";
import type { DecalChoice, DecalInfo, LightInfo, LightPlace, PropInfo } from "./editor/EditorBar";
import { cellAt, ceilingHeight, floorHeight } from "./game/map";
import type { Direction, MapLight } from "./game/types";
import { DIR_VECTOR, rightOf } from "./game/movement";
import { generateLights, ownCeilingLight } from "./game/lights";
import type { EditSurface, EditTool, TextureLayer } from "./editor/mapEdits";
import type { TextureSetId } from "./render/textureSets";
import { AimOverlay } from "./components/AimOverlay";
import { CREW_WEAPONS } from "./game/combat";
import { Minimap } from "./components/Minimap";
import { PartyPanel } from "./components/PartyPanel";
import { LogPanel } from "./components/LogPanel";
import { ActionMenu } from "./components/ActionMenu";
import { DebugPanel } from "./components/DebugPanel";
import { useMediaQuery } from "./components/useMediaQuery";
import { useViewControls } from "./components/useViewControls";
import { VirtualJoysticks } from "./components/VirtualJoysticks";
import { useFreeMovement } from "./game/useFreeMovement";

// phones in portrait (narrow) or landscape (short) get the overlay layout
const COMPACT_QUERY = "(max-width: 767px), (max-height: 540px)";

export default function App() {
  const {
    map,
    pos,
    dir,
    elevation,
    jumpDown,
    use,
    touch,
    inLift,
    ride,
    actors,
    readyAt,
    aim,
    hurtAt,
    partyCoverRef,
    fireWeapon,
    cancelAim,
    resolveShot,
    setImmortalCrew,
    setNoclip,
    setWorldFrozen,
    replaceMap,
    enterMap,
    shiftParty,
    pushLog,
    crew,
    log,
    moveForward,
    moveBackward,
    turnL,
    turnR,
    openingDoor,
    openDoors,
    sceneReady,
    syncPose,
    openDoorAt,
  } = useGameState();
  const [settings, setSettings] = useState<ViewportSettings>(DEFAULT_SETTINGS);
  // the map editor (see EDITOR.md): while it's on the world holds still,
  // walls don't stop the party and the headlamp is lit
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<EditTool>("dig");
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
  // the Decal tool: the decal a click puts on (and its size in surface
  // pixels), how it's turned, and the selected one (its index in the map's
  // decals)
  const [decalChoice, setDecalChoice] = useState<DecalChoice | null>(null);
  const [decalRotation, setDecalRotation] = useState(0);
  const [selectedDecal, setSelectedDecal] = useState<number | null>(null);
  // the surface the pointer is on: the Texture tool's palette marks its row
  // (it sticks to the last one when nothing is under the pointer)
  const [editSurface, setEditSurface] = useState<EditSurface>("wall");
  // the set picked for each surface (null: the texture the map gives it)
  const [paint, setPaint] = useState<Record<EditSurface, TextureSetId | null>>({ wall: null, floor: null, ceiling: null });
  // bumped by every edit, undo, redo and save, to redraw the toolbar
  const [, setEdits] = useState(0);
  const viewSettings = editMode ? { ...settings, noclip: true, headlamp: true } : settings;
  const [stats, setStats] = useState<ViewportStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const aimFrameRef = useRef<AimFrame | null>(null);
  const aimFocusRef = useRef<AimFocus | null>(null);
  useEffect(() => setImmortalCrew(settings.immortalCrew), [settings.immortalCrew, setImmortalCrew]);
  useEffect(() => setNoclip(viewSettings.noclip), [viewSettings.noclip, setNoclip]);
  useEffect(() => setWorldFrozen(editMode), [editMode, setWorldFrozen]);
  if (!aim) aimFocusRef.current = null;
  const aimRef = useRef(aim);
  aimRef.current = aim;
  const aimWeapon = aim ? (CREW_WEAPONS[crew[aim.crew].id] ?? null) : null;
  const compact = useMediaQuery(COMPACT_QUERY);
  const grid = settings.gridMovement;
  const finePointer = useMediaQuery("(pointer: fine)");
  const free = useFreeMovement({
    enabled: !grid,
    frozen: inLift || aim !== null,
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
      if (e.key === "ArrowUp" || e.key === "w") moveForward();
      if (e.key === "ArrowDown" || e.key === "s") moveBackward();
      if (e.key === "ArrowLeft" || e.key === "a") turnL();
      if (e.key === "ArrowRight" || e.key === "d") turnR();
      if (e.key === "x") jumpDown?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grid, moveForward, moveBackward, turnL, turnR, jumpDown]);

  // The surface under the pointer, for the palette (see EditorBar).
  const onEditHover = (target: EditTarget | null) => {
    if (target) setEditSurface(target.kind);
  };
  // The map editor's edits: a click digs out the wall pointed at or fills in
  // the floor (the Fill tool, or the right button), paints the surface with
  // the set picked in the palette (the right button paints the map's own
  // texture back), or toggles the cell's ceiling light.
  const onEdit = (target: EditTarget, alt: boolean, shift = false) => {
    let result: ReturnType<typeof applyEdit> | null = null;
    if (editTool === "texture") {
      // a wall's texture set is the open cell its face is seen from
      const cell = target.kind === "wall" ? target.from : target.cell;
      const layer: TextureLayer =
        target.kind === "wall" ? "wallTexture" : target.kind === "floor" ? "floorTexture" : "ceilingTexture";
      if (cell) {
        const setId = alt ? null : paint[target.kind];
        result = applyEdit(map.id, (file) => paintTexture(file, layer, cell, setId));
        if (!("error" in result)) {
          pushLog(`Editor: ${target.kind} at ${cell.x},${cell.y} - ${setId ?? "the map's own texture"}.`);
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
        result = applyEdit(map.id, (file) => addLight(file, { x: at.x, y: at.y, pos }));
        setSelectedLight(count);
      } else if (target.kind !== "wall") {
        if (own >= 0) {
          setSelectedLight(own);
          return;
        }
        result = applyEdit(map.id, (file) => addLight(file, { x: cell.x, y: cell.y }));
        setSelectedLight(count);
      }
    } else if (editTool === "height") {
      // raise (lower: right button) the floor or ceiling pointed at
      if (target.kind === "wall") return;
      const cell = target.cell;
      const floor = floorHeight(map, cell.x, cell.y);
      const step = alt ? -0.25 : 0.25;
      if (target.kind === "ceiling") {
        const value = ceilingHeight(map, cell.x, cell.y) + step;
        // one panel above the floor is the default: no need to write it
        result = applyEdit(map.id, (file) => setHeight(file, "ceiling", cell, value === floor + 1 ? null : value));
        if (!("error" in result)) pushLog(`Editor: ceiling at ${cell.x},${cell.y} - ${value}.`);
      } else {
        const value = floor + step;
        result = applyEdit(map.id, (file) => setHeight(file, "floor", cell, value === 0 ? null : value));
        if (!("error" in result)) pushLog(`Editor: floor at ${cell.x},${cell.y} - ${value}.`);
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
    } else if (editTool === "door") {
      if (target.kind === "wall") return;
      const cell = target.cell;
      const isDoor = cellAt(map, cell.x, cell.y) === "door";
      if (alt && !isDoor) return;
      if (cell.x === pos.x && cell.y === pos.y && !isDoor) {
        pushLog("Editor: can't put a door where the party stands.");
        return;
      }
      result = applyEdit(map.id, (file) => toggleDoor(file, cell));
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
          pushLog("Editor: pick a decal in the palette first.");
          return;
        }
        const { cell, surface, u, v } = target.surfacePoint;
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
        result = applyEdit(map.id, (file) => removePropIndex(file, picked));
        setSelectedProp((sel) => (sel === null || sel === picked ? null : sel > picked ? sel - 1 : sel));
      } else {
        if (target.kind === "wall") return;
        const cell = target.cell;
        const [dx, , dz] = target.spot && target.spot.cell.x === cell.x && target.spot.cell.y === cell.y ? target.spot.pos : [0, 0, 0];
        if (alt) {
          result = applyEdit(map.id, (file) => removeProp(file, cell, anchorAt(dx, dz)));
          setSelectedProp(null);
        } else {
          const anchor = anchorAt(dx, dz, !!PROP_TYPES[propChoice]?.wall);
          const count = map.props?.length ?? 0;
          result = applyEdit(map.id, (file) => addProp(file, propChoice, cell, anchor, propRotation));
          setSelectedProp(count);
        }
      }
    } else {
      const tool: EditTool = alt ? "fill" : editTool;
      if (tool === "dig" && target.kind === "wall" && target.from) {
        const from = target.from;
        result = applyEdit(map.id, (file) => dig(file, target.cell, from));
      } else if (tool === "fill" && target.kind !== "wall") {
        if (target.cell.x === pos.x && target.cell.y === pos.y) {
          pushLog("Editor: can't fill in the cell the party stands in.");
          return;
        }
        result = applyEdit(map.id, (file) => fill(file, target.cell));
      }
    }
    if (!result) return;
    if ("error" in result) pushLog(`Editor: ${result.error}`);
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
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
      .then((file) => pushLog(`Editor: saved ${file}.`))
      .catch((err) => pushLog(`Editor: not saved - ${err instanceof Error ? err.message : err}`))
      .finally(() => setEdits((n) => n + 1));
  };
  // Tab: the editor on and off; while on, Z / Y undo and redo, Ctrl+S saves
  const editKeys = useRef({ editUndo, editRedo, editSave });
  editKeys.current = { editUndo, editRedo, editSave };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Tab" && !aimRef.current) {
        e.preventDefault();
        setEditMode((on) => !on);
        return;
      }
      if (!editMode) return;
      const key = e.key.toLowerCase();
      if (key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        editKeys.current.editSave();
      } else if (key === "z") editKeys.current.editUndo();
      else if (key === "y") editKeys.current.editRedo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
  const resize = (edge: Direction, grow: boolean) => {
    const result = applyEdit(map.id, (file) => resizeMap(file, edge, grow));
    if ("error" in result) {
      pushLog(`Editor: ${result.error}`);
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
  const newMap = () => {
    const id = prompt("New map's id (its file name, e.g. derelict1-crew):")?.trim();
    if (!id) return;
    const name = prompt("Its name:", `Deck ${map.deck} - `)?.trim() || id;
    const size = prompt("Its size, width x height:", "16x10") ?? "";
    const [w, h] = size.split(/[x, ]+/).map(Number);
    const result = createMap(id, blankMap(name, map.deck, w || 16, h || 10, mapFile(map.id) ?? undefined));
    if ("error" in result) pushLog(`Editor: ${result.error}`);
    else {
      openMap(result.map);
      pushLog(`Editor: made ${id} - save it to keep it.`);
    }
  };
  const saveMapAs = () => {
    const id = prompt("Copy this map as (its new id, e.g. derelict1-engineering):")?.trim();
    if (!id) return;
    const name = prompt("Its name:", map.name)?.trim() || map.name;
    const file = structuredClone(mapFile(map.id));
    if (!file) return;
    file.name = name;
    const result = createMap(id, file, map.id);
    if ("error" in result) pushLog(`Editor: ${result.error}`);
    else {
      openMap(result.map);
      // (straight to disk in dev: a copy is meant to be kept)
      if (import.meta.env.DEV) {
        saveMap(id)
          .then((path) => pushLog(`Editor: saved ${path}.`))
          .catch((err) => pushLog(`Editor: not saved - ${err instanceof Error ? err.message : err}`));
      }
      pushLog(`Editor: copied ${map.id} as ${id}.`);
    }
  };

  // The selected decal, as the panel shows it
  const selectedDecalInfo: DecalInfo | null = (() => {
    const spec = selectedDecal === null ? undefined : map.decals?.[selectedDecal];
    return spec ? { name: spec.decal, rotation: spec.rotation ?? 0, action: spec.action } : null;
  })();
  const changeDecal = (patch: Parameters<typeof updateDecal>[2], merge?: string) => {
    if (selectedDecal === null) return;
    const index = selectedDecal;
    const result = applyEdit(map.id, (file) => updateDecal(file, index, patch), merge && `decal ${index} ${merge}`);
    if ("error" in result) pushLog(`Editor: ${result.error}`);
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
    if (!editMode || editTool !== "decal") return;
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
  }, [editMode, editTool]);

  // The selected prop, as the panel shows it
  const selectedPropInfo: PropInfo | null = (() => {
    const spec = selectedProp === null ? undefined : map.props?.[selectedProp];
    if (!spec) return null;
    const type = PROP_TYPES[spec.prop];
    return {
      name: spec.prop,
      rotation: spec.rotation ?? 0,
      elevation: spec.elevation ?? 0,
      roomHeight: ceilingHeight(map, spec.cell.x, spec.cell.y) - floorHeight(map, spec.cell.x, spec.cell.y),
      // where a prop stacked on it stands: on its top
      top: (spec.elevation ?? 0) + (type?.size[1] ?? 0),
    };
  })();
  const changeProp = (patch: Parameters<typeof updateProp>[2], merge?: string) => {
    if (selectedProp === null) return;
    const index = selectedProp;
    const result = applyEdit(map.id, (file) => updateProp(file, index, patch), merge && `prop ${index} ${merge}`);
    if ("error" in result) pushLog(`Editor: ${result.error}`);
    else replaceMap(result.map);
    setEdits((n) => n + 1);
  };
  const deleteProp = () => {
    if (selectedProp === null) return;
    const index = selectedProp;
    const result = applyEdit(map.id, (file) => removePropIndex(file, index));
    if (!("error" in result)) replaceMap(result.map);
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
    if ("error" in result) pushLog(`Editor: ${result.error}`);
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
    if (!editMode || editTool !== "prop") return;
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
        const elevation = round(Math.min(info.roomHeight - 0.05, Math.max(0, info.elevation + up)));
        change({ elevation: elevation || undefined }, "elevation");
      }
    }
    // before the movement keys' handlers (and the next prop's R)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editMode, editTool]);

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
      roomHeight: ceilingHeight(map, own.x, own.y) - floorHeight(map, own.x, own.y),
    };
  })();
  // a change from the panel (a slider dragged: one undo step per setting)
  const changeLight = (patch: Partial<MapLight>) => {
    if (selectedLight === null) return;
    const index = selectedLight;
    const result = applyEdit(map.id, (file) => updateLight(file, index, patch), `light ${index} ${Object.keys(patch).join()}`);
    if ("error" in result) pushLog(`Editor: ${result.error}`);
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
  const lightKeys = useRef({ selectedLightInfo, changeLight, deleteLight });
  lightKeys.current = { selectedLightInfo, changeLight, deleteLight };
  useEffect(() => {
    if (!editMode || editTool !== "light") return;
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
  }, [editMode, editTool]);

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
      if (e.key === "l" || e.key === "L") setSettings((s) => ({ ...s, headlamp: !s.headlamp }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 1-4: a crewmate's weapon (see combat.ts); aiming needs the pointer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = Number(e.key);
      if (n >= 1 && n <= crew.length && !aim && !editMode) {
        if (document.pointerLockElement) document.exitPointerLock();
        fireWeapon(n - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crew.length, aim, fireWeapon, editMode]);
  const onWeapon = (index: number) => {
    if (editMode) return;
    if (document.pointerLockElement) document.exitPointerLock();
    fireWeapon(index);
  };

  // Use (Space or Enter) works in both movement modes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === " " || e.key === "Enter") && !aimRef.current) use();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [use]);

  const viewport = (
    <GameViewport
      map={map}
      pos={pos}
      dir={dir}
      elevation={elevation}
      openDoors={openDoors}
      ride={ride}
      actors={actors}
      aiming={aimWeapon}
      aimFrameRef={aimFrameRef}
      aimFocusRef={aimFocusRef}
      partyCoverRef={partyCoverRef}
      onTouch={touch}
      editMode={editMode}
      editTool={editTool}
      onEdit={onEdit}
      selectedLight={selectedLightInfo ? selectedLight : null}
      selectedProp={selectedPropInfo ? selectedProp : null}
      selectedDecal={selectedDecalInfo ? selectedDecal : null}
      onEditHover={onEditHover}
      onReady={sceneReady}
      freeTick={grid ? undefined : free.tick}
      peekRef={view.peekRef}
      settings={viewSettings}
      onStats={setStats}
    />
  );
  const viewInput = view.handlers;
  // over the view: the aiming overlay, and a red flash when the crew is hit
  const overlays = (
    <>
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
      {editMode && (
        <EditorBar
          tool={editTool}
          onTool={setEditTool}
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
          propChoice={propChoice}
          onPropChoice={setPropChoice}
          propRotation={propRotation}
          onPropRotate={() => setPropRotation((r) => (r + 90) % 360)}
          mapId={map.id}
          mapSize={{ width: map.width, height: map.height }}
          mapIds={mapIds()}
          onResize={resize}
          onOpenMap={(id) => MAPS[id] && openMap(MAPS[id])}
          onNewMap={newMap}
          onSaveMapAs={saveMapAs}
          decalChoice={decalChoice?.name ?? null}
          onDecalChoice={setDecalChoice}
          decalRotation={decalRotation}
          decal={selectedDecalInfo}
          onDecalChange={(patch) => changeDecal(patch, Object.keys(patch).join())}
          onDecalDelete={deleteDecal}
          onDecalDeselect={() => setSelectedDecal(null)}
          prop={selectedPropInfo}
          onPropChange={(patch) => changeProp(patch, Object.keys(patch).join())}
          onPropStack={stackProp}
          onPropDelete={deleteProp}
          onPropDeselect={() => setSelectedProp(null)}
          lightPlace={lightPlace}
          onLightPlace={setLightPlace}
          light={selectedLightInfo}
          onLightChange={changeLight}
          onLightDelete={deleteLight}
          onLightDeselect={() => setSelectedLight(null)}
          compact={compact}
        />
      )}
    </>
  );
  // free movement: touch gets twin sticks; a mouse gets a hint until it's
  // captured for mouselook
  const joysticks = grid ? null : (
    <>
      <VirtualJoysticks axesRef={free.axesRef} />
      {finePointer && !view.mouseLocked && (
        <div className="absolute bottom-16 inset-x-0 text-center text-[11px] text-neutral-300/80 pointer-events-none">
          Click the view for mouselook (Esc releases) · WASD move · Q/E turn
        </div>
      )}
    </>
  );
  const actionMenu = grid ? (
    <ActionMenu
      onForward={moveForward}
      onBack={moveBackward}
      onTurnLeft={turnL}
      onTurnRight={turnR}
      onJumpDown={jumpDown ?? undefined}
      onUse={use}
      compact={compact}
    />
  ) : (
    <ActionMenu onUse={use} compact={compact} />
  );

  if (compact) {
    // The game fills the screen; panels float on top with translucent
    // backgrounds. The left column and party strip ignore pointer events so
    // swipes on them still reach the viewport.
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden font-sans">
        <div className="absolute inset-0" {...viewInput}>
          {viewport}
          {joysticks}
          {overlays}
        </div>

        <div className="absolute top-2 left-2 w-28 flex flex-col gap-1 pointer-events-none">
          <Minimap map={map} pos={pos} dir={dir} compact />
          <div className="h-16">
            <LogPanel log={log} compact />
          </div>
        </div>

        <div className="absolute top-2 right-2 bottom-14 flex flex-col items-end gap-1 pointer-events-none">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="pointer-events-auto w-9 h-9 flex items-center justify-center border border-neutral-700 bg-black/40 text-neutral-200 text-lg rounded-sm"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
          {menuOpen && (
            <div className="pointer-events-auto w-48 min-h-0 flex flex-col gap-1 overflow-y-auto">
              {actionMenu}
              <DebugPanel
                settings={settings}
                onChange={setSettings}
                stats={stats}
                mapId={map.id}
                onEditMap={() => setEditMode(true)}
                compact
              />
            </div>
          )}
        </div>

        {/* (not while editing the map: no fighting, and the room it takes) */}
        {!editMode && (
          <div className="absolute bottom-2 inset-x-2 pointer-events-none">
            <PartyPanel crew={crew} compact readyAt={readyAt} aiming={aim?.crew ?? null} onWeapon={onWeapon} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col p-2 gap-2 font-sans">
      <div className="flex-1 flex gap-2 min-h-0">
        <div className="w-56 flex flex-col gap-2">
          <Minimap map={map} pos={pos} dir={dir} />
          <div className="text-[10px] text-neutral-500 px-1">
            <div>{map.name}</div>
            <div>Deck {map.deck} &middot; Day 17</div>
          </div>
          <div className="flex-1 min-h-0">
            <LogPanel log={log} />
          </div>
        </div>

        <div className="relative flex-1 min-w-0" {...viewInput}>
          {viewport}
          {joysticks}
          {overlays}
        </div>

        <div className="w-56 flex flex-col gap-2 min-h-0">
          {actionMenu}
          <div className="flex-1 min-h-0">
            <DebugPanel
              settings={settings}
              onChange={setSettings}
              stats={stats}
              mapId={map.id}
              onEditMap={() => setEditMode(true)}
            />
          </div>
        </div>
      </div>

      {!editMode && <PartyPanel crew={crew} readyAt={readyAt} aiming={aim?.crew ?? null} onWeapon={onWeapon} />}
    </div>
  );
}
