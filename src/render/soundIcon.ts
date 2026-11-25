import * as THREE from "three";
import { SPEAKER_PATH, WAVES_PATH } from "./soundGlyph";

// The 3D editor view's sign of a sound emitter (see soundGlyph.ts): a loudspeaker with sound waves, drawn on a canvas in
// the sound layer's colour with a dark outline, for a plane that faces the camera. Transparent round it (the material
// cuts it with an alpha test, so the sign keeps writing depth and can be picked like any mesh).
export const SOUND_ICON_COLOR = "#2dd4bf";

export function makeSoundIcon(color = SOUND_ICON_COLOR, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.translate(size / 2, size / 2);
    // (a little inside the canvas: the outline must not be cut)
    const unit = size * 0.4;
    ctx.scale(unit, unit);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const body = new Path2D(SPEAKER_PATH);
    const waves = new Path2D(WAVES_PATH);
    // the dark outline first, then the colour on top
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 0.36;
    ctx.stroke(body);
    ctx.stroke(waves);
    ctx.fillStyle = color;
    ctx.fill(body);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.17;
    ctx.stroke(waves);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
