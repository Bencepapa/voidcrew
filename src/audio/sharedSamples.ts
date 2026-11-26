import type { WorldId } from "../game/worlds";

export const SOUND_CATEGORIES = ["effect", "music", "gui"] as const;
export type SoundCategory = typeof SOUND_CATEGORIES[number];
export const SOUND_MIME = { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav" } as const;
export const SOUND_MAX_BYTES = 8 * 1024 * 1024;
export type SoundFormat = keyof typeof SOUND_MIME;
export type SoundDefinition = {
  name: string; category: SoundCategory; format: SoundFormat;
  bytes: number; duration: number; volume: number; rate: number;
};
export type SharedSample = SoundDefinition & { id: string; world: WorldId; url: string };

export const isSharedSampleId = (id: unknown): id is string =>
  typeof id === "string" && /^(fantasy|scifi)_sound_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
export const isSoundCategory = (value: unknown): value is SoundCategory =>
  SOUND_CATEGORIES.some(category => category === value);
export const isSoundFormat = (value: unknown): value is SoundFormat =>
  typeof value === "string" && Object.hasOwn(SOUND_MIME, value);
const within = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && value >= min && value <= max;

export function readSoundDefinition(raw: unknown): SoundDefinition | undefined {
  if (!raw || typeof raw !== "object") return;
  const { name, category, format, bytes, duration, volume, rate } = raw as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > 100 || !isSoundCategory(category) || !isSoundFormat(format)
    || !Number.isInteger(bytes) || !within(bytes, 1, SOUND_MAX_BYTES) || !within(duration, Number.MIN_VALUE, Number.MAX_VALUE)
    || !within(volume, 0, 1) || !within(rate, 0.5, 2)) return;
  return { name: name.trim(), category, format, bytes, duration, volume, rate };
}

const samples = new Map<string, SharedSample>();
const listeners = new Set<() => void>();
let snapshot: readonly SharedSample[] = [];
const revisionOf = (url: string) => Number(/\/r(\d+)\/sound\.[a-z]+$/.exec(url)?.[1] ?? 0);
export const sharedSample = (id: unknown) => typeof id === "string" ? samples.get(id) : undefined;
export const sharedSamples = () => snapshot;
export function subscribeSharedSamples(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function registerSharedSamples(entries: Iterable<SharedSample>) {
  let changed = false;
  for (const entry of entries) {
    const previous = samples.get(entry.id);
    if (previous && (previous.url === entry.url || revisionOf(previous.url) > revisionOf(entry.url))) continue;
    samples.set(entry.id, entry);
    changed = true;
  }
  if (!changed) return;
  snapshot = [...samples.values()];
  for (const listener of listeners) listener();
}
