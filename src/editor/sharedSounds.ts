import { useSyncExternalStore } from "react";
import { readSoundDefinition, registerSharedSamples, sharedSamples, subscribeSharedSamples, type SoundDefinition } from "../audio/sharedSamples";
import type { WorldId } from "../game/worlds";
import { loadDefinitions, publishDefinition } from "./sharedDefinitions";

export const useSharedSounds = () => useSyncExternalStore(subscribeSharedSamples, sharedSamples);

const soundFile = (definition: SoundDefinition) => `sound.${definition.format}`;

export async function loadSharedSounds(world: WorldId, init?: RequestInit, only?: ReadonlySet<string>) {
  const definitions = await loadDefinitions(world, "sound", (raw, base) => {
    const definition = readSoundDefinition(raw);
    if (definition) return { ...definition, url: base + soundFile(definition) };
  }, init, only);
  registerSharedSamples([...definitions].map(([id, definition]) => ({ ...definition, id, world })));
}

export async function publishSharedSound(world: WorldId, id: string, definition: SoundDefinition, blob: Blob) {
  const name = soundFile(definition);
  const base = await publishDefinition(world, "sound", id, definition, [{ name, blob }]);
  registerSharedSamples([{ ...definition, id, world, url: base + name }]);
}
