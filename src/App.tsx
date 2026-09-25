import { useEffect, useState } from "react";
import { useGameState } from "./game/useGameState";
import { GameViewport, DEFAULT_SETTINGS } from "./components/GameViewport";
import type { ViewportSettings, ViewportStats } from "./components/GameViewport";
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
    crew,
    log,
    moveForward,
    moveBackward,
    turnL,
    turnR,
    openingDoor,
    openDoors,
    syncPose,
    openDoorAt,
  } = useGameState();
  const [settings, setSettings] = useState<ViewportSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ViewportStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const compact = useMediaQuery(COMPACT_QUERY);
  const grid = settings.gridMovement;
  const finePointer = useMediaQuery("(pointer: fine)");
  const free = useFreeMovement({ enabled: !grid, map, pos, dir, openDoors, openingDoor, syncPose, openDoorAt });
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
      if (e.key === "ArrowUp" || e.key === "w") moveForward();
      if (e.key === "ArrowDown" || e.key === "s") moveBackward();
      if (e.key === "ArrowLeft" || e.key === "a") turnL();
      if (e.key === "ArrowRight" || e.key === "d") turnR();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grid, moveForward, moveBackward, turnL, turnR]);

  const viewport = (
    <GameViewport
      map={map}
      pos={pos}
      dir={dir}
      openingDoor={openingDoor}
      openDoors={openDoors}
      freeTick={grid ? undefined : free.tick}
      peekRef={view.peekRef}
      settings={settings}
      onStats={setStats}
    />
  );
  const viewInput = view.handlers;
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
    <ActionMenu onForward={moveForward} onBack={moveBackward} onTurnLeft={turnL} onTurnRight={turnR} compact={compact} />
  ) : (
    <ActionMenu compact={compact} />
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
              <DebugPanel settings={settings} onChange={setSettings} stats={stats} compact />
            </div>
          )}
        </div>

        <div className="absolute bottom-2 inset-x-2 pointer-events-none">
          <PartyPanel crew={crew} compact />
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
            <div>Deck 2 &middot; Day 17</div>
          </div>
          <div className="flex-1 min-h-0">
            <LogPanel log={log} />
          </div>
        </div>

        <div className="relative flex-1 min-w-0" {...viewInput}>
          {viewport}
          {joysticks}
        </div>

        <div className="w-56 flex flex-col gap-2 min-h-0">
          {actionMenu}
          <div className="flex-1 min-h-0">
            <DebugPanel settings={settings} onChange={setSettings} stats={stats} />
          </div>
        </div>
      </div>

      <PartyPanel crew={crew} />
    </div>
  );
}
