// A level meter on the master output: a channel splitter and two analysers read the left and right RMS of what is
// played, for the Debug panel's line and for measuring the stereo field by hand (the numbers are in the notes,
// concept/editor-ui/NOTES-sound-emitters.md). The maths is pure and tested (meter.test.ts); the Web Audio part is three
// calls.

export interface Levels {
  // linear RMS, 0..1 (full scale is 1)
  left: number;
  right: number;
}

export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// decibels relative to full scale; silence is -Infinity, shown as the floor
export const toDb = (linear: number): number => (linear > 0 ? 20 * Math.log10(linear) : -Infinity);
export const DB_FLOOR = -100;
export const dbText = (linear: number): string => {
  const db = toDb(linear);
  return db > DB_FLOOR ? `${db.toFixed(1)} dB` : "-inf";
};

export interface StereoMeter {
  levels(): Levels;
  dispose(): void;
}

// Taps `source` (it stays connected where it was); the meter reads the last `fftSize` samples of each side.
export function createStereoMeter(ctx: BaseAudioContext, source: AudioNode, fftSize = 2048): StereoMeter {
  const splitter = ctx.createChannelSplitter(2);
  const left = ctx.createAnalyser();
  const right = ctx.createAnalyser();
  left.fftSize = right.fftSize = fftSize;
  source.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 1);
  const bufferL = new Float32Array(fftSize);
  const bufferR = new Float32Array(fftSize);
  return {
    levels() {
      left.getFloatTimeDomainData(bufferL);
      right.getFloatTimeDomainData(bufferR);
      return { left: rms(bufferL), right: rms(bufferR) };
    },
    dispose() {
      try {
        source.disconnect(splitter);
      } catch {
        /* (gone already) */
      }
      splitter.disconnect();
    },
  };
}
