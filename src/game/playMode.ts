// Play mode: whether the enemies and the traps are active (see playModeLogic.ts for the rules).
//
// One flag, `playActive`: the enemies act and the traps fire only while it is true. A page load
// in a build with an editor (a dev build, or a signed-in editor - see sharedAuth.ts) starts it
// FALSE ("wander mode": nothing hurts the crew); any other build is always playing and shows no
// Play button. Not stored: every page load starts afresh (but it is kept while switching maps).
// `?play=on|off` in the URL speaks for the page load; the Play button speaks after that.

import { useSyncExternalStore } from "react";
import { sharedToken, subscribeSharedAuth } from "../editor/sharedAuth";
import { playParamChoice, resolvePlayActive } from "./playModeLogic";

const hasWindow = typeof window !== "undefined";
const param = hasWindow ? playParamChoice(window.location.search) : null;
let toggled: boolean | null = null;

// an editor can be used here: the dev build (the editor's own machine) or a signed-in editor
export const editorAvailable = (): boolean => import.meta.env.DEV || !!sharedToken();

const compute = () => resolvePlayActive({ param, editorAvailable: editorAvailable(), toggled });
let active = compute();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const update = () => {
  const next = compute();
  if (next === active) return;
  active = next;
  for (const listener of listeners) listener();
};
// signing in as an editor (or out) changes what the default is
subscribeSharedAuth(update);

export const playActive = (): boolean => active;
export function setPlayActive(on: boolean) {
  toggled = on;
  update();
}
export const usePlayActive = () => useSyncExternalStore(subscribe, playActive);

// Whether the traps are armed. The traps (operable props) call this: a trap that is not armed does
// nothing - no damage, no trigger. It is the same flag as `playActive`, so the Play button arms and
// disarms every trap at once.
export const trapsActive = (): boolean => active;
export const useTrapsActive = (): boolean => usePlayActive();

// whether the Play button is shown (a build without an editor is always playing)
const subscribeEditor = (listener: () => void) => subscribeSharedAuth(listener);
export const useEditorAvailable = () => useSyncExternalStore(subscribeEditor, editorAvailable);
