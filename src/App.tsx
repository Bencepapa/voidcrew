import { useEffect, useState } from "react";
import { useGameState } from "./game/useGameState";
import { GameViewport, DEFAULT_SETTINGS } from "./components/GameViewport";
import type { ViewportSettings } from "./components/GameViewport";
import { Minimap } from "./components/Minimap";
import { PartyPanel } from "./components/PartyPanel";
import { LogPanel } from "./components/LogPanel";
import { ActionMenu } from "./components/ActionMenu";
import { DebugPanel } from "./components/DebugPanel";

export default function App() {
  const { map, pos, dir, crew, log, moveForward, turnL, turnR, openingDoor } = useGameState();
  const [settings, setSettings] = useState<ViewportSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "w") moveForward();
      if (e.key === "ArrowLeft" || e.key === "a") turnL();
      if (e.key === "ArrowRight" || e.key === "d") turnR();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveForward, turnL, turnR]);

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

        <div className="flex-1 min-w-0">
          <GameViewport map={map} pos={pos} dir={dir} openingDoor={openingDoor} settings={settings} />
        </div>

        <div className="w-56 flex flex-col gap-2 min-h-0">
          <ActionMenu onForward={moveForward} onTurnLeft={turnL} onTurnRight={turnR} />
          <div className="flex-1 min-h-0">
            <DebugPanel settings={settings} onChange={setSettings} />
          </div>
        </div>
      </div>

      <PartyPanel crew={crew} />
    </div>
  );
}
