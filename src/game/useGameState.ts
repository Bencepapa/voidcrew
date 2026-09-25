import { useCallback, useState } from "react";
import { deck2Engineering, cellAt } from "./map";
import { behindOf, leftOf, rightOf, stepForward } from "./movement";
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

  // steps one cell in `moveDir` while keeping the current facing
  const step = useCallback((moveDir: Direction) => {
    if (openingDoor) return;

    const next = stepForward(pos, moveDir);
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
  }, [pos, map, pushLog, openingDoor]);

  const moveForward = useCallback(() => step(dir), [step, dir]);
  const moveBackward = useCallback(() => step(behindOf(dir)), [step, dir]);

  return { map, pos, dir, crew, log, moveForward, moveBackward, turnL, turnR, pushLog, openingDoor };
}
