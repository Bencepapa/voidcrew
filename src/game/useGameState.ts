import { useCallback, useEffect, useRef, useState } from "react";
import { deck2Engineering, cellAt, doorAt } from "./map";
import { behindOf, leftOf, rightOf, stepForward } from "./movement";
import { CLIMB_MS_PER_HEIGHT, passage } from "./heights";
import type { Direction, Vec2 } from "./types";
import { initialCrew } from "./crew";

export interface LogEntry {
  id: number;
  text: string;
}

let logId = 0;

const DOOR_ANIM_MS = 450;
// roughly the walk to and from a ladder around the climb itself (the
// viewport's move duration)
const CLIMB_WALK_MS = 250;

const BLOCKED_MESSAGES: Record<"wall" | "ledge" | "low", string> = {
  wall: "A bulkhead blocks the way.",
  ledge: "The ledge is too high to climb.",
  low: "The passage is too low.",
};
// a lift door shuts this long after the last time someone passed through it
const LIFT_DOOR_CLOSE_MS = 15000;

export function doorCellKey(cell: Vec2): string {
  return `${cell.x},${cell.y}`;
}

export function useGameState() {
  const [map] = useState(deck2Engineering);
  // arriving in the lift, facing its door
  const [pos, setPos] = useState<Vec2>(map.start.cell);
  const [dir, setDir] = useState<Direction>(map.start.facing);
  const [crew] = useState(initialCrew);
  const [log, setLog] = useState<LogEntry[]>([
    { id: logId++, text: "You board the USV Horizon, Deck 2 - Engineering." },
  ]);
  const [openingDoor, setOpeningDoor] = useState<Vec2 | null>(null);
  // door cells whose panel is up, keyed "x,y" (see doorCellKey); doors stay
  // open once opened
  const [openDoors, setOpenDoors] = useState<ReadonlySet<string>>(() => new Set());

  const pushLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-7), { id: logId++, text }]);
  }, []);

  // Lift doors close LIFT_DOOR_CLOSE_MS after the last passage: entering or
  // leaving the door cell (re)starts the countdown. It never closes on the
  // player - while they stand in the doorway it checks again shortly.
  const posRef = useRef(pos);
  posRef.current = pos;
  const openDoorsRef = useRef(openDoors);
  openDoorsRef.current = openDoors;
  const prevPosRef = useRef(pos);
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = closeTimers.current;
    const schedule = (cell: Vec2, delay: number) => {
      const key = doorCellKey(cell);
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          const here = posRef.current;
          if (here.x === cell.x && here.y === cell.y) {
            schedule(cell, 1000);
            return;
          }
          if (!openDoorsRef.current.has(key)) return;
          setOpenDoors((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          pushLog("The lift door slides shut.");
        }, delay),
      );
    };
    for (const cell of [prevPosRef.current, pos]) {
      if (cellAt(map, cell.x, cell.y) === "door" && doorAt(map, cell.x, cell.y).kind === "lift") {
        schedule(cell, LIFT_DOOR_CLOSE_MS);
      }
    }
    prevPosRef.current = pos;
  }, [pos, map, pushLog]);
  useEffect(() => {
    const timers = closeTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // dev-only: jump anywhere from the console, e.g. __voidcrewTeleport(6, 3, "S")
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __voidcrewTeleport: (x: number, y: number, facing: Direction) => {
        setPos({ x, y });
        setDir(facing);
      },
      __voidcrewPos: () => ({ ...posRef.current }),
    });
  }, []);

  // no moving or turning until a ladder climb (its animation) is over
  const busyUntilRef = useRef(0);
  const busy = () => performance.now() < busyUntilRef.current;

  const turnL = useCallback(() => {
    if (!busy()) setDir((d) => leftOf(d));
  }, []);
  const turnR = useCallback(() => {
    if (!busy()) setDir((d) => rightOf(d));
  }, []);

  const startOpening = useCallback(
    (cell: Vec2) => {
      pushLog(doorAt(map, cell.x, cell.y).kind === "lift" ? "The lift door slides open." : "The door slides open.");
      setOpeningDoor(cell);
      setOpenDoors((prev) => new Set(prev).add(doorCellKey(cell)));
    },
    [map, pushLog],
  );

  // steps one cell in `moveDir` while keeping the current facing
  const step = useCallback((moveDir: Direction) => {
    if (openingDoor || busy()) return;

    const next = stepForward(pos, moveDir);
    const target = cellAt(map, next.x, next.y);

    const way = passage(map, pos, next);
    if (way.kind === "blocked") {
      pushLog(BLOCKED_MESSAGES[way.reason]);
      return;
    }
    if (way.kind === "drop") pushLog(way.height > 0.5 ? "You jump down." : "You hop down.");
    if (way.kind === "climb") {
      // up only facing the ladder; down either way (backing down it faces
      // the ladder, like climbing down a real one)
      if (way.up && moveDir !== dir) {
        pushLog("Face the ladder to climb it.");
        return;
      }
      pushLog(way.up ? "You climb up the ladder." : "You climb down the ladder.");
      busyUntilRef.current = performance.now() + CLIMB_MS_PER_HEIGHT * way.height + CLIMB_WALK_MS;
    }

    if (target === "door" && !openDoors.has(doorCellKey(next))) {
      startOpening(next);
      setTimeout(() => {
        setPos(next);
        setOpeningDoor(null);
      }, DOOR_ANIM_MS);
      return;
    }

    setPos(next);
  }, [pos, dir, map, pushLog, openingDoor, openDoors, startOpening]);

  const moveForward = useCallback(() => step(dir), [step, dir]);
  const moveBackward = useCallback(() => step(behindOf(dir)), [step, dir]);

  // free movement: the continuous pose drives the grid state (nearest cell
  // and facing), which the minimap and door logic read
  const syncPose = useCallback((cell: Vec2, facing: Direction) => {
    setPos((p) => (p.x === cell.x && p.y === cell.y ? p : cell));
    setDir(facing);
  }, []);

  // free movement: bumping into a closed door opens it
  const openDoorAt = useCallback(
    (cell: Vec2) => {
      if (openingDoor || openDoors.has(doorCellKey(cell))) return;
      startOpening(cell);
      setTimeout(() => setOpeningDoor(null), DOOR_ANIM_MS);
    },
    [openingDoor, openDoors, startOpening],
  );

  return {
    map,
    pos,
    dir,
    crew,
    log,
    moveForward,
    moveBackward,
    turnL,
    turnR,
    pushLog,
    openingDoor,
    openDoors,
    syncPose,
    openDoorAt,
  };
}
