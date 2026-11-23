// "Save later": a save is wanted often, but only allowed while no dialogue, shop or cutscene is on.
// A refused request stays pending and goes through at the next flush (when one of them ends).
export interface SaveGate {
  /** a save is wanted: it runs now if allowed, else waits */
  request(): void;
  /** something that blocked saving ended: run the waiting save if allowed */
  flush(): void;
  readonly pending: boolean;
}

export function createSaveGate(canSave: () => boolean, save: () => void): SaveGate {
  let pending = false;
  const gate: SaveGate = {
    request() { pending = true; gate.flush(); },
    flush() {
      if (!pending || !canSave()) return;
      pending = false;
      save();
    },
    get pending() { return pending; },
  };
  return gate;
}

/** The host's canSave: the engine's own (dialogue, shop, cutscene) and an old dialogue library's window. */
export const hostCanSave = (engineCanSave: boolean, externalDialogue: boolean): boolean => engineCanSave && !externalDialogue;
