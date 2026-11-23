// The story a build ships: every .twee file in this folder, parsed once at load.
// Vite-only (import.meta.glob); the pure bundle building is in game/story/storyBundle.ts.
// No campaign file (or an empty folder): the story layer stays off and the game is unchanged.
import { buildStoryFromSources, storySources, type BuiltStory } from "../game/story/storyBundle";

const RAW = import.meta.glob<string>("./*.twee", { query: "?raw", import: "default", eager: true });

let built: BuiltStory | null | undefined;
let logged = false;

/** The bundled story, or null when this folder has no campaign file. The checker's problems are logged once. */
export function loadStory(): BuiltStory | null {
  if (built !== undefined) return built;
  const sources = storySources(RAW);
  built = sources.length ? buildStoryFromSources(sources) : null;
  if (built && !logged) {
    logged = true;
    for (const p of built.problems) {
      const where = p.passage ? `${p.file}/${p.passage}` : p.file;
      const line = `[story] ${where}: ${p.message}`;
      if (p.severity === "error") console.error(line);
      else console.warn(line);
    }
  }
  if (built && !built.bundle.campaign) {
    built = null;
    return null;
  }
  return built;
}
