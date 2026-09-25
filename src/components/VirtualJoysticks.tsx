import { useRef, useState } from "react";
import type { MutableRefObject, PointerEvent } from "react";
import type { FreeInput } from "../game/freeMovement";

interface Stick {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

// how far (px) the knob travels from the touch point for full deflection
const STICK_RADIUS = 50;

// Floating twin-stick controls over the game view, for free movement on
// touchscreens: a touch on the left half spawns the movement stick where the
// finger lands, one on the right half the turning stick. Axes are written to
// `axesRef` for the game loop to read every frame.
// (left stick -> moveX/moveY, right stick -> turn)
export function VirtualJoysticks({ axesRef }: { axesRef: MutableRefObject<FreeInput> }) {
  const [left, setLeft] = useState<Stick | null>(null);
  const [right, setRight] = useState<Stick | null>(null);
  const sticks = useRef<{ left: Stick | null; right: Stick | null }>({ left: null, right: null });

  function publish() {
    const deflection = (s: Stick | null) => {
      if (!s) return { x: 0, y: 0 };
      const dx = s.x - s.originX;
      const dy = s.y - s.originY;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      return { x: (dx * k) / STICK_RADIUS, y: (dy * k) / STICK_RADIUS };
    };
    const l = deflection(sticks.current.left);
    const r = deflection(sticks.current.right);
    // screen up = forward
    axesRef.current = { moveX: l.x, moveY: -l.y, turn: r.x };
    setLeft(sticks.current.left && { ...sticks.current.left });
    setRight(sticks.current.right && { ...sticks.current.right });
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // mouse users have WASD + mouselook (see useViewControls)
    if (e.pointerType === "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? "left" : "right";
    if (sticks.current[side]) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone - capture is optional
    }
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    sticks.current[side] = { pointerId: e.pointerId, originX: x, originY: y, x, y };
    publish();
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    for (const side of ["left", "right"] as const) {
      const s = sticks.current[side];
      if (s && s.pointerId === e.pointerId) {
        s.x = e.clientX - rect.left;
        s.y = e.clientY - rect.top;
        publish();
      }
    }
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    for (const side of ["left", "right"] as const) {
      if (sticks.current[side]?.pointerId === e.pointerId) sticks.current[side] = null;
    }
    publish();
  }

  return (
    <div
      className="absolute inset-0 touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {[left, right].map(
        (s, i) =>
          s && (
            <div key={i} className="pointer-events-none">
              <div
                className="absolute rounded-full border-2 border-white/30 bg-white/5"
                style={{
                  left: s.originX - STICK_RADIUS,
                  top: s.originY - STICK_RADIUS,
                  width: STICK_RADIUS * 2,
                  height: STICK_RADIUS * 2,
                }}
              />
              <div
                className="absolute rounded-full bg-white/40"
                style={(() => {
                  const dx = s.x - s.originX;
                  const dy = s.y - s.originY;
                  const len = Math.hypot(dx, dy);
                  const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
                  return { left: s.originX + dx * k - 18, top: s.originY + dy * k - 18, width: 36, height: 36 };
                })()}
              />
            </div>
          ),
      )}
    </div>
  );
}
