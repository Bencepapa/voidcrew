// Pure parts of the map autosave (see mapDrafts.ts): fingerprints and the
// decision what to do with a stored draft. No browser or app imports, so it
// can be run with tsx (mapDraftLogic.test.ts).

export interface MapDraft {
  id: string;
  savedAt: number;
  // fingerprint of the map as loaded/saved last when the draft was made
  baseFp: string;
  file: unknown;
}

// FNV-1a over the JSON text, plus its length (cheap, stable, not secret)
export function fingerprintText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + ":" + text.length;
}
export const fingerprint = (file: unknown) => fingerprintText(JSON.stringify(file));

// a draft this big is not stored (the browser may refuse it, and it would
// stall every edit)
export const MAX_DRAFT_CHARS = 16_000_000;

export type DraftPlan =
  | { kind: "none" }
  // the draft equals the current map: nothing to restore, drop it
  | { kind: "same" }
  // restore it; `stale`: the base changed since the draft was made
  | { kind: "restore"; stale: boolean };

export function planDraft(draft: MapDraft | undefined, base: unknown): DraftPlan {
  if (!draft) return { kind: "none" };
  const baseFp = fingerprint(base);
  if (fingerprint(draft.file) === baseFp) return { kind: "same" };
  return { kind: "restore", stale: draft.baseFp !== baseFp };
}
