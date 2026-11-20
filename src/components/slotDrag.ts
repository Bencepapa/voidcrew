import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { Slot } from "../game/inventory";

// Moving things between slots (the backpack's cells, the hands - and, later,
// a shop's): by dragging (pointer events, so a finger works too) or by
// clicking an item and then where it goes. This file knows nothing of the
// inventory: a slot is an element with a `data-slot` key (see locKey in
// game/inventory.ts), and `onMove(from, to)` does the moving - it returns null
// when it was done, else why not ("full", "empty", "place").

export type MoveFn = (from: string, to: string) => string | null;

interface DragState {
  from: string;
  slot: Slot;
  x: number;
  y: number;
  // the slot under the pointer
  over: string | null;
}

let drag: DragState | null = null;
let selected: string | null = null;
let notice: string | null = null;
let lastDragEnd = -1000;
let cancelActive: (() => void) | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getDrag = () => drag;
export const useDrag = () => useSyncExternalStore(subscribe, getDrag);
export const useSelectedSlot = () => useSyncExternalStore(subscribe, () => selected);
// why the last move didn't happen (it clears itself)
export const useSlotNotice = () => useSyncExternalStore(subscribe, () => notice);
// what a slot is to the drag and the selection: the one being dragged or picked up, the one a drag is over
export type SlotStatus = "idle" | "source" | "over" | "picked";
export const useSlotStatus = (key: string): SlotStatus =>
  useSyncExternalStore(subscribe, (): SlotStatus => (drag?.over === key && drag.from !== key ? "over" : drag?.from === key ? "source" : selected === key ? "picked" : "idle"));

function say(reason: string | null) {
  if (noticeTimer) clearTimeout(noticeTimer);
  notice = reason && reason !== "same" ? reason : null;
  emit();
  if (notice) {
    noticeTimer = setTimeout(() => {
      notice = null;
      emit();
    }, 2500);
  }
}

export function clearSelection(): boolean {
  if (selected === null) return false;
  selected = null;
  emit();
  return true;
}
export function cancelDrag(): boolean {
  if (!cancelActive) return false;
  cancelActive();
  return true;
}

const slotUnder = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]")?.dataset.slot ?? null;

// A drag from `from` starts at a pointer press on an item; it becomes a drag
// once the pointer has moved a few pixels (before that it is a click), and
// ends where the pointer is let go: over another slot, onMove. Esc cancels.
export function beginDrag(e: ReactPointerEvent, from: string, slot: Slot, onMove: MoveFn) {
  if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;
  const move = (ev: PointerEvent) => {
    if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
    active = true;
    drag = { from, slot, x: ev.clientX, y: ev.clientY, over: slotUnder(ev.clientX, ev.clientY) };
    emit();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    cancelActive = null;
  };
  const end = (over: string | null) => {
    stop();
    if (!active) return;
    drag = null;
    lastDragEnd = performance.now();
    emit();
    if (over && over !== from) {
      selected = null;
      say(onMove(from, over));
    }
  };
  const up = (ev: PointerEvent) => end(slotUnder(ev.clientX, ev.clientY));
  const cancel = () => end(null);
  // (in the capture phase: the panels stop the pointer events' bubbling)
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  cancelActive = cancel;
}

// A click (or Enter) on a slot: nothing picked up yet, an item is picked up;
// else what's picked up goes there (the same slot again puts it back).
export function activateSlot(key: string, hasItem: boolean, onMove: MoveFn) {
  // (the click that ends a drag is not a click)
  if (performance.now() - lastDragEnd < 120) return;
  if (selected === null) {
    if (hasItem) {
      selected = key;
      say(null);
    }
    return;
  }
  const from = selected;
  selected = null;
  say(from === key ? null : onMove(from, key));
}
