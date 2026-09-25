import { useCallback, useEffect, useRef } from "react";
import { nearestDirection, poseCell, stepFreePose, yawOf } from "./freeMovement";
import type { FreeInput, FreePose } from "./freeMovement";
import { doorCellKey } from "./useGameState";
import { floorHeight } from "./map";
import type { Direction, GameMap, Vec2 } from "./types";

interface FreeMovementOptions {
  enabled: boolean;
  map: GameMap;
  pos: Vec2;
  dir: Direction;
  openDoors: ReadonlySet<string>;
  openingDoor: Vec2 | null;
  syncPose: (cell: Vec2, facing: Direction) => void;
  openDoorAt: (cell: Vec2) => void;
}

const clampAxis = (v: number) => Math.max(-1, Math.min(1, v));

// standing in a cell's center, facing a grid direction
function gridPose(map: GameMap, pos: Vec2, dir: Direction): FreePose {
  return { x: pos.x, z: pos.y, y: floorHeight(map, pos.x, pos.y), fallSpeed: 0, yaw: yawOf(dir) };
}

// Free movement driver. The viewport calls `tick(dt)` every frame; it reads
// the keyboard (W/S or up/down: move, A/D: strafe, Q/E or left/right: turn),
// the virtual joysticks (`axesRef`) and mouselook (`addYaw`), advances the
// pose with collision, opens doors bumped into, and keeps the grid game
// state on the nearest cell and facing.
export function useFreeMovement(opts: FreeMovementOptions) {
  const { enabled } = opts;
  const poseRef = useRef<FreePose>(gridPose(opts.map, opts.pos, opts.dir));
  // virtual joystick input, written by the VirtualJoysticks overlay
  const axesRef = useRef<FreeInput>({ moveX: 0, moveY: 0, turn: 0 });
  const keysRef = useRef(new Set<string>());
  // mouselook yaw collected since the last frame
  const pendingYawRef = useRef(0);
  const lastSyncRef = useRef("");
  const latest = useRef(opts);
  latest.current = opts;

  // entering free mode starts from where the grid movement left the player
  useEffect(() => {
    if (!enabled) return;
    const { map, pos, dir } = latest.current;
    poseRef.current = gridPose(map, pos, dir);
    lastSyncRef.current = "";
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const keys = keysRef.current;
    const down = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    // a key released while the window had no focus would otherwise stick
    const clear = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      keys.clear();
    };
  }, [enabled]);

  const tick = useCallback((dt: number): FreePose => {
    const o = latest.current;
    const keys = keysRef.current;
    const held = (...names: string[]) => (names.some((n) => keys.has(n)) ? 1 : 0);
    const axes = axesRef.current;
    const input = {
      moveY: clampAxis(axes.moveY + held("w", "arrowup") - held("s", "arrowdown")),
      moveX: clampAxis(axes.moveX + held("d") - held("a")),
      turn: clampAxis(axes.turn + held("e", "arrowright") - held("q", "arrowleft")),
    };
    if (pendingYawRef.current) {
      poseRef.current = { ...poseRef.current, yaw: poseRef.current.yaw + pendingYawRef.current };
      pendingYawRef.current = 0;
    }

    const opening = o.openingDoor;
    const doors = {
      // a door counts as open once its panel has finished sliding up
      isOpen: (c: Vec2) =>
        o.openDoors.has(doorCellKey(c)) && !(opening && opening.x === c.x && opening.y === c.y),
    };
    const { pose, bumpedDoor } = stepFreePose(poseRef.current, input, dt, o.map, doors);
    poseRef.current = pose;
    // dev-only: inspect from the console (e.g. while testing with a hidden tab)
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewPose: pose, __voidcrewInput: input });
    if (bumpedDoor) o.openDoorAt(bumpedDoor);

    const cell = poseCell(pose);
    const facing = nearestDirection(pose.yaw);
    const sync = `${cell.x},${cell.y},${facing}`;
    if (sync !== lastSyncRef.current) {
      lastSyncRef.current = sync;
      o.syncPose(cell, facing);
    }
    return pose;
  }, []);

  const addYaw = useCallback((delta: number) => {
    pendingYawRef.current += delta;
  }, []);

  return { tick, axesRef, addYaw };
}
