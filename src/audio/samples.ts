// The built-in sound samples: real recordings that ship with the code (public/sounds/*.mp3, served as plain static files
// next to the page - not from the shared store). A sound emitter of kind "sample" names one by its id (game/sounds.ts).
// Pure: the registry and the url maths only; the engine (engine.ts) loads and plays them.
//
// `loop` tells how a sample plays: a long, loopable recording keeps sounding (a fire, birds), a one-shot plays once and
// (with an `interval` on the emitter) again after a pause. `gain` evens out the loudness of the recordings: the engine
// multiplies the voice's level by it. Measured in the browser (decoded, mono mix, 50 ms windows, the RMS over the windows
// within 30 dB of the loudest): the recordings sat between -43.7 and -27.5 dBFS; the gains bring each to about -36 dBFS,
// and none is raised past a peak of about -1 dBFS (fire-crackle: its RMS asks for 2.43, 2.2 is kept).
export type SampleCategory = "nature" | "fire" | "creature" | "craft";

export interface SampleDef {
  // the name shown in the editor (Hungarian; the English one is the i18n key `sound.sample.<id>`)
  name: string;
  // the file in public/sounds
  file: string;
  loop: boolean;
  gain: number;
  category: SampleCategory;
}

export const SAMPLES = {
  "birds-forest": { name: "Madarak az erdőben", file: "birds-forest.mp3", loop: true, gain: 2.09, category: "nature" },
  "fire-crackle": { name: "Tűzropogás (kicsi)", file: "fire-crackle.mp3", loop: true, gain: 2.2, category: "fire" },
  "fireplace-loop": { name: "Kandalló-hurok", file: "fireplace-loop.mp3", loop: true, gain: 0.77, category: "fire" },
  "crackling-fire": { name: "Ropogó tűz", file: "crackling-fire.mp3", loop: true, gain: 0.8, category: "fire" },
  "goblin-cackle": { name: "Goblin kacaj", file: "goblin-cackle.mp3", loop: false, gain: 0.68, category: "creature" },
  "goblin-death": { name: "Goblin halál", file: "goblin-death.mp3", loop: false, gain: 0.38, category: "creature" },
  hammer: { name: "Kalapács", file: "hammer.mp3", loop: false, gain: 1.43, category: "craft" },
} as const satisfies Record<string, SampleDef>;

export type SampleId = keyof typeof SAMPLES;
export const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];

export function isSampleId(id: unknown): id is SampleId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SAMPLES, id);
}

// The url of a sample's file under the page's base (Vite's BASE_URL, with or without the closing slash).
export function sampleUrl(id: SampleId, baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}sounds/${SAMPLES[id].file}`;
}

// The sample a new one-shot emitter starts with: pause between plays (seconds), as the editor puts it.
export const DEFAULT_INTERVAL = { min: 3, max: 8 } as const;
// The sample a new emitter is made from.
export const DEFAULT_SAMPLE: SampleId = "fire-crackle";

// What choosing a sample changes in an emitter (the editor's patch): its kind and id; a one-shot gets a pause (the one
// it has, else the default), a loop none. The speed is left as it is.
export function samplePatch(id: SampleId, current?: { min: number; max: number }): { kind: "sample"; sample: SampleId; interval: { min: number; max: number } | undefined } {
  return { kind: "sample", sample: id, interval: SAMPLES[id].loop ? undefined : current ? { ...current } : { ...DEFAULT_INTERVAL } };
}
