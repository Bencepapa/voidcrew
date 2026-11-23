// Building a StoryBundle from the raw .twee sources (the Vite glob lives in src/story/load.ts,
// so this part stays pure and testable with node/tsx).
import { checkSources, type StoryProblem } from "./storyCheck";
import type { StoryBundle } from "./storyParse";

export interface StorySource { id: string; twee: string }
export interface BuiltStory { bundle: StoryBundle; problems: StoryProblem[] }

/** File id from a path: "src/story/npc-kovacs.twee" -> "npc-kovacs". */
export const storyFileId = (path: string): string => (path.split(/[\\/]/).pop() ?? path).replace(/\.twee$/i, "");

/** The glob's path -> text map as sources, sorted by id so the bundle order is stable. */
export function storySources(files: Readonly<Record<string, string>>): StorySource[] {
  return Object.entries(files)
    .map(([path, twee]) => ({ id: storyFileId(path), twee }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Parse and check the sources; the campaign is `bundle.campaign` (undefined when there is no campaign file). */
export function buildStoryFromSources(sources: readonly StorySource[]): BuiltStory {
  return checkSources(sources);
}
