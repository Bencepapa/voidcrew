import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAPS, START_MAP, cellAt, doorAt, floorHeight, liftAt, liftDoorOf } from "./map";
import { DIR_VECTOR, behindOf, leftOf, rightOf, stepForward } from "./movement";
import { CLIMB_MS_PER_HEIGHT, jumpDown, passage } from "./heights";
import type { Direction, GameMap, Vec2 } from "./types";
import { initialCrew } from "./crew";

export interface LogEntry {
  id: number;
  text: string;
}

// A lift ride in progress (performance.now() times), for the viewport's
// effects: the cabin shakes and the shaft's lights sweep past. The next
// map is swapped in `swapAt` ms into it, while the cabin lights dip.
export interface LiftRide {
  start: number;
  duration: number;
  swapAt: number;
  up: boolean;
}

let logId = 0;

const DOOR_ANIM_MS = 450;
// roughly the walk to and from a ladder around the climb itself (the
// viewport's move duration)
const CLIMB_WALK_MS = 250;
// a lift ride: the door shuts, then the cabin travels
const LIFT_CLOSE_MS = 600;
const LIFT_RIDE_MS = 3600;
const LIFT_SWAP_AT = 1700;
// after a slow load, the cabin sits still this long before the doors open
const LIFT_SETTLE_MS = 700;

const BLOCKED_MESSAGES: Record<"wall" | "ledge" | "low" | "prop", string> = {
  wall: "A bulkhead blocks the way.",
  ledge: "The ledge is too high to climb.",
  low: "The passage is too low.",
  prop: "Something is in the way.",
};
// a lift door shuts this long after the last time someone passed through it
const LIFT_DOOR_CLOSE_MS = 15000;

export function doorCellKey(cell: Vec2): string {
  return `${cell.x},${cell.y}`;
}

// the direction from a cell to a neighbor
function directionTo(from: Vec2, to: Vec2): Direction | undefined {
  return (Object.keys(DIR_VECTOR) as Direction[]).find(
    (d) => from.x + DIR_VECTOR[d].x === to.x && from.y + DIR_VECTOR[d].y === to.y,
  );
}

export function useGameState() {
  const [map, setMap] = useState<GameMap>(START_MAP);
  const mapRef = useRef(map);
  mapRef.current = map;
  // arriving in the lift, facing its door
  const [pos, setPos] = useState<Vec2>(map.start.cell);
  const [dir, setDir] = useState<Direction>(map.start.facing);
  // the height the party stands at: the cell's floor, or a bridge above it
  const [elevation, setElevation] = useState(() => floorHeight(map, map.start.cell.x, map.start.cell.y));
  const [crew] = useState(initialCrew);
  const [log, setLog] = useState<LogEntry[]>([
    { id: logId++, text: `You board the USV Horizon, ${START_MAP.name}.` },
  ]);
  const [openingDoor, setOpeningDoor] = useState<Vec2 | null>(null);
  // door cells whose panel is up, keyed "x,y" (see doorCellKey); doors stay
  // open once opened
  const [openDoors, setOpenDoors] = useState<ReadonlySet<string>>(() => new Set());
  // a lift is taking the party to another deck (from the button press until
  // the doors open there); `ride` is its travelling part
  const [inLift, setInLift] = useState(false);
  const [ride, setRide] = useState<LiftRide | null>(null);

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

  // the map whose scene the viewport has built and shows (see sceneReady);
  // nothing moves while the current one is still loading
  const readyMapRef = useRef<string | null>(null);
  // a lift arrival waiting for its deck to load
  const pendingArrivalRef = useRef<{ mapId: string; arrive: () => void } | null>(null);
  const sceneReady = useCallback((mapId: string) => {
    readyMapRef.current = mapId;
    const pending = pendingArrivalRef.current;
    if (pending?.mapId === mapId) {
      pendingArrivalRef.current = null;
      pending.arrive();
    }
  }, []);

  // no moving or turning until a ladder climb or a lift ride is over, or
  // while the map loads
  const busyUntilRef = useRef(0);
  const busy = () => performance.now() < busyUntilRef.current || readyMapRef.current !== mapRef.current.id;

  const turnL = useCallback(() => {
    if (!busy()) setDir((d) => leftOf(d));
  }, []);
  const turnR = useCallback(() => {
    if (!busy()) setDir((d) => rightOf(d));
  }, []);

  const startOpening = useCallback(
    (cell: Vec2) => {
      const m = mapRef.current;
      pushLog(doorAt(m, cell.x, cell.y).kind === "lift" ? "The lift door slides open." : "The door slides open.");
      setOpeningDoor(cell);
      setOpenDoors((prev) => new Set(prev).add(doorCellKey(cell)));
    },
    [pushLog],
  );

  // Takes the lift the party stands in to its other deck: shuts the door,
  // rides (the next map is swapped in mid-ride, behind the closed door),
  // turns to the door there and opens it.
  const startLift = useCallback(() => {
    const from = mapRef.current;
    const cabin = posRef.current;
    const lift = liftAt(from, cabin);
    if (!lift || busy() || openingDoor) return;
    const to = MAPS[lift.to];
    const arrival = to?.lifts?.find((l) => l.to === from.id) ?? to?.lifts?.[0];
    if (!to || !arrival) {
      pushLog("The lift panel stays dark.");
      return;
    }
    const up = to.deck < from.deck;
    busyUntilRef.current = performance.now() + LIFT_CLOSE_MS + LIFT_RIDE_MS + DOOR_ANIM_MS;
    setInLift(true);
    pushLog(`You call the lift ${up ? "up" : "down"} to ${to.name}.`);

    const door = liftDoorOf(from, cabin);
    if (door && openDoorsRef.current.has(doorCellKey(door.cell))) {
      setOpenDoors((prev) => {
        const next = new Set(prev);
        next.delete(doorCellKey(door.cell));
        return next;
      });
    }

    setTimeout(() => {
      setRide({ start: performance.now(), duration: LIFT_RIDE_MS, swapAt: LIFT_SWAP_AT, up });
    }, LIFT_CLOSE_MS);

    setTimeout(() => {
      // the old deck's lift door timers mean nothing on the new one
      closeTimers.current.forEach((t) => clearTimeout(t));
      closeTimers.current.clear();
      prevPosRef.current = arrival.cell;
      readyMapRef.current = null;
      setMap(to);
      setPos(arrival.cell);
      setElevation(floorHeight(to, arrival.cell.x, arrival.cell.y));
      setOpenDoors(new Set());
    }, LIFT_CLOSE_MS + LIFT_SWAP_AT);

    // arrive when the ride is over and the deck has loaded (its loading
    // screen gone for a moment)
    // (the door stays shut until the party opens it)
    const arrive = () => {
      setRide(null);
      setInLift(false);
      busyUntilRef.current = 0;
      pushLog(`The lift arrives at ${to.name}.`);
      const arrivalDoor = liftDoorOf(to, arrival.cell);
      const facing = arrivalDoor && directionTo(arrival.cell, arrivalDoor.cell);
      if (facing) setDir(facing);
    };
    setTimeout(() => {
      if (readyMapRef.current === to.id) arrive();
      else pendingArrivalRef.current = { mapId: to.id, arrive: () => setTimeout(arrive, LIFT_SETTLE_MS) };
    }, LIFT_CLOSE_MS + LIFT_RIDE_MS);
  }, [openingDoor, pushLog]);

  // steps one cell in `moveDir` while keeping the current facing
  const step = useCallback((moveDir: Direction) => {
    if (openingDoor || busy()) return;

    const next = stepForward(pos, moveDir);
    const target = cellAt(map, next.x, next.y);

    // pressing against a lift's button wall pushes the button
    if (target === "wall" && moveDir === dir && liftAt(map, pos)?.button === moveDir) {
      startLift();
      return;
    }

    const way = passage(map, pos, elevation, next, moveDir);
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
        setElevation(way.y);
        setOpeningDoor(null);
      }, DOOR_ANIM_MS);
      return;
    }

    setPos(next);
    setElevation(way.y);
  }, [pos, dir, elevation, map, pushLog, openingDoor, openDoors, startOpening, startLift]);

  const moveForward = useCallback(() => step(dir), [step, dir]);
  const moveBackward = useCallback(() => step(behindOf(dir)), [step, dir]);

  // Use: whatever is in front of the party - for now a lift's button
  const use = useCallback(() => {
    if (liftAt(map, pos)?.button === dir) startLift();
    else pushLog("There's nothing to use here.");
  }, [map, pos, dir, startLift, pushLog]);

  // a touched (clicked, tapped) interactive decal
  const touch = useCallback(
    (action: string) => {
      if (action === "lift" && liftAt(map, pos)) startLift();
    },
    [map, pos, startLift],
  );

  // off a bridge, down onto the floor below it (null: not on one)
  const jump = useMemo(() => {
    const fall = jumpDown(map, pos, elevation);
    if (fall === null) return null;
    return () => {
      if (openingDoor || busy()) return;
      pushLog("You jump down from the bridge.");
      setElevation(floorHeight(map, pos.x, pos.y));
    };
  }, [map, pos, elevation, openingDoor, pushLog]);

  // free movement: the continuous pose drives the grid state (nearest cell,
  // facing and the surface underfoot), which the minimap and door logic read
  const syncPose = useCallback((cell: Vec2, facing: Direction, height: number) => {
    setPos((p) => (p.x === cell.x && p.y === cell.y ? p : cell));
    setDir(facing);
    setElevation(height);
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

  // dev-only: jump anywhere from the console, e.g. __voidcrewTeleport(6, 3, "S")
  const touchRef = useRef(touch);
  touchRef.current = touch;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      // `height`: stand on a bridge instead of the floor
      __voidcrewTeleport: (x: number, y: number, facing: Direction, height?: number) => {
        setPos({ x, y });
        setDir(facing);
        setElevation(height ?? floorHeight(mapRef.current, x, y));
      },
      __voidcrewPos: () => ({ ...posRef.current, map: mapRef.current.id }),
      __voidcrewTouch: (action: string) => touchRef.current(action),
    });
  }, []);

  return {
    map,
    pos,
    dir,
    elevation,
    jumpDown: jump,
    use,
    touch,
    inLift,
    ride,
    crew,
    log,
    moveForward,
    moveBackward,
    turnL,
    turnR,
    pushLog,
    openingDoor,
    openDoors,
    sceneReady,
    syncPose,
    openDoorAt,
  };
}
