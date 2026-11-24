// Play mode vs. wander mode (the pure part; the store and the hooks are in playMode.ts).
//
// While the map editor is around, everything that can hurt the crew - the enemies, the traps, the
// fire - is OFF, so the editor can wander and test in peace; the Play button turns it on. A build
// where no editor can be used (guests on the Pages build, the packaged release) is always playing.

// "?play=on" -> true, "?play=off" -> false, anything else: no say
export function playParamChoice(search: string): boolean | null {
  const v = new URLSearchParams(search).get("play")?.toLowerCase();
  return v === "on" || v === "1" || v === "true" ? true : v === "off" || v === "0" || v === "false" ? false : null;
}

// Whether the world is playing (enemies and traps active):
//   1. the Play button, once it was used on this page (`toggled`) - it speaks last;
//   2. `?play=on|off` in the URL (`param`, this page load only);
//   3. otherwise: a build with an editor (a dev build, or a signed-in editor) starts in wander mode,
//      one without an editor plays.
export function resolvePlayActive(input: { param: boolean | null; editorAvailable: boolean; toggled: boolean | null }): boolean {
  return input.toggled ?? input.param ?? !input.editorAvailable;
}
