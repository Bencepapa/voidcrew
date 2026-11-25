// Generated sound waves (no sound files): a tone of a given wave form and pitch, or a noise of a given colour, as
// samples that loop without a click at the seam. Pure functions (no Web Audio): the engine turns the samples into a
// WAV for the player (see engine.ts) and caches them - one buffer for each wave, however many emitters use it.
import type { NoiseColor, SoundWave } from "../game/sounds";

export const SAMPLE_RATE = 44100;
// a tone's buffer: about this long, holding a whole number of periods
const TONE_SECONDS = 0.5;
// a noise's buffer: long enough that the repeat isn't heard as a pattern
const NOISE_SECONDS = 2;
// the seam's crossfade
const NOISE_FADE_SECONDS = 0.05;
// the loudest sample of a buffer (the emitters' volume is applied on playing)
export const PEAK = 0.9;
// a noise's average strength (about a tone's, whose peak is PEAK)
const NOISE_RMS = 0.28;
// the most overtones a wave carries (a low saw has hundreds under Nyquist: the top ones are inaudible)
const MAX_HARMONICS = 160;

export interface Wave {
  // -1..1
  samples: Float32Array;
  rate: number;
  // the pitch it really has (the buffer holds whole periods, so it is a hair off the one asked): tones only
  frequency?: number;
  periods?: number;
}

// A tone: the wave made by adding its overtones up to just under half the sample rate (a band-limited one: a plain
// saw or square would alias into a dirty buzz). The length is a whole number of periods, the pitch adjusted by a
// fraction of a hundredth of a percent to make it so - the loop's end meets its start exactly.
export function toneWave(wave: SoundWave, pitch: number, rate = SAMPLE_RATE): Wave {
  const periods = Math.max(1, Math.round(pitch * TONE_SECONDS));
  const length = Math.max(2, Math.round((periods * rate) / pitch));
  const frequency = (periods * rate) / length;
  const harmonics = wave === "sine" ? 1 : Math.max(1, Math.min(MAX_HARMONICS, Math.floor((0.45 * rate) / frequency)));
  // the overtones' strength: k is the multiple of the base pitch
  const amount = (k: number): number => {
    switch (wave) {
      case "sine":
        return k === 1 ? 1 : 0;
      case "saw":
        return 1 / k;
      case "square":
        return k % 2 ? 1 / k : 0;
      case "triangle":
        return k % 2 ? ((k - 1) / 2) % 2 === 0 ? 1 / (k * k) : -1 / (k * k) : 0;
    }
  };
  const samples = new Float32Array(length);
  for (let k = 1; k <= harmonics; k++) {
    const a = amount(k);
    if (a === 0) continue;
    // (the sample i of the k-th overtone: a whole number of its periods fit the buffer, so it loops on its own)
    for (let i = 0; i < length; i++) samples[i] += a * Math.sin((2 * Math.PI * ((k * i * periods) % length)) / length);
  }
  normalize(samples);
  return { samples, rate, frequency, periods };
}

// a random number generator that gives the same noise every time (a sound that is the same in every run)
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  };
}

// Noise: white is flat; pink falls 3 dB an octave (a softer hiss, a rush); brown 6 (a rumble). The buffer's end is
// crossfaded into its start so it loops without a seam.
export function noiseWave(color: NoiseColor, rate = SAMPLE_RATE, seconds = NOISE_SECONDS): Wave {
  const length = Math.round(seconds * rate);
  const fade = Math.min(Math.round(NOISE_FADE_SECONDS * rate), Math.floor(length / 4));
  const total = length + fade;
  const random = lcg(color === "white" ? 1 : color === "pink" ? 2 : 3);
  const raw = new Float32Array(total);
  // pink: Paul Kellet's filter on white; brown: a leaky running sum of it
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
  for (let i = 0; i < total; i++) {
    const white = random();
    if (color === "white") {
      raw[i] = white;
    } else if (color === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      raw[i] = brown;
    }
  }
  // (the sample that would come after the last one is raw[length]: the first ones are blended toward the ones after
  // the end, so the loop's last sample runs on into its first without a jump)
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (i < fade) {
      const t = (i + 1) / (fade + 1);
      samples[i] = raw[i] * Math.sin((t * Math.PI) / 2) + raw[length + i] * Math.cos((t * Math.PI) / 2);
    } else samples[i] = raw[i];
  }
  normalize(samples, NOISE_RMS);
  return { samples, rate };
}

// Scaled so the loudest sample is PEAK (after taking out the offset a brown noise drifts to) - or, given `rms`, so
// the sound's average strength is that, unless that would pass PEAK (a noise's peaks are high: scaled to the peak
// it would be much quieter than a tone).
function normalize(samples: Float32Array, rms?: number) {
  let mean = 0;
  for (const s of samples) mean += s;
  mean /= samples.length;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] -= mean;
    peak = Math.max(peak, Math.abs(samples[i]));
    sum += samples[i] * samples[i];
  }
  if (peak === 0) return;
  let gain = PEAK / peak;
  if (rms) gain = Math.min(gain, rms / Math.sqrt(sum / samples.length));
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

// a mono 16-bit PCM WAV file of the wave
export function wavBytes(wave: Wave): ArrayBuffer {
  const count = wave.samples.length;
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, wave.rate, true);
  view.setUint32(28, wave.rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, wave.samples[i])) * 32767), true);
  return buffer;
}
