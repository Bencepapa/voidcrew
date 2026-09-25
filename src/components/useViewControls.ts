import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

// A temporary yaw offset on top of the grid facing: glancing around without
// turning. The viewport applies it (grid movement only) and eases it back
// to 0 once the input goes idle.
export interface PeekState {
  // radians, + = looking right
  offset: number;
  // performance.now() of the last input that moved it
  lastInputAt: number;
  // a finger is still dragging it - don't ease back yet
  held: boolean;
  // a released peek committed to a turn (+1 right, -1 left): the viewport,
  // when it sees the facing change, snaps the camera to it and takes 90
  // degrees off the offset in the same step, so the view carries on from
  // the released angle instead of restarting the turn
  pendingTurn: number;
}

export const MAX_PEEK = Math.PI / 3; // 60 degrees
const MOUSE_PEEK_PER_PX = MAX_PEEK / 250;
const TOUCH_PEEK_PER_PX = MAX_PEEK / 150;
// a touch peek released past this commits to a 90 degree turn
const PEEK_TURN_THRESHOLD = (35 * Math.PI) / 180;
const MOUSELOOK_PER_PX = 0.0025;
// shorter drags count as taps and are ignored
const MIN_SWIPE_PX = 30;

interface ViewControlsOptions {
  grid: boolean;
  onForward: () => void;
  onBack: () => void;
  onTurnLeft: () => void;
  onTurnRight: () => void;
  // free movement: mouselook yaw input (radians, + = right)
  onYaw: (delta: number) => void;
}

const clampPeek = (v: number) => Math.max(-MAX_PEEK, Math.min(MAX_PEEK, v));

// Pointer input on the game view.
//
// Grid movement:
// - mouse, no button: glance around (peek) up to +-60 degrees
// - touch on the left half: one action per swipe - up/down steps
//   forward/back, sideways turns as if grabbing the view (drag left = turn
//   right)
// - mouse drag, or touch on the right half: sideways drag peeks, following
//   the pointer; released far enough to one side it commits to a turn that
//   way, continuing from the released angle, released back near the middle
//   it doesn't. Up/down still steps.
//
// Free movement: clicking the view with the mouse captures it (pointer lock)
// for mouselook; touches are left to the VirtualJoysticks overlay.
export function useViewControls(opts: ViewControlsOptions) {
  const peekRef = useRef<PeekState>({ offset: 0, lastInputAt: 0, held: false, pendingTurn: 0 });
  const drag = useRef<{ id: number; x: number; y: number; peek: boolean; startOffset: number } | null>(null);
  const lockTarget = useRef<HTMLElement | null>(null);
  const [mouseLocked, setMouseLocked] = useState(false);
  const latest = useRef(opts);
  latest.current = opts;

  // free movement mouselook while the pointer is locked to the view
  useEffect(() => {
    const onLockChange = () => setMouseLocked(!!lockTarget.current && document.pointerLockElement === lockTarget.current);
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement && document.pointerLockElement === lockTarget.current) {
        latest.current.onYaw(e.movementX * MOUSELOOK_PER_PX);
      }
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMove);
    };
  }, []);

  // leaving free movement releases the mouse
  useEffect(() => {
    if (opts.grid && document.pointerLockElement) document.exitPointerLock();
  }, [opts.grid]);

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      const o = latest.current;
      if (!o.grid) {
        if (e.pointerType === "mouse") {
          lockTarget.current = e.currentTarget;
          // refused in some embedded/hidden pages - mouselook just stays off
          Promise.resolve(e.currentTarget.requestPointerLock?.()).catch(() => {});
        }
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      // a mouse drag always peeks; a touch peeks on the right half only
      const peek = e.pointerType === "mouse" || e.clientX - rect.left >= rect.width / 2;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, peek, startOffset: peekRef.current.offset };
      if (peek) peekRef.current.held = true;
      try {
        // keep receiving the pointer even if the drag leaves the element
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone - capture is optional
      }
    },

    onPointerMove(e: PointerEvent<HTMLElement>) {
      const o = latest.current;
      if (!o.grid) return;
      const peek = peekRef.current;
      const d = drag.current;
      if (d && d.id === e.pointerId) {
        if (d.peek) {
          // grab the view: dragging left looks right; continues from any
          // glance already in progress
          peek.offset = clampPeek(d.startOffset - (e.clientX - d.x) * TOUCH_PEEK_PER_PX);
          peek.lastInputAt = performance.now();
        }
        return;
      }
      if (e.pointerType === "mouse" && e.buttons === 0) {
        peek.offset = clampPeek(peek.offset + e.movementX * MOUSE_PEEK_PER_PX);
        peek.lastInputAt = performance.now();
      }
    },

    onPointerUp(e: PointerEvent<HTMLElement>) {
      const o = latest.current;
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      const peek = peekRef.current;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;

      if (d.peek) {
        peek.held = false;
        // a mostly vertical swipe on the peek side still steps
        if (Math.abs(dy) >= MIN_SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
          if (dy < 0) o.onForward();
          else o.onBack();
          return;
        }
        if (Math.abs(peek.offset) >= PEEK_TURN_THRESHOLD) {
          // hand the view over to the new facing without a jump: what was
          // a +40 degree peek becomes -50 degrees off the turned facing
          // (applied by the viewport together with the facing change),
          // which then eases back to center right away
          const right = peek.offset > 0;
          peek.pendingTurn = right ? 1 : -1;
          peek.lastInputAt = 0;
          if (right) o.onTurnRight();
          else o.onTurnLeft();
        }
        return;
      }

      if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) o.onTurnRight();
        else o.onTurnLeft();
      } else if (dy < 0) {
        o.onForward();
      } else {
        o.onBack();
      }
    },

    onPointerCancel() {
      drag.current = null;
      peekRef.current.held = false;
    },
  };

  return { handlers, peekRef, mouseLocked };
}
