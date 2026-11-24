// Whether the game loads the whole shared store by itself. Pure, so it can be tested.
//
// Guests (the plain Pages build) must not: every page load would list and download the
// store, which is where the Supabase egress went (concept/supabase-egress-audit.md).
// Order of precedence: `?shared=on|off` in the URL (this page load only), then the
// browser's stored switch (the Debug panel), then the default: on for a signed-in
// editor and in a dev build (the editor's own machine), off for everyone else.

export type SharedChoice = "on" | "off" | null;

/** The `?shared=` URL parameter: "on"/"1"/"true" or "off"/"0"/"false"; anything else is no choice. */
export function sharedParamChoice(search: string): SharedChoice {
  const value = new URLSearchParams(search).get("shared")?.toLowerCase();
  if (value === "on" || value === "1" || value === "true") return "on";
  if (value === "off" || value === "0" || value === "false") return "off";
  return null;
}

/** The stored switch ("1" / "0"); nothing stored (or anything else) is no choice. */
export function storedChoice(raw: string | null | undefined): SharedChoice {
  return raw === "1" ? "on" : raw === "0" ? "off" : null;
}

export function resolveAutoShared(input: { param: SharedChoice; stored: SharedChoice; signedIn: boolean; dev: boolean }): boolean {
  const explicit = input.param ?? input.stored;
  if (explicit) return explicit === "on";
  return input.signedIn || input.dev;
}
