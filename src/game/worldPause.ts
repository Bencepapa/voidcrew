import type { Interaction } from "./interactions";

// What the open window over the game (a popup, the inventory) does to the
// world behind it. One place decides, so the clock, the actors, the party's
// moves and turns, and the view's mouse input can't disagree.
// The shop window opens inside a dialogue popup, so it's covered by the
// dialogue being the active interaction (see DialoguePopup).
export interface WorldPause {
  // the game clock stands still and nothing moves on its own (actors, timers)
  pausesWorld: boolean;
  // the party can't move, turn or use things (keys, buttons, joysticks)
  blocksParty: boolean;
  // the mouse isn't the view's (no glancing round, no mouselook capture)
  blocksView: boolean;
}

export function worldPause(interaction: Interaction | null | undefined, inventoryShown: boolean): WorldPause {
  const talking = interaction?.kind === "dialogue";
  const modalMessage = interaction?.kind === "message" && interaction.modal;
  const image = interaction?.kind === "image";
  return {
    pausesWorld: inventoryShown || talking || modalMessage || image,
    blocksParty: inventoryShown || talking || modalMessage,
    blocksView: inventoryShown || !!interaction,
  };
}
