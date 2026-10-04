import { useEffect, useState } from "react";
import { revivalText } from "./RunSummary";

// The whole crew down (see useGameState's wipedAt): the view, fallen to the
// floor, slowly goes dark - the robots wander back to their rounds - then
// word from the base: the crew was given up and woken again as clones. The
// haul is lost.
const FADE_DELAY_MS = 1200;
const FADE_MS = 4500;
const MESSAGE_AT_MS = 6000;

export function WipeScreen({
  wipedAt,
  lost,
  revival,
  onContinue,
}: {
  // when it happened (performance.now())
  wipedAt: number;
  // the haul left behind: how many items
  lost: number;
  revival: { down: number; medkits: number; credits: number; crew: number };
  onContinue: () => void;
}) {
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState(false);
  useEffect(() => {
    const since = performance.now() - wipedAt;
    const timers = [
      setTimeout(() => setDark(true), Math.max(0, FADE_DELAY_MS - since)),
      setTimeout(() => setMessage(true), Math.max(0, MESSAGE_AT_MS - since)),
    ];
    return () => timers.forEach(clearTimeout);
  }, [wipedAt]);

  return (
    <div className="absolute inset-0 z-40 font-mono" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black" style={{ opacity: dark ? 0.92 : 0, transition: `opacity ${FADE_MS}ms ease-in` }} />
      {message && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-[26rem] max-w-full border border-red-900/80 bg-neutral-950/95 p-4 text-[12px] text-neutral-300">
            <div className="text-red-300 text-sm tracking-widest mb-2">SIGNAL LOST</div>
            <p className="mb-2">
              Weeks went by without a word from the crew. At the base they were written off - and their backup clones
              woken from the tanks.
            </p>
            <p className="text-neutral-400 mb-1">
              {lost ? `The haul (${lost} item${lost > 1 ? "s" : ""}) stays on the derelict.` : "Nothing was lost but the crew."}
            </p>
            <p className="text-neutral-400 mb-4">{revivalText(revival)}</p>
            <button type="button" onClick={onContinue} className="w-full border border-red-800 text-red-200 py-1.5 hover:bg-red-900/20">
              Back to base
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
