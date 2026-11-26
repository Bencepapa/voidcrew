// The sound engine: Howler (on Web Audio) behind a small surface - voices that start, move, are set and stop - so the
// game's sound logic (soundSystem.ts) and the rest of the game know nothing of the library, and another one can take
// its place. The master volume, the mute switch and the "behind" strength live here too.
//
// Units: the world is in cells (x east, z south, y up), the same as the three.js scene. Distances are not left to the
// panner (its falloff is switched off): the loudness of a voice comes from the sound logic, which knows ranges and
// doorways (see soundField.ts). The left / right balance comes from the sound logic as well (`VoiceState.pan`, see
// stereo.ts) and is played by a stereo panner; with the HRTF switch on, Howler's 3D panner takes the voice's place
// instead and works the balance (and front / back) out from the position.
//
// Nothing jumps: every number that comes in (the balance, the loudness, the walls' filter, the shadow behind the
// listener, the place) is chased by an exponential approach on its own time constant (smoothing.ts), a voice fades in
// and out (the doorway's voice slowly), and a pulse's gate follows its attack and release.
//
// The rooms' echo (reverbBus.ts): each voice also sends a share of itself, from after its fade, to one echo bus whose
// convolver follows the listener's room (the sound system tells it: `setRoom`); the bus plays into Howler's master gain.
//
// FRAGILE: Howler has no hook for effects. A voice's chain is   source -> panner -> gain node -> master,   and the
// filters (the ear's shadow behind the listener, the muffling of walls, the loudness, the pulse's gate and the fade)
// go between the panner and the gain node: `Howl._soundById(id)` and the sound's `_panner` (a StereoPannerNode after
// `stereo()`, a PannerNode after `pos()`) and `_node` are Howler's internals. That is touched in `wire` and `unwire`
// below and nowhere else - if Howler changes them (it is pinned at 2.2.4), this is the one place to mend (or to replace
// with raw Web Audio nodes).
import { Howl, Howler } from "howler";
import { noiseWave, toneWave, wavBytes } from "./synth";
import { behindness } from "./soundField";
import { DEFAULT_REAR_STRENGTH, rearFilter } from "./rear";
import { createStereoMeter, type Levels, type StereoMeter } from "./meter";
import { Smoother, TAU, gateTimeConstant } from "./smoothing";
import { createReverbBus, type ReverbBus } from "./reverbBus";
import { DEFAULT_REVERB_AMOUNT, masterSend } from "./roomMix";
import type { Place } from "./acoustics";
import type { Listener } from "./soundField";
import type { SoundBackend, StartOptions, VoiceState, WaveSpec } from "./soundSystem";
import { waveKey } from "../game/sounds";
import { sampleSource } from "./samples";

// ---- the master: volume and mute, kept between sessions

export interface SoundSettings {
  // 0..1
  volume: number;
  muted: boolean;
  // how much a sound behind the listener is dulled, 0..1 (0: not at all; see rear.ts)
  rearStrength: number;
  // the echo of the rooms (see reverbBus.ts): the master slider 0..1 (0.6 plays the zones' own numbers as they are), and a switch
  reverbAmount: number;
  reverbOn: boolean;
}
const STORAGE_KEY = "voidcrew-sound";
const DEFAULT_SETTINGS: SoundSettings = { volume: 0.8, muted: false, rearStrength: DEFAULT_REAR_STRENGTH, reverbAmount: DEFAULT_REVERB_AMOUNT, reverbOn: true };
const unit = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

function loadSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SoundSettings> | null;
    return {
      volume: unit(saved?.volume, DEFAULT_SETTINGS.volume),
      muted: saved?.muted === true,
      rearStrength: unit(saved?.rearStrength, DEFAULT_SETTINGS.rearStrength),
      reverbAmount: unit(saved?.reverbAmount, DEFAULT_SETTINGS.reverbAmount),
      reverbOn: saved?.reverbOn !== false,
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
export const setMasterVolume = (volume: number) => changeSettings({ ...settings, volume: unit(volume, 0) });
export const setMuted = (muted: boolean) => changeSettings({ ...settings, muted });
// (the voices follow it at their next state: it is smoothed like everything else)
export const setRearStrength = (strength: number) => changeSettings({ ...settings, rearStrength: unit(strength, DEFAULT_SETTINGS.rearStrength) });
export const setReverbAmount = (amount: number) => changeSettings({ ...settings, reverbAmount: unit(amount, DEFAULT_SETTINGS.reverbAmount) });
export const setReverbOn = (on: boolean) => changeSettings({ ...settings, reverbOn: on });
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

// ---- the limiter: many voices at once must not clip; and the meter after it

let limited = false;
let meter: StereoMeter | null = null;
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
  try {
    meter = createStereoMeter(ctx, limiter);
  } catch {
    meter = null;
  }
  limited = true;
}

// what the master plays now: the left and right RMS (linear); zero before anything has started
export function outputLevels(): Levels {
  return meter?.levels() ?? { left: 0, right: 0 };
}

// ---- the rooms' echo: one bus for every voice, and what the listener's room says of it

let bus: ReverbBus | null = null;
let room: Place | null = null;
function ensureReverb(): ReverbBus | null {
  if (bus) return bus;
  const ctx = context();
  if (!ctx) return null;
  ensureLimiter();
  try {
    // (it plays into Howler's master gain: the master volume and the mute switch rule the echo too)
    bus = createReverbBus(ctx, Howler.masterGain);
    if (room) bus.setRoom(room.acoustics.decay, room.acoustics.softness);
  } catch (error) {
    console.warn("[sound] no echo", error);
  }
  return bus;
}
function setRoom(place: Place) {
  room = place;
  bus?.setRoom(place.acoustics.decay, place.acoustics.softness);
}
// the master factor of every voice's send (the Debug panel's Echo slider and switch)
const reverbGain = () => masterSend(settings.reverbAmount, settings.reverbOn);

// the room the echo plays now, the wet level (linear RMS) and the impulse in use (the Debug panel's lines)
export const currentRoom = (): Place | null => room;
export const wetLevel = (): number => bus?.level() ?? 0;
export const echoImpulse = () => bus?.current() ?? null;
// ---- the sounds: one Howl for each generated wave (its buffer is made once) and for each sample file (loaded lazily)

const howls = new Map<string, Howl>();
// the samples' Howls that could not be loaded: their voices stay silent (and the file is not asked for again)
const failedHowls = new WeakSet<Howl>();
// One Howl for each sample file, made lazily and loaded at the first voice that needs it (a sound out of range never
// loads its file): Web Audio decoding (not html5), the registry says whether it loops. Its rate is set per voice.
function sampleHowl({ url, format, loop }: NonNullable<ReturnType<typeof sampleSource>>): Howl {
  const key = `sample:${url}`;
  let howl = howls.get(key);
  if (!howl) {
    howl = new Howl({ src: [url], format: [format], loop, volume: 1, preload: false, html5: false });
    const made = howl;
    made.once("loaderror", (_id, error) => {
      failedHowls.add(made);
      console.warn(`[sound] could not load ${url}`, error);
    });
    howls.set(key, howl);
  }
  return howl;
}
function howlFor(spec: WaveSpec): Howl {
  const sample = spec.kind === "sample" && sampleSource(spec.sample, import.meta.env.BASE_URL);
  if (sample) return sampleHowl(sample);
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

// Two ways to place a voice. "stereo" (the default): a StereoPannerNode with the balance the sound logic worked out
// (stereo.ts) - both ears always hear a sound, the near one more, as in a room. "hrtf": Howler's 3D panner with the HRTF
// model, which makes the balance from the voice's place and adds front / back cues that show on headphones; it knows
// nothing of the stereo rules (a loud, near or doorway sound can sit in one ear). The mode is the Debug panel's switch;
// a voice changes over at once.
type Mode = "stereo" | "hrtf";
let hrtf = false;
export const isHrtf = () => hrtf;
export function setHrtf(on: boolean) {
  if (on === hrtf) return;
  hrtf = on;
  for (const voice of [...voices]) if (voice.ready && !voice.stopping && voice.mode !== modeNow()) rebuild(voice);
}
const modeNow = (): Mode => (hrtf ? "hrtf" : "stereo");
// (the 3D panner makes no distance falloff: refDistance huge, rolloff none)
const pannerOptions = () => ({ panningModel: "HRTF" as const, distanceModel: "inverse" as const, refDistance: 1, maxDistance: 10000, rolloffFactor: 0 });

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
  // the fade of a voice coming in and going out
  presence: GainNode;
  // the share of the voice that goes to the echo bus (null: no bus)
  send: GainNode | null;
  nodes: AudioNode[];
}
interface HowlerSound {
  _node: GainNode;
  _panner?: PannerNode | StereoPannerNode;
}

// what a voice chases (see smoothing.ts): the balance, the loudness, the walls' filter, the shadow behind the
// listener, and - for the 3D panner - the place relative to the listener
type Aim = "pan" | "level" | "cutoff" | "wallGain" | "rearCutoff" | "rearGain" | "send" | "rx" | "ry" | "rz";
const newSmoother = () =>
  new Smoother<Aim>({
    pan: { tau: TAU.pan },
    level: { tau: TAU.level },
    cutoff: { tau: TAU.cutoff, log: true },
    wallGain: { tau: TAU.wallGain },
    rearCutoff: { tau: TAU.rear, log: true },
    rearGain: { tau: TAU.rear },
    send: { tau: TAU.level },
    rx: { tau: TAU.place },
    ry: { tau: TAU.place },
    rz: { tau: TAU.place },
  });

export interface Voice {
  howl: Howl;
  id: number;
  // false until the buffer is loaded and the voice is wired
  ready: boolean;
  stopping: boolean;
  // the doorway's voice: slower fades
  portal: boolean;
  mode: Mode;
  want: VoiceState | null;
  chain: Chain | null;
  smoother: Smoother<Aim>;
  // the audio clock at the last state (the smoothing's step)
  lastT: number;
  // the gate's last target (0 / 1): the edge is scheduled when it changes
  gateTarget: number | null;
  // whether a state has been put in on the current chain (the first goes in at once)
  applied: boolean;
  // a sample: its speed, the loudness evening-out of the recording (the registry's gain, times the level), and for a
  // one-shot whether it has played to its end (it is silent then, unwired, and waits for `replay`)
  rate: number;
  gain: number;
  oneShot: boolean;
  finished: boolean;
}
const voices = new Set<Voice>();

const soundOf = (voice: Voice) => (voice.howl as unknown as { _soundById(id: number): HowlerSound | null })._soundById(voice.id);
const fadeTau = (voice: Voice) => (voice.portal ? TAU.fadePortal : TAU.fadeDirect);

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
    level: gain(1),
    gate: gain(1),
    // (silent until the first state: a voice fades in)
    presence: gain(0),
    send: null,
    nodes: [],
  };
  chain.nodes = [chain.rear, chain.rearLevel, chain.muffleA, chain.muffleB, chain.wallLevel, chain.level, chain.gate, chain.presence];
  sound._panner.disconnect();
  sound._panner.connect(chain.rear);
  chain.nodes.forEach((node, i) => {
    if (i < chain.nodes.length - 1) node.connect(chain.nodes[i + 1]);
  });
  chain.presence.connect(sound._node);
  // (a send from after the fade: the echo of a voice comes and goes with it)
  const echo = ensureReverb();
  if (echo) {
    chain.send = gain(0);
    chain.presence.connect(chain.send);
    chain.send.connect(echo.input);
  }
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
  chain.send?.disconnect();
  voice.chain = null;
}

// Makes the voice's panner for the mode now (Howler puts a new one in its place and starts the sound through it again).
// `stereo()` and `pos()` shut each other out: the sound has either a stereo panner or a 3D one.
function makePanner(voice: Voice) {
  const { howl, id } = voice;
  if (hrtf) {
    // (this makes the 3D panner)
    howl.pos(listener.x, listener.y, listener.z, id);
    howl.pannerAttr(pannerOptions(), id);
  } else {
    howl.stereo(0, id);
  }
  voice.mode = modeNow();
}

// the mode was switched: the voice takes the other panner, its chain with it, and settles again
function rebuild(voice: Voice) {
  try {
    unwire(voice);
    makePanner(voice);
    if (!wire(voice)) throw new Error("no panner");
    voice.gateTarget = null;
    voice.applied = false;
    if (voice.want) apply(voice, voice.want);
  } catch (error) {
    console.warn("[sound] could not change a voice's panner", error);
    voice.stopping = true;
    voices.delete(voice);
  }
}

function ended(voice: Voice) {
  if (voice.stopping || !voice.ready) return;
  unwire(voice);
  voice.ready = false;
  voice.finished = true;
  voice.gateTarget = null;
  voice.applied = false;
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
    if (voice.rate !== 1) howl.rate(voice.rate, voice.id);
    // (a one-shot's end: the chain is taken out at once, before Howler can hand the sound on to another voice)
    if (voice.oneShot) howl.once("end", () => ended(voice), voice.id);
    makePanner(voice);
    if (!wire(voice)) throw new Error("no panner");
    voice.ready = true;
    if (voice.want) apply(voice, voice.want);
  } catch (error) {
    console.warn("[sound] could not start a voice", error);
    voices.delete(voice);
    voice.stopping = true;
  }
}

// `fresh` (the voice's first state, or its first after the panner was changed): put the values in at once (a voice that
// has just started must not open and then glide to where it belongs; it fades in as a whole instead)
function apply(voice: Voice, state: VoiceState, fresh = !voice.applied) {
  const ctx = context();
  const chain = voice.chain;
  if (!ctx || !chain) return;
  voice.applied = true;
  const t = ctx.currentTime;
  const nyquist = ctx.sampleRate * 0.45;
  // the aims: what the sound logic says, and the shadow behind the listener (it needs the listener of this frame)
  const ear = rearFilter(behindness(listener, state.x, state.z), settings.rearStrength);
  const aim: Record<Aim, number> = {
    pan: state.pan,
    level: state.level,
    cutoff: Math.min(state.cutoff, nyquist),
    wallGain: state.wallGain,
    rearCutoff: Math.min(ear.cutoff, nyquist),
    rearGain: ear.gain,
    send: (state.send ?? 0) * reverbGain(),
    rx: state.x - listener.x,
    ry: state.y - listener.y,
    rz: state.z - listener.z,
  };
  const dt = Math.min(0.5, Math.max(0, t - voice.lastT));
  voice.lastT = t;
  const now = fresh ? voice.smoother.snap(aim) : voice.smoother.step(aim, dt);
  // (the values are already smooth; a short glide on the parameter only bridges the gap between two frames)
  const to = (param: AudioParam, value: number) => {
    if (fresh) param.value = value;
    else param.setTargetAtTime(value, t, 0.03);
  };
  const sound = soundOf(voice);
  if (voice.mode === "hrtf") {
    voice.howl.pos(listener.x + now.rx, listener.y + now.ry, listener.z + now.rz, voice.id);
  } else if (sound?._panner && "pan" in sound._panner) {
    to(sound._panner.pan, now.pan);
  }
  to(chain.rear.frequency, now.rearCutoff);
  to(chain.rearLevel.gain, now.rearGain);
  to(chain.muffleA.frequency, now.cutoff);
  to(chain.muffleB.frequency, now.cutoff);
  to(chain.wallLevel.gain, now.wallGain);
  to(chain.level.gain, now.level * voice.gain);
  if (chain.send) to(chain.send.gain, now.send);
  // the pulse's gate: the edge follows the attack (opening) or the release (closing)
  if (fresh) {
    chain.gate.gain.value = state.gate;
    voice.gateTarget = state.gate;
    chain.presence.gain.setTargetAtTime(1, t, fadeTau(voice));
  } else if (state.gate !== voice.gateTarget) {
    voice.gateTarget = state.gate;
    chain.gate.gain.setTargetAtTime(state.gate, t, gateTimeConstant(state.gate > 0.5 ? state.attack : state.release));
  }
}

function start(spec: WaveSpec, options: StartOptions = {}): Voice | null {
  try {
    const howl = howlFor(spec);
    const def = spec.kind === "sample" ? sampleSource(spec.sample, import.meta.env.BASE_URL) : undefined;
    const voice: Voice = {
      rate: spec.rate ?? 1,
      gain: def?.gain ?? 1,
      oneShot: def ? !def.loop : false,
      finished: false,
      howl,
      id: -1,
      ready: false,
      stopping: false,
      portal: options.portal === true,
      mode: modeNow(),
      want: null,
      chain: null,
      smoother: newSmoother(),
      lastT: 0,
      gateTarget: null,
      applied: false,
    };
    voices.add(voice);
    if (howl.state() === "loaded") attach(voice);
    else if (!failedHowls.has(howl)) {
      // (a sample is loaded now, at its first voice; until it is, the voice waits silently; a failed one never plays)
      howl.once("load", () => attach(voice));
      if (howl.state() === "unloaded") howl.load();
    }
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
  const tau = fadeTau(voice);
  chain.presence.gain.setTargetAtTime(0, ctx.currentTime, tau);
  // (the fade is over after about seven time constants: -60 dB)
  setTimeout(() => {
    unwire(voice);
    try {
      voice.howl.stop(voice.id);
    } catch {
      /* (already gone) */
    }
    voices.delete(voice);
  }, Math.ceil(tau * 7000) + 40);
}

// a one-shot sample plays again from its start (the sound system's pause between plays is over)
function replay(voice: Voice) {
  if (!voice.finished || voice.stopping) return;
  voice.finished = false;
  attach(voice);
}

export const engine: SoundBackend<Voice> = { start, set, stop, setListener, setRoom, finished: (voice) => voice.finished && !voice.stopping, replay };

// the context's state, its rate, and how many voices there are (the Debug panel's line)
export function engineStatus(): { state: string; sampleRate: number; voices: number } {
  const ctx = context();
  return { state: ctx?.state ?? "(not started)", sampleRate: ctx?.sampleRate ?? 0, voices: voices.size };
}
