// The runtime registry of dialogue libraries. Sources, later overriding earlier ones with the same id:
// (a) the .twee files bundled in src/dialogues (the id is the file name without its extension),
// (b) the local drafts of the Dialogues asset category (IndexedDB, see editor/dialogueDrafts.ts), so edits show without a rebuild.
// Parsed once, cached; rebuilt only when the drafts change.
import { useSyncExternalStore } from "react";
import { getDialogueDrafts, subscribeDialogueDrafts } from "../editor/dialogueDrafts";
import type { Dialogue } from "./dialogue";
import { buildDialogueCatalogChecked, bundledDialogueId, type CatalogEntry, type DialogueSource } from "./dialogueCatalogCore";
import { getShopIds } from "./shopCatalog";

const RAW = import.meta.glob<string>("../dialogues/*.twee", { query: "?raw", import: "default", eager: true });
const bundled: DialogueSource[] = Object.entries(RAW).map(([path, twee]) => ({ id: bundledDialogueId(path), twee }));

let drafts = getDialogueDrafts();
let catalog = new Map<string, CatalogEntry>();
let libraries: readonly Dialogue[] = [];
let built = false;
const listeners = new Set<() => void>();

function rebuild() {
  catalog = buildDialogueCatalogChecked(getShopIds(), bundled, drafts.map(d => ({ id: d.id, twee: d.twee })));
  libraries = [...catalog.values()].map(e => e.dialogue);
  built = true;
}

// (built on first use; the drafts load in the background and swap in when they're there)
const ensure = () => { if (!built) rebuild(); };
subscribeDialogueDrafts(() => {
  drafts = getDialogueDrafts();
  rebuild();
  for (const l of listeners) l();
});

export function getDialogue(libraryId: string): Dialogue | undefined {
  ensure();
  return catalog.get(libraryId)?.dialogue;
}

export function getDialogueLibraries(): readonly Dialogue[] {
  ensure();
  return libraries;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
/** For the editor's lists; re-renders when the drafts change. */
export function useDialogueLibraries(): readonly Dialogue[] {
  return useSyncExternalStore(subscribe, getDialogueLibraries);
}
