// Local preview maps of textures that can't be edited (built-in and old shared
// ones): a map imported in the Assets window just to see it in the preview room.
// They live in IndexedDB as Blobs. The old version kept them as base64 strings
// in localStorage ("asset-preview:<id>"), which filled the browser's storage;
// those keys are moved over once and removed.

import { idb } from "./idb";
import type { Channel } from "./materialMaps";

export type PreviewMaps = Partial<Record<Channel, Blob | "">>;
interface PreviewRecord { id: string; maps: PreviewMaps }

export async function readPreview(id: string): Promise<PreviewMaps> {
  return (await idb.get<PreviewRecord>("previews", id))?.maps ?? {};
}

export async function writePreview(id: string, maps: PreviewMaps): Promise<void> {
  if (Object.values(maps).every(v => v === undefined)) await idb.del("previews", id);
  else await idb.put("previews", { id, maps } satisfies PreviewRecord);
}

const PREFIX = "asset-preview:";
let migrated: Promise<void> | undefined;

// Reads each old localStorage entry into the new store, then removes it. An
// entry that can't be moved (or parsed) is left (or dropped if unreadable) and
// never stops the window from opening.
export function migrateLegacyPreviews(): Promise<void> {
  migrated ??= (async () => {
    let keys: string[] = [];
    try { keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX)); } catch { return; }
    for (const key of keys) {
      try {
        const old = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string | undefined>;
        const maps: PreviewMaps = {};
        for (const [channel, url] of Object.entries(old)) {
          if (url === "") maps[channel as Channel] = "";
          else if (typeof url === "string" && url.startsWith("data:")) maps[channel as Channel] = await (await fetch(url)).blob();
        }
        const id = key.slice(PREFIX.length);
        const existing = await readPreview(id);
        await writePreview(id, { ...maps, ...existing });
        localStorage.removeItem(key);
      } catch (error) {
        if (error instanceof SyntaxError) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
        /* else: IndexedDB isn't usable now; the key stays for the next time */
      }
    }
  })();
  return migrated;
}
