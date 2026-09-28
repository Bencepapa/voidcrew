import { useEffect, useRef, useState } from "react";
import { useGameState } from "./game/useGameState";
import { GameViewport, DEFAULT_SETTINGS } from "./components/GameViewport";
import type { AimFocus, AimFrame, EditTarget, ViewportSettings, ViewportStats } from "./components/GameViewport";
import { EditorBar } from "./editor/EditorBar";
import type { EditTool } from "./editor/EditorBar";
import { applyEdit, canRedo, canUndo, downloadMap, hasUnsavedEdits, redo, saveMap, undo } from "./editor/mapStore";
import { dig, fill } from "./editor/mapEdits";
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

  // The map editor's edits: a click digs out the wall pointed at, or fills
  // in the floor (the Fill tool, or the right button).
  const onEdit = (target: EditTarget, alt: boolean) => {
    const tool: EditTool = alt ? "fill" : editTool;
    let result: ReturnType<typeof applyEdit> | null = null;
    if (tool === "dig" && target.kind === "wall" && target.from) {
      const from = target.from;
      result = applyEdit(map.id, (file) => dig(file, target.cell, from));
    } else if (tool === "fill" && target.kind === "floor") {
      if (target.cell.x === pos.x && target.cell.y === pos.y) {
        pushLog("Editor: can't fill in the cell the party stands in.");
        return;
      }
      result = applyEdit(map.id, (file) => fill(file, target.cell));
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
      onEdit={onEdit}
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
          canUndo={canUndo(map.id)}
          canRedo={canRedo(map.id)}
          onUndo={editUndo}
          onRedo={editRedo}
          unsaved={hasUnsavedEdits(map.id)}
          onSave={editSave}
          onDownload={() => downloadMap(map.id)}
          onExit={() => setEditMode(false)}
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

        <div className="absolute bottom-2 inset-x-2 pointer-events-none">
          <PartyPanel crew={crew} compact readyAt={readyAt} aiming={aim?.crew ?? null} onWeapon={onWeapon} />
        </div>
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

      <PartyPanel crew={crew} readyAt={readyAt} aiming={aim?.crew ?? null} onWeapon={onWeapon} />
    </div>
  );
}
