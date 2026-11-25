// The sound engine: Howler (on Web Audio) behind a small surface - voices that start, move, are set and stop - so the
// game's sound logic (soundSystem.ts) and the rest of the game know nothing of the library, and another one can take
// its place. The master volume and the mute switch live here too.
//
// Units: the world is in cells (x east, z south, y up), the same as the three.js scene, so a position is passed on as
// it is. Distances are not left to the panner (its falloff is switched off): the loudness of a voice comes from the
// sound logic, which knows ranges and doorways (see soundField.ts); the panner only turns a position into left/right
// (and, with HRTF, front/back).
//
// FRAGILE: Howler has no hook for effects. A voice's chain is   source -> panner -> gain node -> master,   and the
// filters (the ear's shadow behind the listener, the muffling of walls, the loudness and the pulse's gate) go between
// the panner and the gain node: `Howl._soundById(id)` and the sound's `_panner` and `_node` are Howler's internals.
// That is touched in `wire` and `unwire` below and nowhere else - if Howler changes them (it is pinned at 2.2.4), this
// is the one place to mend (or to replace with raw Web Audio nodes).
import { Howl, Howler } from "howler";
import { noiseWave, toneWave, wavBytes } from "./synth";
import { behindness, rearFilter } from "./soundField";
import type { Listener } from "./soundField";
import type { SoundBackend, VoiceState, WaveSpec } from "./soundSystem";
import { waveKey } from "../game/sounds";

// ---- the master: volume and mute, kept between sessions

export interface SoundSettings {
  // 0..1
  volume: number;
  muted: boolean;
}
const STORAGE_KEY = "voidcrew-sound";
const DEFAULT_SETTINGS: SoundSettings = { volume: 0.8, muted: false };

function loadSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SoundSettings> | null;
    return {
      volume: typeof saved?.volume === "number" && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : DEFAULT_SETTINGS.volume,
      muted: saved?.muted === true,
    };
  } catch {
    // (no storage, or a damaged value: the defaults)
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
const listeners = new Set<() => void>();

export const getSoundSettings = (): SoundSettings => settings;
export function subscribeSoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
function applySettings() {
  try {
    Howler.volume(settings.volume);
    Howler.mute(settings.muted);
  } catch {
    /* no audio */
  }
}
function changeSettings(next: SoundSettings) {
  settings = next;
  applySettings();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* (not kept) */
  }
  for (const listener of listeners) listener();
}
export const setMasterVolume = (volume: number) => changeSettings({ ...settings, volume: Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0)) });
export const setMuted = (muted: boolean) => changeSettings({ ...settings, muted });
applySettings();

// ---- the audio context: unlocked by the first touch, and asleep while the page is hidden

const context = () => Howler.ctx as AudioContext | undefined;
function wake() {
  const ctx = context();
  if (ctx && ctx.state === "suspended" && !(typeof document !== "undefined" && document.hidden)) void ctx.resume().catch(() => {});
}
if (typeof window !== "undefined") {
  // (Howler unlocks the context on a touch or click itself; a key press or a pointer press counts here as well)
  window.addEventListener("pointerdown", wake, { passive: true });
  window.addEventListener("keydown", wake, { passive: true });
}
if (typeof document !== "undefined") {
  // a hidden page draws no frames: the pulses and positions would freeze, and a held beep go on for ever
  document.addEventListener("visibilitychange", () => {
    const ctx = context();
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}

// ---- the limiter: many voices at once must not clip

let limited = false;
function ensureLimiter() {
  if (limited) return;
  const ctx = context();
  if (!ctx) return;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  Howler.masterGain.disconnect();
  Howler.masterGain.connect(limiter);
  limiter.connect(ctx.destination);
  limited = true;
}

// ---- the sounds: one Howl for each wave, made once (the sample buffer is generated once, never a file)

const howls = new Map<string, Howl>();
function howlFor(spec: WaveSpec): Howl {
  const key = waveKey(spec);
  let howl = howls.get(key);
  if (!howl) {
    const wave = spec.kind === "tone" ? toneWave(spec.wave, spec.pitch) : noiseWave(spec.noise);
    const url = URL.createObjectURL(new Blob([wavBytes(wave)], { type: "audio/wav" }));
    howl = new Howl({ src: [url], format: ["wav"], loop: true, volume: 1, preload: true });
    howls.set(key, howl);
  }
  return howl;
}

// ---- panning

// Equal-power panning is what plays well on speakers (clear left / right); HRTF adds front / back cues, which only
// show on headphones.
let hrtf = false;
export const isHrtf = () => hrtf;
export function setHrtf(on: boolean) {
  hrtf = on;
  for (const voice of voices) if (voice.ready) voice.howl.pannerAttr({ panningModel: panningModel() }, voice.id);
}
const panningModel = () => (hrtf ? ("HRTF" as const) : ("equalpower" as const));
// (the panner makes no distance falloff: refDistance huge, rolloff none)
const pannerOptions = () => ({ panningModel: panningModel(), distanceModel: "inverse" as const, refDistance: 1, maxDistance: 10000, rolloffFactor: 0 });

// The ear's shadow: a sound behind the listener is duller and quieter (see soundField.rearFilter).
let rearDull = true;
export const isRearDull = () => rearDull;
export function setRearDull(on: boolean) {
  rearDull = on;
}

// ---- the listener

let listener: Listener = { x: 0, y: 0.5, z: 0, fx: 0, fz: -1 };
export const getListener = (): Listener => listener;
function setListener(next: Listener) {
  listener = next;
  const ctx = context();
  if (!ctx) return;
  try {
    Howler.pos(next.x, next.y, next.z);
    Howler.orientation(next.fx, 0, next.fz, 0, 1, 0);
  } catch {
    /* no audio: nothing to move */
  }
}

// ---- voices

interface Chain {
  rear: BiquadFilterNode;
  rearLevel: GainNode;
  muffleA: BiquadFilterNode;
  muffleB: BiquadFilterNode;
  wallLevel: GainNode;
  level: GainNode;
  gate: GainNode;
  nodes: AudioNode[];
}
interface HowlerSound {
  _node: GainNode;
  _panner?: PannerNode;
}
export interface Voice {
  howl: Howl;
  id: number;
  // false until the buffer is loaded and the voice is wired
  ready: boolean;
  stopping: boolean;
  want: VoiceState | null;
  chain: Chain | null;
}
const voices = new Set<Voice>();

const soundOf = (voice: Voice) => (voice.howl as unknown as { _soundById(id: number): HowlerSound | null })._soundById(voice.id);

// Puts the chain between the voice's panner and its gain node (see the note at the top). False if Howler does not
// give us the nodes.
function wire(voice: Voice): boolean {
  const ctx = context();
  const sound = soundOf(voice);
  if (!ctx || !sound?._panner || !sound._node) return false;
  const lowpass = () => {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.value = 18000;
    return filter;
  };
  const gain = (value: number) => {
    const node = ctx.createGain();
    node.gain.value = value;
    return node;
  };
  const chain: Chain = {
    rear: lowpass(),
    rearLevel: gain(1),
    muffleA: lowpass(),
    muffleB: lowpass(),
    wallLevel: gain(1),
    // (silent until the first state says how loud: a voice fades in)
    level: gain(0),
    gate: gain(0),
    nodes: [],
  };
  chain.nodes = [chain.rear, chain.rearLevel, chain.muffleA, chain.muffleB, chain.wallLevel, chain.level, chain.gate];
  sound._panner.disconnect();
  sound._panner.connect(chain.rear);
  chain.nodes.forEach((node, i) => {
    if (i < chain.nodes.length - 1) node.connect(chain.nodes[i + 1]);
  });
  chain.gate.connect(sound._node);
  voice.chain = chain;
  return true;
}

// the chain taken out again: Howler hands the sound on to the next voice, and it must find its own wiring there
function unwire(voice: Voice) {
  const chain = voice.chain;
  if (!chain) return;
  try {
    const sound = soundOf(voice);
    if (sound?._panner && sound._node) {
      sound._panner.disconnect();
      sound._panner.connect(sound._node);
    }
  } catch {
    /* (gone with its Howl) */
  }
  for (const node of chain.nodes) node.disconnect();
  voice.chain = null;
}

function attach(voice: Voice) {
  if (voice.stopping) {
    voices.delete(voice);
    return;
  }
  try {
    ensureLimiter();
    const { howl } = voice;
    voice.id = howl.play();
    howl.volume(1, voice.id);
    // (this makes the panner)
    howl.pos(listener.x, listener.y, listener.z, voice.id);
    howl.pannerAttr(pannerOptions(), voice.id);
    if (!wire(voice)) throw new Error("no panner");
    voice.ready = true;
    if (voice.want) apply(voice, voice.want, true);
  } catch (error) {
    console.warn("[sound] could not start a voice", error);
    voices.delete(voice);
    voice.stopping = true;
  }
}

// `fresh`: put the values in at once (a voice that has just started must not open and then glide to where it belongs)
function apply(voice: Voice, state: VoiceState, fresh = false) {
  const ctx = context();
  const chain = voice.chain;
  if (!ctx || !chain) return;
  const t = ctx.currentTime;
  const nyquist = ctx.sampleRate * 0.45;
  const to = (param: AudioParam, value: number, constant: number) => {
    if (fresh) param.value = value;
    else param.setTargetAtTime(value, t, constant);
  };
  voice.howl.pos(state.x, state.y, state.z, voice.id);
  const ear = rearFilter(rearDull ? behindness(listener, state.x, state.z) : 0);
  to(chain.rear.frequency, Math.min(ear.cutoff, nyquist), 0.05);
  to(chain.rearLevel.gain, ear.gain, 0.05);
  const cutoff = Math.min(state.cutoff, nyquist);
  to(chain.muffleA.frequency, cutoff, 0.05);
  to(chain.muffleB.frequency, cutoff, 0.05);
  to(chain.wallLevel.gain, state.wallGain, 0.05);
  // (about a tenth of a second to fade in or out; the pulse's gate switches faster)
  to(chain.level.gain, state.level, 0.03);
  to(chain.gate.gain, state.gate, 0.006);
}

function start(spec: WaveSpec): Voice | null {
  try {
    const howl = howlFor(spec);
    const voice: Voice = { howl, id: -1, ready: false, stopping: false, want: null, chain: null };
    voices.add(voice);
    if (howl.state() === "loaded") attach(voice);
    else howl.once("load", () => attach(voice));
    return voice;
  } catch (error) {
    console.warn("[sound] could not start a voice", error);
    return null;
  }
}

function set(voice: Voice, state: VoiceState) {
  if (voice.stopping) return;
  voice.want = state;
  if (voice.ready) apply(voice, state);
}

function stop(voice: Voice) {
  if (voice.stopping) return;
  voice.stopping = true;
  const chain = voice.chain;
  const ctx = context();
  if (!voice.ready || !chain || !ctx) {
    voices.delete(voice);
    return;
  }
  chain.level.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  setTimeout(() => {
    unwire(voice);
    try {
      voice.howl.stop(voice.id);
    } catch {
      /* (already gone) */
    }
    voices.delete(voice);
  }, 250);
}

export const engine: SoundBackend<Voice> = { start, set, stop, setListener };

// the context's state, its rate, and how many voices there are (the Debug panel's line)
export function engineStatus(): { state: string; sampleRate: number; voices: number } {
  const ctx = context();
  return { state: ctx?.state ?? "(not started)", sampleRate: ctx?.sampleRate ?? 0, voices: voices.size };
}
