// The echo bus: every voice sends a share of itself here (engine.ts), and the listener's room decides how it rings. The
// echo is a ConvolverNode whose impulse response is made from two numbers (impulse.ts). A room change never jumps: a
// second ConvolverNode takes the new impulse and the two cross-fade (equal power) over CROSSFADE seconds. The bus knows
// nothing of Howler: it is given an AudioContext and a node to play into.
//
//   input -> high cut (softness) -> [convolver A -> gain A] + [convolver B -> gain B] -> out -> destination
//                                                                                        \-> analyser (the wet level)
import { IMPULSE_MAX_DECAY, impulseParams, makeImpulse, softnessCutoff } from "./impulse";

export const CROSSFADE = 0.5;
// a change that comes sooner than this after the last one waits (a slider being dragged must not pile up cross-fades)
const MIN_GAP = CROSSFADE + 0.05;
const CACHE_MAX = 6;

export interface ReverbBus {
  // where the voices' sends go
  input: AudioNode;
  // the room's echo: how long it rings and how soft it is (the same numbers - to within the rounding of impulse.ts - do nothing)
  setRoom(decay: number, softness: number): void;
  // the RMS of what the echo plays now (linear)
  level(): number;
  // the impulse the echo plays now, for the Debug line
  current(): { decay: number; softness: number } | null;
}

interface Slot {
  convolver: ConvolverNode;
  gain: GainNode;
}

export function createReverbBus(ctx: BaseAudioContext, destination: AudioNode): ReverbBus {
  const input = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 0.5;
  tone.frequency.value = softnessCutoff(0.5);
  const out = ctx.createGain();
  input.connect(tone);
  const makeSlot = (): Slot => {
    const convolver = ctx.createConvolver();
    // (the impulses are made with an energy of 1: no normalising of the node's own)
    convolver.normalize = false;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    tone.connect(convolver);
    convolver.connect(gain);
    gain.connect(out);
    return { convolver, gain };
  };
  const slots = [makeSlot(), makeSlot()];
  out.connect(destination);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  out.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const cache = new Map<string, AudioBuffer>();
  const bufferFor = (decay: number, softness: number, key: string) => {
    let buffer = cache.get(key);
    if (!buffer) {
      const channels = makeImpulse(decay, softness, ctx.sampleRate);
      buffer = ctx.createBuffer(2, channels[0].length, ctx.sampleRate);
      channels.forEach((data, c) => buffer!.copyToChannel(data as Float32Array<ArrayBuffer>, c));
      cache.set(key, buffer);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    }
    return buffer;
  };

  let active = -1;
  let playing: { decay: number; softness: number; key: string } | null = null;
  let lastSwitch = -Infinity;
  let pending: { decay: number; softness: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fade = (param: AudioParam, from: number, to: number, t: number) => {
    // (equal power: the two gains' squares add up to one all the way)
    const curve = new Float32Array(33);
    for (let i = 0; i < curve.length; i++) {
      const u = i / (curve.length - 1);
      curve[i] = from + (to - from) * (to > from ? Math.sin((u * Math.PI) / 2) : 1 - Math.cos((u * Math.PI) / 2));
    }
    param.cancelScheduledValues(t);
    param.setValueCurveAtTime(curve, t, CROSSFADE);
  };

  const switchTo = (params: { decay: number; softness: number; key: string }) => {
    const t = ctx.currentTime;
    const next = active === 0 ? 1 : 0;
    slots[next].convolver.buffer = bufferFor(params.decay, params.softness, params.key);
    if (active < 0) {
      // (the first room: no old echo to fade from)
      slots[next].gain.gain.value = 1;
    } else {
      fade(slots[next].gain.gain, 0, 1, t);
      fade(slots[active].gain.gain, 1, 0, t);
      const old = slots[active];
      setTimeout(() => {
        // (only if it was not taken up again meanwhile)
        if (old !== slots[active]) old.convolver.buffer = null;
      }, (CROSSFADE + 0.1) * 1000);
    }
    active = next;
    playing = params;
    lastSwitch = t;
  };

  const apply = (decay: number, softness: number) => {
    const params = impulseParams(decay, softness);
    // the high cut follows the softness smoothly (it is cheap); the impulse is changed only when the rounded numbers are
    tone.frequency.setTargetAtTime(softnessCutoff(softness), ctx.currentTime, 0.2);
    if (playing && playing.key === params.key) return;
    if (ctx.currentTime - lastSwitch < MIN_GAP && playing) {
      pending = { decay, softness };
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          const p = pending;
          pending = null;
          if (p) apply(p.decay, p.softness);
        }, Math.ceil((MIN_GAP - (ctx.currentTime - lastSwitch)) * 1000) + 20);
      }
      return;
    }
    pending = null;
    switchTo(params);
  };

  return {
    input,
    setRoom: (decay, softness) => apply(Math.min(IMPULSE_MAX_DECAY, decay), softness),
    level() {
      analyser.getFloatTimeDomainData(samples as Float32Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      return Math.sqrt(sum / samples.length);
    },
    current: () => (playing ? { decay: playing.decay, softness: playing.softness } : null),
  };
}
