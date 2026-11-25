// The sign of a sound emitter: a small loudspeaker with two sound waves, as SVG path data in a box from -1 to 1 on both
// axes (y down). The 3D editor view draws it on a canvas for a billboard (soundIcon.ts, `new Path2D(path)`) and the
// minimap draws it as SVG (Minimap.tsx), so the two show the same thing. It has its own key, unlike the light's coloured
// ball it used to share a look with.

// the speaker: a little box and its cone (fill it)
export const SPEAKER_PATH = "M -1 -0.35 L -0.5 -0.35 L 0.1 -0.85 L 0.1 0.85 L -0.5 0.35 L -1 0.35 Z";
// the sound waves coming out of it (stroke them)
export const WAVES_PATH = "M 0.42 -0.42 Q 0.72 0 0.42 0.42 M 0.66 -0.78 Q 1.18 0 0.66 0.78";
