import { useCallback, useState } from "react";
import { deck2Engineering, cellAt } from "./map";
import { leftOf, rightOf, stepForward } from "./movement";
import type { Direction, Vec2 } from "./types";
import { initialCrew } from "./crew";

export interface LogEntry {
  id: number;
  text: string;
}

let logId = 0;

const DOOR_ANIM_MS = 450;

export function useGameState() {
  const [map] = useState(deck2Engineering);
  const [pos, setPos] = useState<Vec2>({ x: 2, y: 1 });
  const [dir, setDir] = useState<Direction>("S");
  const [crew] = useState(initialCrew);
  const [log, setLog] = useState<LogEntry[]>([
    { id: logId++, text: "You board the USV Horizon, Deck 2 - Engineering." },
  ]);
  const [openingDoor, setOpeningDoor] = useState<Vec2 | null>(null);

  const pushLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-7), { id: logId++, text }]);
  }, []);

  const turnL = useCallback(() => setDir((d) => leftOf(d)), []);
  const turnR = useCallback(() => setDir((d) => rightOf(d)), []);

  const moveForward = useCallback(() => {
    if (openingDoor) return;

    const next = stepForward(pos, dir);
    const target = cellAt(map, next.x, next.y);

    if (target === "wall") {
      pushLog("A bulkhead blocks the way.");
      return;
    }

    if (target === "door") {
      pushLog("The door slides open.");
      setOpeningDoor(next);
      setTimeout(() => {
        setPos(next);
        setOpeningDoor(null);
      }, DOOR_ANIM_MS);
      return;
    }

    setPos(next);
  }, [pos, dir, map, pushLog, openingDoor]);

  return { map, pos, dir, crew, log, moveForward, turnL, turnR, pushLog, openingDoor };
}
