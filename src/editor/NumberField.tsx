import { useEffect, useRef, useState } from "react";
import { formatNumber } from "../i18n";

// A number the editor's way (EDITOR_UI_PLAN.md, section 6): drag it sideways
// to change it, click it to type it. One component for every number in the
// inspector; with `min` and `max` and `slider`, a thin bar behind the digits
// shows where it stands (a chance, an intensity), else it is just a number
// (a height, a turn).
//
//  - drag (more than DRAG_PX): changes the value; Shift: fine (a tenth),
//    Ctrl: coarse (ten times); snapped to `step`
//  - click without a drag: a text field (Enter takes it, Esc leaves it)
//  - focused: the arrow keys and the wheel step it (Shift: ten steps)
//  - double click on the label: the default
//  - `onChange` is told on every step of a drag, `onCommit` once when it ends
//    (a drag is one undo step: merge the edits with a key, see applyEdit)

const DRAG_PX = 3;

export interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  // when a drag or typed value is finished
  onCommit?: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  // the step of the arrows and the grid a drag snaps to
  step?: number;
  // value per pixel dragged (default: a step every 4 px; a slider: its whole length across the field)
  speed?: number;
  // decimals shown (default: as many as the step has)
  digits?: number;
  unit?: string;
  // what a double click on the label sets
  defaultValue?: number;
  // a bar behind the digits (needs min and max)
  slider?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}

const decimalsOf = (step: number) => {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
};

export function NumberField({
  value,
  onChange,
  onCommit,
  label,
  min,
  max,
  step = 1,
  speed,
  digits,
  unit,
  defaultValue,
  slider = false,
  disabled,
  title,
  className = "",
}: NumberFieldProps) {
  const shownDigits = digits ?? decimalsOf(step);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const snap = (v: number) => clamp(Math.round(v / step) * step);
  // the value as a number with no float noise (0.1 + 0.2)
  const tidy = (v: number) => Number(v.toFixed(Math.max(shownDigits, decimalsOf(step), 4)));

  const typing = useRef(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean; width: number; last: number } | null>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  // A drag changes the value at most once a frame: a mouse reports faster than the screen draws, and every
  // change is the whole editor drawn again (the map re-parsed, the view told). The last value of a drag is
  // always sent (see flush), before it is committed.
  const latestChange = useRef(onChange);
  latestChange.current = onChange;
  const frame = useRef<number | null>(null);
  const queued = useRef<number | null>(null);
  const flush = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (queued.current !== null) {
      const v = queued.current;
      queued.current = null;
      latestChange.current(v);
    }
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const set = (v: number, commit = false) => {
    const next = tidy(snap(v));
    if (drag.current) drag.current.last = next;
    if (commit) {
      flush();
      onChange(next);
      onCommit?.(next);
      return;
    }
    queued.current = next;
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        flush();
      });
    }
  };

  const pointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || editing || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    drag.current = { last: value, x: e.clientX, start: value, moved: false, width: box.current?.getBoundingClientRect().width || 100 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* (a pointer the browser doesn't know) */
    }
  };
  const pointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_PX) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    const fine = e.shiftKey ? 0.1 : e.ctrlKey ? 10 : 1;
    const perPx = speed ?? (slider && min !== undefined && max !== undefined ? (max - min) / d.width : step / 4);
    set(d.start + dx * perPx * fine);
  };
  const pointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* (nothing held) */
    }
    setDragging(false);
    if (!d) return;
    if (d.moved) {
      flush();
      onCommit?.(d.last);
    } else if (!disabled) {
      setText(formatNumber(value, shownDigits).replace(/\s/g, ""));
      typing.current = true;
      setEditing(true);
    }
  };

  const finishTyping = (accept: boolean) => {
    if (!typing.current) return;
    typing.current = false;
    setEditing(false);
    if (!accept) return;
    const parsed = Number(text.replace(",", ".").replace(/[^\d.+\-eE]/g, ""));
    if (Number.isFinite(parsed) && text.trim() !== "") set(parsed, true);
  };

  const stepBy = (direction: number, e: { shiftKey: boolean; ctrlKey?: boolean }) =>
    set(value + direction * step * (e.shiftKey ? 10 : 1), true);

  const fill = slider && min !== undefined && max !== undefined && max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : null;

  return (
    <div className={`flex items-center gap-2 text-[11px] ${disabled ? "opacity-40" : ""} ${className}`} title={title}>
      {label && (
        <span
          className="min-w-0 max-w-[55%] break-words text-neutral-300 select-none"
          onDoubleClick={() => defaultValue !== undefined && !disabled && set(defaultValue, true)}
        >
          {label}
        </span>
      )}
      <div
        ref={box}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => { const d=drag.current; drag.current=null; setDragging(false); if(d?.moved) onCommit?.(d.last); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (disabled || editing) return;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            stepBy(1, e);
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            stepBy(-1, e);
          } else if (e.key === "Enter") {
            e.preventDefault();
            setText(formatNumber(value, shownDigits).replace(/\s/g, ""));
            typing.current = true;
      setEditing(true);
          }
        }}
        onWheel={(e) => {
          if (disabled || editing || document.activeElement !== e.currentTarget) return;
          e.stopPropagation();
          stepBy(e.deltaY < 0 ? 1 : -1, e);
        }}
        className={`relative min-w-0 flex-1 overflow-hidden rounded-sm border bg-neutral-800 px-1.5 py-0.5 font-mono text-right text-neutral-100 outline-none select-none touch-none ${
          dragging ? "border-amber-400" : "border-neutral-700 hover:border-neutral-500 focus-visible:border-amber-400"
        } ${disabled ? "" : "cursor-ew-resize"}`}
      >
        {fill !== null && <span className="pointer-events-none absolute inset-y-0 left-0 bg-amber-400/25" style={{ width: `${fill * 100}%` }} />}
        {editing ? (
          <input
            ref={input}
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => finishTyping(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishTyping(true);
              else if (e.key === "Escape") finishTyping(false);
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="relative w-full bg-transparent text-right outline-none"
          />
        ) : (
          <span className="relative">
            {formatNumber(value, shownDigits)}
            {unit ? <span className="text-neutral-400"> {unit}</span> : null}
          </span>
        )}
      </div>
    </div>
  );
}
