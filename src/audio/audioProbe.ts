// The Debug panel's sound test buttons (the "Sound (probe)" section): samples (a fire crackle, a goblin's cackle) put at
// places round the listener, to hear the 3D sound by hand - panning as the party turns, the highs lost behind and through walls, many
// voices at once. They play through the same engine as the map's sound emitters (engine.ts) and take the same maths
// (soundField.ts): only the places and the lengths are made up here. Nothing is saved.
import { currentRoom, engine, engineStatus, getListener, type Voice } from "./engine";
import { wetSend } from "./roomMix";
import { attenuation, distanceTo, muffle } from "./soundField";
import { stereoPan } from "./stereo";
import type { VoiceState, WaveSpec } from "./soundSystem";

// the looping test sample, and the one-shot one
const FIRE: WaveSpec = { kind: "sample", wave: "sine", pitch: 440, noise: "white", sample: "fire-crackle", rate: 1 };
const CACKLE: WaveSpec = { kind: "sample", wave: "sine", pitch: 440, noise: "white", sample: "goblin-cackle", rate: 1 };
// how far a test sound reaches (cells)
const RANGE = 40;

export interface ProbeSource {
  /** world position, in cells */
  x: number; y: number; z: number;
  /** how many walls are taken to be in the way (0..3): the muffling of a house */
  walls?: number;
  /** the goblin's cackle (a one-shot) instead of the fire's crackle (a loop) */
  cackle?: boolean;
  /** 0..1 (default 1) */
  volume?: number;
}

const probeVoices = new Set<Voice>();

// how a probe voice is set: loudness from the distance (as a sound emitter's is), dulled by its walls
function stateOf(source: ProbeSource): VoiceState {
  const wall = muffle(source.walls ?? 0);
  const listener = getListener();
  const distance = distanceTo(listener, source);
  const level = 0.7 * (source.volume ?? 1) * attenuation(distance, RANGE, 1);
  const pan = stereoPan(listener, source.x, source.z, { distance, level });
  // (the test voices echo in the listener's room too: a way to hear the zones without placing a sound)
  const send = wetSend(currentRoom()?.acoustics.reverb ?? 0, distance);
  return { x: source.x, y: source.y, z: source.z, pan, level, gate: 1, attack: 0, release: 0, cutoff: wall.cutoff, wallGain: wall.gain, send };
}

/** Plays one voice of the test sound at a world position for a moment (it stays there while the listener turns and walks). */
export function playAt(source: ProbeSource, ms = 3000): void {
  const voice = engine.start(source.cackle ? CACKLE : FIRE);
  if (!voice) return;
  engine.set(voice, stateOf(source));
  probeVoices.add(voice);
  setTimeout(() => {
    engine.stop(voice);
    probeVoices.delete(voice);
  }, ms);
}

/** Where the world is relative to the listener: `ahead` and `right` in cells. */
export function relative(ahead: number, right: number, up = 0): ProbeSource {
  const l = getListener();
  // the right-hand side of a forward vector (fx, fz) on the ground plane (x east, z south): (-fz, fx)
  return { x: l.x + l.fx * ahead - l.fz * right, y: l.y + up, z: l.z + l.fz * ahead + l.fx * right };
}

/** Plays many voices at once, spread round the listener (the pool check). */
export function playMany(count: number): number {
  const l = getListener();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const distance = 2 + (i % 5);
    playAt({ x: l.x + Math.cos(angle) * distance, y: l.y, z: l.z + Math.sin(angle) * distance, volume: 0.3 });
  }
  return count;
}

let orbit: { timer: ReturnType<typeof setInterval>; voice: Voice } | undefined;
/** One voice circling the listener's spot for about six seconds, to hear the panning move. */
export function playOrbit(): void {
  stopOrbit();
  const voice = engine.start(FIRE);
  if (!voice) return;
  const centre = { ...getListener() };
  const began = performance.now();
  const place = (t: number): ProbeSource => ({ x: centre.x + Math.cos((t / 6) * Math.PI * 2) * 3, y: centre.y, z: centre.z + Math.sin((t / 6) * Math.PI * 2) * 3 });
  engine.set(voice, stateOf(place(0)));
  const timer = setInterval(() => {
    const t = (performance.now() - began) / 1000;
    if (t > 6) {
      stopOrbit();
      return;
    }
    engine.set(voice, stateOf(place(t)));
  }, 30);
  orbit = { timer, voice };
}

export function stopOrbit() {
  if (!orbit) return;
  clearInterval(orbit.timer);
  engine.stop(orbit.voice);
  orbit = undefined;
}

export function stopAllProbes() {
  stopOrbit();
  for (const voice of probeVoices) engine.stop(voice);
  probeVoices.clear();
}

export interface ProbeStatus { state: string; sampleRate: number; active: number }
export function probeStatus(): ProbeStatus {
  const { state, sampleRate, voices } = engineStatus();
  return { state, sampleRate, active: voices };
}
