// Audio spike (see the sound system plan): a Howler backend behind a tiny surface, to try it in the Debug panel
// before deciding Howler vs. our own Web Audio layer. The game talks to this module only (setListener from the
// viewport, the probe functions from the panel); nothing here is saved or shipped as sound data.
//
// Units: the world is in cells (x east, z south, y up), the same as the three.js scene, so a sound's distance
// falloff is in cells too.
import { Howl, Howler } from "howler";

interface ListenerState { x: number; y: number; z: number; fx: number; fz: number }
let listener: ListenerState = { x: 0, y: 0.5, z: 0, fx: 0, fz: -1 };
let listenerSeen = false;

/** Called every frame by the viewport with the eye position and the (normalized) horizontal look direction. */
export function setListener(x: number, y: number, z: number, fx: number, fz: number) {
  listener = { x, y, z, fx, fz };
  if (!listenerSeen) return; // (nothing has played yet: the audio context may not exist; do not wake it)
  try {
    Howler.pos(x, y, z);
    Howler.orientation(fx, 0, fz, 0, 1, 0);
    if (entries.size) applyRear();
  } catch {
    /* no audio: nothing to move */
  }
}

// ---- a generated test sound: a short decaying tone (no file needed) ----

// `harmonics`: how many overtones ride on the base tone (a rich sound: a low-pass is audible on it); `decay`: how fast it
// dies (0: it holds, with only a short fade in and out)
function toneWav(frequency: number, seconds: number, harmonics = 6, decay = 4, rate = 22050): string {
  const samples = Math.floor(seconds * rate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  let norm = 0;
  for (let h = 1; h <= harmonics; h++) norm += 1 / Math.sqrt(h);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const left = seconds - t;
    const envelope = Math.min(1, t / 0.01, left / 0.05) * (decay > 0 ? Math.exp(-t * decay) : 1);
    let wave = 0;
    for (let h = 1; h <= harmonics; h++) wave += Math.sin(2 * Math.PI * frequency * h * t) / Math.sqrt(h); // (a saw-like sum)
    view.setInt16(44 + i * 2, Math.round((wave / norm) * envelope * 0.9 * 32767), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

// a pulsing, pink-ish noise burst ("shh-shh"): broadband, so a low-pass changes how it sounds (a plain tone cannot show that)
function noiseWav(seconds: number, rate = 22050): string {
  const count = Math.floor(seconds * rate);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + count * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, count * 2, true);
  let slow = 0;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const white = Math.random() * 2 - 1;
    slow = slow * 0.93 + white * 0.07; // (a one-pole low-pass of it: the low part of the noise)
    const pulse = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2.5 * t)), 2);
    const envelope = Math.min(1, t / 0.02, (seconds - t) / 0.05) * pulse;
    view.setInt16(44 + i * 2, Math.round((white * 0.35 + slow * 2.2) * envelope * 0.8 * 32767), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

let limited = false;
// the master goes through a compressor used as a limiter (20 sounds at once clipped without it)
function ensureLimiter() {
  if (limited) return;
  const ctx = Howler.ctx as AudioContext | undefined;
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

let beep: Howl | undefined;
let noise: Howl | undefined;
function theNoise(): Howl {
  listenerSeen = true;
  if (!noise) noise = new Howl({ src: [noiseWav(2)], format: ["wav"], volume: 1 });
  return noise;
}
function theBeep(): Howl {
  listenerSeen = true;
  if (!beep) beep = new Howl({ src: [toneWav(440, 0.7, 10, 3)], format: ["wav"], volume: 1 });
  return beep;
}

export interface ProbeSource {
  /** world position, in cells */
  x: number; y: number; z: number;
  /** a low-pass cutoff (Hz): the muffled sound of a house, 0: none */
  muffle?: number;
  /** the noise test sound instead of the beep */
  noise?: boolean;
  /** 0..1 (default 1) */
  volume?: number;
}

// Equal-power panning is what plays well on speakers (clear left / right); HRTF adds front / back cues, which only
// show on headphones. Falloff: full volume up to 2 cells, then 1/distance.
let hrtf = false;
export function setHrtf(on: boolean) { hrtf = on; }
export const isHrtf = () => hrtf;
const pannerOptions = () => ({ panningModel: hrtf ? ("HRTF" as const) : ("equalpower" as const), distanceModel: "inverse" as const, refDistance: 2, maxDistance: 40, rolloffFactor: 1 });

/** Plays one instance of the test sound at a world position (it stays there while the listener turns and walks). */
export function playAt(source: ProbeSource): number {
  const howl = source.noise ? theNoise() : theBeep();
  ensureLimiter();
  Howler.pos(listener.x, listener.y, listener.z);
  Howler.orientation(listener.fx, 0, listener.fz, 0, 1, 0);
  const id = howl.play();
  howl.volume(source.volume ?? 1, id);
  howl.pos(source.x, source.y, source.z, id);
  howl.pannerAttr(pannerOptions(), id);
  shape(howl, id, source);
  return id;
}

// ---- shaping one instance's sound ----
// Howler keeps no hook for effects: an instance's chain is source -> panner -> gain node -> master, so filters go between
// the panner and the gain node (reaching `_panner` / `_node` is the fragile part; it is only done here).
//  - rear dulling: a sound from behind has its high end shadowed by the ear, so a low-pass opens or closes with the angle
//    (front / back cue that works on speakers too);
//  - muffling (a wall between): two low-passes in a row and a drop in level, the way a wall takes the highs and keeps the rumble.
interface Entry { rear: BiquadFilterNode; level: GainNode; x: number; z: number }
const entries = new Set<Entry>();
let rearDull = true;
export function setRearDull(on: boolean) { rearDull = on; applyRear(); }
export const isRearDull = () => rearDull;

// 0 in front or at the side .. 1 straight behind, on the ground plane (only the rear half-plane counts: a sound at the
// side is not dulled, one behind is, most when it is straight back)
function behindness(x: number, z: number): number {
  const dx = x - listener.x, dz = z - listener.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.3) return 0;
  return Math.max(0, -(dx * listener.fx + dz * listener.fz) / length);
}

function applyRear() {
  const ctx = Howler.ctx as AudioContext | undefined;
  if (!ctx) return;
  for (const entry of entries) {
    const behind = rearDull ? behindness(entry.x, entry.z) : 0;
    // straight behind: the highs cut down to about 700 Hz and the level halved (about -6 dB)
    entry.rear.frequency.setTargetAtTime(18000 * Math.pow(0.04, behind), ctx.currentTime, 0.05);
    entry.level.gain.setTargetAtTime(1 - 0.5 * behind, ctx.currentTime, 0.05);
  }
}

function shape(howl: Howl, id: number, source: ProbeSource) {
  try {
    const sound = (howl as unknown as { _soundById(id: number): { _node: GainNode; _panner?: PannerNode } | null })._soundById(id);
    if (!sound?._panner) return;
    const ctx = Howler.ctx as AudioContext;
    const lowpass = (cutoff: number) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.7;
      filter.frequency.value = cutoff;
      return filter;
    };
    const rear = lowpass(18000);
    const rearLevel = ctx.createGain();
    sound._panner.disconnect();
    sound._panner.connect(rear);
    rear.connect(rearLevel);
    let tail: AudioNode = rearLevel;
    if (source.muffle) {
      const first = lowpass(source.muffle), second = lowpass(source.muffle), level = ctx.createGain();
      level.gain.value = 0.4; // (about -8 dB)
      tail.connect(first);
      first.connect(second);
      second.connect(level);
      tail = level;
    }
    tail.connect(sound._node);
    const entry: Entry = { rear, level: rearLevel, x: source.x, z: source.z };
    entries.add(entry);
    applyRear();
    howl.once("end", () => entries.delete(entry), id);
  } catch (error) {
    console.warn("[audio probe] shaping failed", error);
  }
}
/** Where the world is relative to the listener: `ahead` and `right` in cells. */
export function relative(ahead: number, right: number, up = 0): ProbeSource {
  // the right-hand side of a forward vector (fx, fz) on the ground plane (x east, z south): (-fz, fx)
  return { x: listener.x + listener.fx * ahead - listener.fz * right, y: listener.y + up, z: listener.z + listener.fz * ahead + listener.fx * right };
}

/** Plays many instances at once, spread round the listener (the pool check). */
export function playMany(count: number): number {
  let started = 0;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const distance = 2 + (i % 5);
    playAt({ x: listener.x + Math.cos(angle) * distance, y: listener.y, z: listener.z + Math.sin(angle) * distance, volume: 0.3 });
    started++;
  }
  return started;
}

let orbit: ReturnType<typeof setInterval> | undefined;
/** One instance circling the listener's start spot for about six seconds, to hear the panning move. */
export function playOrbit(): void {
  const howl = theBeep();
  stopOrbit();
  const centre = { ...listener };
  const start = performance.now();
  ensureLimiter();
  const loop = new Howl({ src: [toneWav(330, 6, 10, 0, 22050)], format: ["wav"], volume: 1 });
  listenerSeen = true;
  Howler.pos(centre.x, centre.y, centre.z);
  Howler.orientation(centre.fx, 0, centre.fz, 0, 1, 0);
  const id = loop.play();
  loop.pannerAttr(pannerOptions(), id);
  orbit = setInterval(() => {
    const t = (performance.now() - start) / 1000;
    if (t > 6) { stopOrbit(); return; }
    const angle = (t / 6) * Math.PI * 2;
    loop.pos(centre.x + Math.cos(angle) * 3, centre.y, centre.z + Math.sin(angle) * 3, id);
  }, 30);
  void howl;
}

export function stopOrbit() {
  if (orbit) clearInterval(orbit);
  orbit = undefined;
}

export function stopAllProbes() {
  stopOrbit();
  Howler.stop();
}

export interface ProbeStatus { state: string; sampleRate: number; active: number }
export function probeStatus(): ProbeStatus {
  const ctx = Howler.ctx as AudioContext | undefined;
  const sounds = beep ? (beep as unknown as { _sounds: { _paused: boolean; _ended: boolean }[] })._sounds : [];
  return { state: ctx?.state ?? "(not started)", sampleRate: ctx?.sampleRate ?? 0, active: sounds.filter((s) => !s._paused && !s._ended).length };
}
