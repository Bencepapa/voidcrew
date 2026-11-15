import { useContext, useEffect, useRef } from "react";
import { CommitContext } from "./inspector/parts";

// Native colour pickers emit input while dragging, then change on release.
export function ColorField({value, onChange}: {value: string; onChange: (color: string) => void}) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const commit = useContext(CommitContext);
  const frame = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const dirty = useRef(false);
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (pending.current !== null) {
      const color = pending.current;
      pending.current = null;
      latest.current(color);
    }
  };
  const finish = () => {
    flush();
    if (dirty.current) { dirty.current = false; commit(); }
  };
  useEffect(() => {
    const el = input.current!;
    const release = () => { finish(); el.blur(); };
    el.addEventListener("change", release);
    return () => {
      el.removeEventListener("change", release);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [commit]);
  return <input ref={input} type="color" value={value} onChange={() => { /* native input/change handle the gesture */ }}
    onInput={e => {
      dirty.current = true;
      pending.current = e.currentTarget.value;
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    }}
    onBlur={finish}
    onKeyDown={e => { if (e.key === "Enter") { finish(); e.currentTarget.blur(); } }}
    className="w-7 h-6 bg-transparent border border-neutral-600" />;
}
