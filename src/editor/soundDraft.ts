import { SOUND_MAX_BYTES, SOUND_MIME, isSoundFormat, type SharedSample, type SoundDefinition } from "../audio/sharedSamples";
import type { WorldId } from "../game/worlds";

export type SoundDraft = Pick<SharedSample, "id" | "world"> & Pick<SoundDefinition, "name" | "category" | "volume" | "rate">
  & Partial<Pick<SoundDefinition, "format" | "bytes" | "duration">> & { blob?: Blob; originalUrl?: string };

export async function readSoundFile(file: File) {
  const format = file.name.split(".").pop()?.toLowerCase();
  if (!isSoundFormat(format) || !file.size || file.size > SOUND_MAX_BYTES) throw new Error("Invalid sound file");
  const blob = file.slice(0, file.size, SOUND_MIME[format]);
  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const fail = () => reject(new Error("Could not read sound metadata"));
      const timeout = setTimeout(fail, 8000);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration);
        else fail();
      };
      audio.onerror = () => { clearTimeout(timeout); fail(); };
      audio.src = url;
    });
    return { blob, format, bytes: blob.size, duration };
  } finally {
    audio.onloadedmetadata = audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}

export const newSoundId = (world: WorldId) => `${world}_sound_${crypto.randomUUID()}`;
