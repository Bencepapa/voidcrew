import { useRef } from "react";
import type { PointerEvent } from "react";

interface SwipeHandlers {
  onForward: () => void;
  onBack: () => void;
  onTurnLeft: () => void;
  onTurnRight: () => void;
}

// shorter drags count as taps and are ignored
const MIN_SWIPE_PX = 30;

// Touch (and mouse) drag controls for the viewport, one action per swipe.
// Horizontal drags work like grabbing the view: dragging it to the left
// brings what's on the right into view, i.e. turns right. Vertical: drag up
// to step forward, down to step back.
export function useSwipeControls({ onForward, onBack, onTurnLeft, onTurnRight }: SwipeHandlers) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // keep receiving the pointer even if the drag leaves the element
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone (e.g. a synthetic event) - capture is optional
      }
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_PX) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) onTurnRight();
        else onTurnLeft();
      } else if (dy < 0) {
        onForward();
      } else {
        onBack();
      }
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
