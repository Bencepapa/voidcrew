import * as THREE from "three";
import { isTextEntry } from "../../keyboardFocus";
import { TOPDOWN_FOV, TOPDOWN_ZOOM_MIN, TOPDOWN_ZOOM_MAX } from "./camera";
import type { ViewportRef } from "./contracts";

interface TopdownControlsContext {
  canvas: HTMLCanvasElement;
  topdown: { on: boolean; x: number; z: number; h: number; tilt: number; yaw: number };
  editModeRef: ViewportRef<boolean>;
  setTopdown(on: boolean): void;
}

export function createTopdownControls({ canvas, topdown, editModeRef, setTopdown }: TopdownControlsContext) {

  // The top-down view's input: O switches it (editing only); WASD / arrows
  // pan and Q / E turn it - taken before the game's own keys (this runs in
  // the capture phase), so the party doesn't walk; the wheel zooms
  // (Ctrl+wheel tilts); the middle button drags the map.
  const topdownKeys = new Set<string>();
  const typingIn = isTextEntry;
  const onTopdownKey = (e: KeyboardEvent) => {
    if (typingIn(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (e.type === "keydown" && key === "o" && editModeRef.current && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setTopdown(!topdown.on);
      return;
    }
    if (!topdown.on) return;
    if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "keydown") topdownKeys.add(key);
      else topdownKeys.delete(key);
    }
    if (key === "shift") {
      if (e.type === "keydown") topdownKeys.add("Shift");
      else topdownKeys.delete("Shift");
    }
  };
  window.addEventListener("keydown", onTopdownKey, true);
  window.addEventListener("keyup", onTopdownKey, true);
  const onTopdownBlur = () => topdownKeys.clear();
  window.addEventListener("blur", onTopdownBlur);
  const onTopdownWheel = (e: WheelEvent) => {
    if (!topdown.on) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey) topdown.tilt = Math.min(Math.PI / 2, Math.max(0.5, topdown.tilt - Math.sign(e.deltaY) * 0.06));
    else topdown.h = Math.min(TOPDOWN_ZOOM_MAX, Math.max(TOPDOWN_ZOOM_MIN, topdown.h * Math.exp(e.deltaY * 0.0012)));
  };
  canvas.addEventListener("wheel", onTopdownWheel, { capture: true, passive: false });
  let topdownPan: { x: number; y: number } | null = null;
  const onTopdownDown = (e: PointerEvent) => {
    if (!topdown.on || e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    topdownPan = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onTopdownMove = (e: PointerEvent) => {
    if (!topdownPan) return;
    const rect = canvas.getBoundingClientRect();
    // cells per pixel at the looked-at floor
    const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(TOPDOWN_FOV) / 2) * (topdown.h / Math.sin(topdown.tilt))) / Math.max(1, rect.height);
    const dx = (e.clientX - topdownPan.x) * perPx;
    const dy = (e.clientY - topdownPan.y) * perPx;
    const sy = Math.sin(topdown.yaw);
    const cy = Math.cos(topdown.yaw);
    // (dragging the map: the view moves the other way)
    topdown.x -= cy * dx - (sy * dy) / Math.sin(topdown.tilt);
    topdown.z -= sy * dx + (cy * dy) / Math.sin(topdown.tilt);
    topdownPan = { x: e.clientX, y: e.clientY };
  };
  const onTopdownUp = (e: PointerEvent) => {
    if (!topdownPan) return;
    topdownPan = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerdown", onTopdownDown, true);
  canvas.addEventListener("pointermove", onTopdownMove);
  canvas.addEventListener("pointerup", onTopdownUp);

  function dispose() {
    canvas.removeEventListener("pointerup", onTopdownUp);
    canvas.removeEventListener("pointermove", onTopdownMove);
    canvas.removeEventListener("pointerdown", onTopdownDown, true);
    canvas.removeEventListener("wheel", onTopdownWheel, true);
    window.removeEventListener("blur", onTopdownBlur);
    window.removeEventListener("keyup", onTopdownKey, true);
    window.removeEventListener("keydown", onTopdownKey, true);
  }
  return { keys: topdownKeys, dispose };
}
