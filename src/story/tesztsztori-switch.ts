// tesztsztori: remove together (see TESZTSZTORI-REMOVE.md).
// The on/off switch of the test story (src/story/tesztsztori-*.twee). A campaign file in this folder turns the whole
// story layer on, so the test story is only loaded when it is asked for:
//   - the page was opened (or the editor's map picker moved the URL) to a map whose id starts with "tesztsztori"
//     (?map=tesztsztori, ?map=tesztsztori-labirintus), or
//   - ?story=on in the URL, or localStorage "voidcrew-story" = "on" (force on for any map);
//   - ?story=off or localStorage "voidcrew-story" = "off" always wins (force off).
// Pure (the caller passes the URL's search string and the stored value), so it is testable under node.

export const TESZTSZTORI = "tesztsztori";
export const STORY_FLAG_KEY = "voidcrew-story";

export function testStoryWanted(search: string, stored: string | null): boolean {
  const params = new URLSearchParams(search);
  const flag = params.get("story") ?? stored;
  if (flag === "off") return false;
  if (flag === "on") return true;
  return (params.get("map") ?? "").startsWith(TESZTSZTORI);
}

/** The switch as the browser has it (no window / no storage: off). */
export function testStoryOn(): boolean {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORY_FLAG_KEY) : null;
  } catch {
    // (no storage: only the URL decides)
  }
  return testStoryWanted(typeof location !== "undefined" ? location.search : "", stored);
}

/** Whether a story file id belongs to the test story. */
export const isTestStoryFile = (id: string): boolean => id.startsWith(TESZTSZTORI);
