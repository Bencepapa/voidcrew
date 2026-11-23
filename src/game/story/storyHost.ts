// The game's answers to the story's queries (StoryHost). Pure and injectable so it can be tested
// with a fake inventory; the live wiring is in storyRuntime.ts.
import { countOf, type Inventory } from "../inventory";
import type { StoryHost } from "./storyEngine";

export interface StoryHostSources {
  /** the live inventory (backpack + hands + overflow) */
  inventory: () => Inventory;
  /** the crew's ids (the party) */
  party: () => readonly string[];
}

export function createStoryHost(src: StoryHostSources): StoryHost {
  return {
    has: (item) => countOf(src.inventory(), item),
    party: (id) => src.party().includes(id),
  };
}
