import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { parseLoc, type Slot } from "../game/inventory";
import { dropTargetOf, type DropMarks, type DropTarget } from "../game/worldDrop";
import { canDropToWorld, dropInventoryItemToWorld, dropWorldItemOn } from "../game/worldDropHandler";

// Moving things between slots (the backpack's cells, the hands, a shop's): by
// dragging (pointer events, so a finger works too), or from the keyboard by
// picking an item up and putting it down. This file knows nothing of the
// inventory: a slot is an element with a `data-slot` key (see locKey in
// game/inventory.ts), and `onMove(from, to)` does the moving - it returns null
// when it was done, else why not ("full", "empty", "place").

// (`qty`: only that many of the stack, see askQty)
export type MoveFn = (from: string, to: string, qty?: number) => string | null;

interface DragState {
  from: string;
  slot: Slot;
  x: number;
  y: number;
  // the slot under the pointer
  over: string | null;
  // an item lying in the world, dragged from the 3D view (`from` is "world:<index>"): its index
  // in the map's items, and what is under the pointer besides a slot (see beginWorldDrag)
  source?: "world";
  itemIndex?: number;
  overCrew?: string | null;
  overPack?: boolean;
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
export const useDragging = () => useSyncExternalStore(subscribe, () => drag !== null);
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

// What the info area describes: the slot last clicked (it stays pinned: the
// pointer passing over other slots doesn't change it), or - while nothing is
// pinned and the pointer or the keyboard focus is on a slot - that slot.
let inspected: string | null = null;
let hovered: string | null = null;
export const useInfoSlot = () => useSyncExternalStore(subscribe, () => inspected ?? hovered);
// the slot a click pinned (the Drop button's and the D key's, when no slot has the focus)
export const pinnedSlot = (): string | null => inspected;
export const usePinnedSlot = () => useSyncExternalStore(subscribe, pinnedSlot);
export function inspectSlot(key: string | null) {
  if (inspected === key) return;
  inspected = key;
  emit();
}
// a click on a slot: pins it, and a second click on the pinned one lets go
export function pinSlot(key: string) {
  inspectSlot(inspected === key ? null : key);
}
export function hoverSlot(key: string | null) {
  if (hovered === key) return;
  hovered = key;
  emit();
}
export function clearInfo() {
  inspected = null;
  hovered = null;
  emit();
}

// (the click that ends a drag is not a click)
export const justDragged = () => performance.now() - lastDragEnd < 120;

export function clearSelection(): boolean {
  if (selected === null) return false;
  selected = null;
  emit();
  return true;
}
// Esc: an open quantity chooser closes, else a drag in progress is dropped
export function cancelDrag(): boolean {
  if (qtyAsk) {
    cancelQty();
    return true;
  }
  if (!cancelActive) return false;
  cancelActive();
  return true;
}

// --- choosing a quantity ---
// Shift+drop of a stack, or Ctrl+click on one, opens a small chooser (a number
// with - and +, see QtyPopover in InventorySlots.tsx) at the pointer; `apply`
// does the move or deal with the number chosen and returns why not (or null).
export interface QtyAsk {
  x: number;
  y: number;
  max: number;
  apply: (qty: number) => string | null;
}
let qtyAsk: QtyAsk | null = null;
export const useQtyAsk = () => useSyncExternalStore(subscribe, () => qtyAsk);
export function askQty(ask: QtyAsk) {
  qtyAsk = ask;
  emit();
}
export function cancelQty() {
  if (!qtyAsk) return;
  qtyAsk = null;
  emit();
}
export function confirmQty(qty: number) {
  const ask = qtyAsk;
  if (!ask) return;
  qtyAsk = null;
  emit();
  say(ask.apply(Math.max(1, Math.min(ask.max, Math.floor(qty) || 1))));
}

const slotUnder = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]")?.dataset.slot ?? null;

// --- onto the floor ---
// An item let go over the 3D view (an element with `data-drop-world`: the viewport, and the backdrop round the
// inventory panel) and not over a slot, the panel or a crewmate's card is dropped on the floor (see game/dropItem.ts).
export function overWorld(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest("[data-drop-world]") && !el.closest("[data-slot], [data-drop-pack], [data-drop-crew]");
}

// Drops what a slot holds (all of it, or `qty`): why not goes to the panel's notice.
export function dropSlot(key: string, qty?: number) {
  say(dropInventoryItemToWorld(key, qty));
}
// The same, asking how many first when it is a stack (a chooser at `at`).
export function dropSlotAsking(key: string, stack: number, at: { x: number; y: number }) {
  if (stack > 1) askQty({ x: at.x, y: at.y, max: stack, apply: (n) => dropInventoryItemToWorld(key, n) });
  else dropSlot(key);
}

// A drag from `from` starts at a pointer press on an item; it becomes a drag
// once the pointer has moved a few pixels (before that it is a click), and
// ends where the pointer is let go: over another slot, onMove. Esc cancels.
export function beginDrag(e: ReactPointerEvent, from: string, slot: Slot, onMove: MoveFn, maxQty: number = slot.qty) {
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
  const end = (over: string | null, ev?: PointerEvent) => {
    stop();
    if (!active) return;
    drag = null;
    lastDragEnd = performance.now();
    emit();
    if (over && over !== from) {
      selected = null;
      // (shift held when it is let go, on a stack: choose how many - a hand takes one anyway)
      if (ev?.shiftKey && maxQty > 1 && !over.startsWith("hand:")) {
        askQty({ x: ev.clientX, y: ev.clientY, max: maxQty, apply: (n) => onMove(from, over, n) });
        return;
      }
      say(onMove(from, over));
      return;
    }
    // let go over the 3D view, outside the panel: onto the floor (the whole stack; with Shift, choose how many)
    if (!over && ev && canDropToWorld() && parseLoc(from) && overWorld(ev.clientX, ev.clientY)) {
      selected = null;
      if (ev.shiftKey && maxQty > 1 && from.startsWith("pack:")) {
        askQty({ x: ev.clientX, y: ev.clientY, max: maxQty, apply: (n) => dropInventoryItemToWorld(from, n) });
        return;
      }
      say(dropInventoryItemToWorld(from));
    }
  };
  const up = (ev: PointerEvent) => end(slotUnder(ev.clientX, ev.clientY), ev);
  const cancel = () => end(null);
  // (in the capture phase: the panels stop the pointer events' bubbling)
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  cancelActive = cancel;
}

// --- an item from the world ---
// A loose item in the 3D view can be dragged onto the screen's elements: a hand box, a crewmate's
// card, the inventory button or window (the rules are in game/worldDrop.ts). The drop's target is
// found from `data-slot` (a hand or a cell), `data-drop-crew` (a card) and `data-drop-pack` (the
// button, the window) on what lies under the pointer.

// the world item's index is the one that is being dragged (the view hides its mesh meanwhile)
export const draggedWorldItem = (): number | null => (drag?.source === "world" ? (drag.itemIndex ?? null) : null);
// the crewmate whose card, and whether the inventory, is under a dragged world item (to light up)
export const useDropOverCrew = () => useSyncExternalStore(subscribe, () => (drag?.source === "world" ? (drag.overCrew ?? null) : null));
export const useDropOverPack = () => useSyncExternalStore(subscribe, () => drag?.source === "world" && !!drag.overPack);

const marksOf = (el: Element | null): DropMarks => ({
  slot: el?.closest<HTMLElement>("[data-slot]")?.dataset.slot,
  crew: el?.closest<HTMLElement>("[data-drop-crew]")?.dataset.dropCrew,
  pack: !!el?.closest("[data-drop-pack]"),
});
const within = (el: Element, x: number, y: number) => {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
// what is under a point: the top element and what it sits in first (a hand box in a card is the
// hand); then - for a card or a window that lets the pointer through (the mobile party strip does)
// - whichever of them covers the point
function dropTargetAt(x: number, y: number): DropTarget | null {
  const marks = [marksOf(document.elementFromPoint(x, y))];
  for (const el of document.querySelectorAll<HTMLElement>("[data-drop-crew]")) if (within(el, x, y)) marks.push({ crew: el.dataset.dropCrew });
  for (const el of document.querySelectorAll<HTMLElement>("[data-drop-pack]")) if (within(el, x, y)) marks.push({ pack: true });
  return dropTargetOf(marks);
}

// A press on a loose item in the 3D view (the view calls this; the press is also, until the pointer
// has moved a few pixels, a click that picks the item up). Past that it is a drag: the item shows
// under the pointer, and where it is let go the game decides (see worldDropHandler.ts). Esc or a
// cancelled pointer lets it lie.
export function beginWorldDrag(e: { clientX: number; clientY: number; pointerId: number }, index: number, slot: Slot) {
  if (drag) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
    active = true;
    const target = dropTargetAt(ev.clientX, ev.clientY);
    drag = {
      from: `world:${index}`,
      slot,
      x: ev.clientX,
      y: ev.clientY,
      over: slotUnder(ev.clientX, ev.clientY),
      source: "world",
      itemIndex: index,
      overCrew: target?.kind === "avatar" ? target.crew : null,
      overPack: target?.kind === "pack",
    };
    emit();
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !active) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancel();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", key, true);
    cancelActive = null;
  };
  const end = (target: DropTarget | null) => {
    stop();
    if (!active) return;
    drag = null;
    lastDragEnd = performance.now();
    emit();
    // (let go over nothing: it lies where it was)
    if (target) dropWorldItemOn(index, target);
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    end(active ? dropTargetAt(ev.clientX, ev.clientY) : null);
  };
  const cancel = () => end(null);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("keydown", key, true);
  cancelActive = cancel;
}

// Enter or Space on a slot (the keyboard's way to move things; a mouse click
// only shows what an item is, a move with the mouse is a drag): nothing held
// yet, an item is picked up; else what's held goes there (the same slot
// again puts it back).
export function activateSlot(key: string, hasItem: boolean, onMove: MoveFn) {
  if (justDragged()) return;
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
