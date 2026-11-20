// The dialogue libraries a game knows, from their .twee sources (pure: see dialogueCatalog.ts for where they come from).
import { parseTwee, type Dialogue, type DialogueProblem } from "./dialogue";

export interface DialogueSource { id: string; twee: string }
export interface CatalogEntry { dialogue: Dialogue; problems: DialogueProblem[] }

/** "../dialogues/void-fantasy.twee" -> "void-fantasy" */
export const bundledDialogueId = (path: string): string => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]*$/, "");

/** Every source parsed; a later source replaces an earlier one with the same id. Order: by id. */
export function buildDialogueCatalog(...layers: readonly (readonly DialogueSource[])[]): Map<string, CatalogEntry> {
  return buildDialogueCatalogChecked(undefined, ...layers);
}

/** The same, warning about `@shop` ids that are not in `knownShops` (undefined: not checked). */
export function buildDialogueCatalogChecked(knownShops: ReadonlySet<string> | undefined, ...layers: readonly (readonly DialogueSource[])[]): Map<string, CatalogEntry> {
  const sources = new Map<string, string>();
  for (const layer of layers) for (const s of layer) sources.set(s.id, s.twee);
  const out = new Map<string, CatalogEntry>();
  for (const id of [...sources.keys()].sort((a, b) => a.localeCompare(b))) {
    try {
      out.set(id, parseTwee(sources.get(id)!, id, knownShops));
    } catch (error) {
      console.error(`dialogue library "${id}" can't be read`, error);
    }
  }
  return out;
}
