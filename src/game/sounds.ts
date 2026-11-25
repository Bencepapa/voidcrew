// Sound emitters: a generated sound placed in a cell of a map, like a light or a smoke emitter - a beep (a tone) or
// hiss (noise) that the player hears in 3D, muffled by walls and coming through doorways (see audio/soundField.ts).
// There is no sound file: the engine (audio/engine.ts) makes the wave from these few numbers.
//
// A map file lists them as `sounds`; the file's values are read here (readSound): junk is dropped or limited, so a
// hand-edited file can't make the engine misbehave. Positions are in cells (x east, y south - the map's rows - and
// `pos` from the cell's middle and floor: across, up in wall heights, along), the same as a smoke emitter's.
import type { Vec2 } from "./types";

export const SOUND_KINDS = ["tone", "noise"] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];
export const SOUND_WAVES = ["sine", "triangle", "saw", "square"] as const;
export type SoundWave = (typeof SOUND_WAVES)[number];
export const NOISE_COLORS = ["white", "pink", "brown"] as const;
export type NoiseColor = (typeof NOISE_COLORS)[number];

export interface SoundPulse {
  // seconds sounding, then seconds silent, over and over
  on: number;
  off: number;
  // seconds the burst takes to swell in / die away (0..1, default short): the gate is smoothed, not a switch
  attack?: number;
  release?: number;
}

export interface SoundSpec {
  // the cell (the map's column and row)
  x: number;
  y: number;
  // from the cell's middle and floor: across, up (wall heights), along; unset: the middle, at chest height
  pos?: [number, number, number];
  kind: SoundKind;
  // a tone's wave form (default sine) and pitch in Hz (default 440)
  wave?: SoundWave;
  pitch?: number;
  // a noise's colour (default white)
  noise?: NoiseColor;
  // 0..1
  volume: number;
  // unset: it sounds all the time (a loop); else it beeps in bursts
  pulse?: SoundPulse;
  // cells: from this far off it is not heard at all (it fades out well before)
  range: number;
  // how fast it dies away with distance (default 1: like the air does; 0.5 carries far, 3 is gone quickly)
  rolloff?: number;
  // false: silent until something switches it on (a lever, button or plate: an operable target of kind "sound")
  active?: boolean;
  // a name for the operable targets to address it by (like a smoke emitter's), instead of its cell
  id?: string;
}

export const SOUND_LIMITS = {
  pitch: { min: 55, max: 2000, default: 440 },
  volume: { min: 0, max: 1, default: 0.6 },
  range: { min: 0.25, max: 32, default: 4 },
  rolloff: { min: 0.5, max: 3, default: 1 },
  pulse: { min: 0, max: 60 },
  // a pulse's attack and release (seconds)
  edge: { min: 0, max: 1, default: 0.02 },
  // the spot in its cell: across and along (cells), up (wall heights)
  across: { min: -0.5, max: 0.5 },
  up: { min: 0, max: 8, default: 0.5 },
} as const;

// the longest `id` kept
const SOUND_ID_MAX = 60;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const limit = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

// A sound as a map file gives it, cleaned: undefined when it is no sound at all (no cell, no known kind), else every
// number limited to its range and what doesn't belong to its kind left off. A missing volume and range get their
// defaults. `active` is kept only when false (the default is on).
export function readSound(raw: unknown): SoundSpec | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const s = raw as Record<string, unknown>;
  if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) return undefined;
  if (!(SOUND_KINDS as readonly unknown[]).includes(s.kind)) return undefined;
  const kind = s.kind as SoundKind;
  const out: SoundSpec = {
    x: s.x as number,
    y: s.y as number,
    kind,
    volume: finite(s.volume) ? round(limit(s.volume, SOUND_LIMITS.volume.min, SOUND_LIMITS.volume.max)) : SOUND_LIMITS.volume.default,
    range: finite(s.range) ? round(limit(s.range, SOUND_LIMITS.range.min, SOUND_LIMITS.range.max)) : SOUND_LIMITS.range.default,
  };
  if (Array.isArray(s.pos) && s.pos.length === 3 && s.pos.every(finite)) {
    const [dx, up, dz] = s.pos as number[];
    out.pos = [
      round(limit(dx, SOUND_LIMITS.across.min, SOUND_LIMITS.across.max)),
      round(limit(up, SOUND_LIMITS.up.min, SOUND_LIMITS.up.max)),
      round(limit(dz, SOUND_LIMITS.across.min, SOUND_LIMITS.across.max)),
    ];
  }
  if (kind === "tone") {
    if ((SOUND_WAVES as readonly unknown[]).includes(s.wave)) out.wave = s.wave as SoundWave;
    if (finite(s.pitch)) out.pitch = round(limit(s.pitch, SOUND_LIMITS.pitch.min, SOUND_LIMITS.pitch.max), 1);
  } else if ((NOISE_COLORS as readonly unknown[]).includes(s.noise)) {
    out.noise = s.noise as NoiseColor;
  }
  const pulse = s.pulse as Record<string, unknown> | null | undefined;
  if (pulse && typeof pulse === "object" && finite(pulse.on) && finite(pulse.off)) {
    out.pulse = { on: round(limit(pulse.on, SOUND_LIMITS.pulse.min, SOUND_LIMITS.pulse.max)), off: round(limit(pulse.off, SOUND_LIMITS.pulse.min, SOUND_LIMITS.pulse.max)) };
    if (finite(pulse.attack)) out.pulse.attack = round(limit(pulse.attack, SOUND_LIMITS.edge.min, SOUND_LIMITS.edge.max), 3);
    if (finite(pulse.release)) out.pulse.release = round(limit(pulse.release, SOUND_LIMITS.edge.min, SOUND_LIMITS.edge.max), 3);
  }
  if (finite(s.rolloff)) out.rolloff = round(limit(s.rolloff, SOUND_LIMITS.rolloff.min, SOUND_LIMITS.rolloff.max));
  if (s.active === false) out.active = false;
  if (typeof s.id === "string" && s.id.trim()) out.id = s.id.trim().slice(0, SOUND_ID_MAX);
  return out;
}

// A new sound for a cell, made as the Sound tool puts one in: the settings of the last one worked on (`template`), else
// a plain beep. Cleaned like any sound read from a file.
export function newSound(x: number, y: number, template: Record<string, unknown> = {}): SoundSpec {
  // (a name belongs to one sound: it is not handed on to the next)
  return readSound({ kind: "tone", ...template, x, y, id: undefined }) as SoundSpec;
}

// the whole list of a map file: the sounds that are sounds, in order (the editor addresses them by index, so a
// dropped one shifts the rest - only a hand-damaged file has any)
export function readSounds(raw: unknown): SoundSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const sound = readSound(entry);
    return sound ? [sound] : [];
  });
}

// A sound with every default filled in: what the engine plays.
export interface ResolvedSound {
  kind: SoundKind;
  wave: SoundWave;
  pitch: number;
  noise: NoiseColor;
  volume: number;
  pulse?: Required<SoundPulse>;
  range: number;
  rolloff: number;
  active: boolean;
  // the spot in its cell
  pos: [number, number, number];
}

export function resolveSound(spec: SoundSpec): ResolvedSound {
  return {
    kind: spec.kind,
    wave: spec.wave ?? "sine",
    pitch: spec.pitch ?? SOUND_LIMITS.pitch.default,
    noise: spec.noise ?? "white",
    volume: spec.volume,
    // (an `off` of nothing is no pulse at all: it never stops)
    pulse:
      spec.pulse && spec.pulse.off > 0
        ? { on: spec.pulse.on, off: spec.pulse.off, attack: spec.pulse.attack ?? SOUND_LIMITS.edge.default, release: spec.pulse.release ?? SOUND_LIMITS.edge.default }
        : undefined,
    range: spec.range,
    rolloff: spec.rolloff ?? SOUND_LIMITS.rolloff.default,
    active: spec.active !== false,
    pos: spec.pos ?? [0, SOUND_LIMITS.up.default, 0],
  };
}

// What makes two sounds the same wave (the engine makes the buffer once for each): volume, range, pulse and the
// rest are applied while it plays, not baked in.
export function waveKey(sound: Pick<ResolvedSound, "kind" | "wave" | "pitch" | "noise">): string {
  return sound.kind === "tone" ? `tone:${sound.wave}:${sound.pitch}` : `noise:${sound.noise}`;
}

// Whether a pulse is sounding `t` seconds in (the cycle starts sounding). Without a pulse: always.
export function pulseOn(pulse: SoundPulse | undefined, t: number): boolean {
  if (!pulse) return true;
  const cycle = pulse.on + pulse.off;
  if (cycle <= 0) return true;
  return ((t % cycle) + cycle) % cycle < pulse.on;
}

// A pulse with some of its settings changed, as the map keeps it: an attack or release left at the default is not
// written (a pulse is `{ on, off }` unless it asks for more).
export function changePulse(pulse: SoundPulse, patch: Partial<SoundPulse>): SoundPulse {
  const next = { ...pulse, ...patch };
  const out: SoundPulse = { on: next.on, off: next.off };
  if (next.attack !== undefined && next.attack !== SOUND_LIMITS.edge.default) out.attack = next.attack;
  if (next.release !== undefined && next.release !== SOUND_LIMITS.edge.default) out.release = next.release;
  return out;
}

// The map's sounds as editor problems (see editor/validate.ts): a sound that makes nothing, or reaches nowhere.
export interface SoundProblem {
  code: "soundSilent" | "soundNoRange" | "soundPulseZero";
  cell: Vec2;
  index: number;
}
export function soundProblems(sounds: readonly Pick<SoundSpec, "x" | "y" | "kind" | "volume" | "range" | "pulse">[] | undefined): SoundProblem[] {
  const out: SoundProblem[] = [];
  (sounds ?? []).forEach((s, index) => {
    const cell = { x: s.x, y: s.y };
    if (s.volume <= 0) out.push({ code: "soundSilent", cell, index });
    if (s.range < 1) out.push({ code: "soundNoRange", cell, index });
    if (s.pulse && (s.pulse.on <= 0 || s.pulse.off <= 0)) out.push({ code: "soundPulseZero", cell, index });
  });
  return out;
}
