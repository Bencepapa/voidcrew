import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";

// Normal maps from height maps, shared by process-texture.ts and the dev
// server's texture watcher (vite.config.ts), which redoes a set's
// normal.png when its depth.png is painted over by hand.

export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + d))];
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) sum += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

export function normalMapFromHeight(height: Float32Array, w: number, h: number, strength: number): Buffer {
  const at = (x: number, y: number) =>
    height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] / 255;

  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel; image rows grow downward, so +dy in the image is -y in the
      // OpenGL-style (Y up) tangent space three.js expects
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * w + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

// A texture set folder painted over by hand: its depth.png takes the
// diffuse's transparent holes (if the diffuse has any - paint them out of
// the diffuse only), and normal.png is made anew from the depth, the way
// process-texture makes it by default (its stepped levels, a 2 px bevel,
// strength 3). Returns what it wrote.
export async function renormal(dir: string, { bevel = 2, strength = 3 } = {}): Promise<string[]> {
  const depthFile = path.join(dir, "depth.png");
  const diffuseFile = path.join(dir, "diffuse.png");
  if (!fs.existsSync(depthFile)) return [];
  const written: string[] = [];
  const depthImg = sharp(fs.readFileSync(depthFile));
  const { width: w, height: h } = await depthImg.metadata();
  if (!w || !h) return [];
  const gray = await sharp(fs.readFileSync(depthFile)).removeAlpha().greyscale().raw().toBuffer();
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = gray[i];

  // the diffuse's holes into the depth's alpha (only if they differ)
  if (fs.existsSync(diffuseFile)) {
    const diffuse = sharp(fs.readFileSync(diffuseFile));
    const meta = await diffuse.metadata();
    if (meta.hasAlpha && meta.width === w && meta.height === h) {
      const alpha = await diffuse.ensureAlpha().extractChannel(3).raw().toBuffer();
      const depthMeta = await sharp(fs.readFileSync(depthFile)).metadata();
      const old = depthMeta.hasAlpha ? await sharp(fs.readFileSync(depthFile)).ensureAlpha().extractChannel(3).raw().toBuffer() : null;
      const solid = (a: number) => (a >= 128 ? 255 : 0);
      let differs = !old;
      for (let i = 0; !differs && i < alpha.length; i++) differs = solid(alpha[i]) !== solid(old![i]);
      if (differs) {
        const ga = Buffer.alloc(w * h * 2);
        for (let i = 0; i < w * h; i++) {
          ga[i * 2] = gray[i];
          ga[i * 2 + 1] = solid(alpha[i]);
        }
        await sharp(ga, { raw: { width: w, height: h, channels: 2 } }).png({ compressionLevel: 9 }).toFile(depthFile + ".tmp");
        fs.renameSync(depthFile + ".tmp", depthFile);
        written.push("depth.png (holes)");
      }
    }
  }

  const normal = normalMapFromHeight(boxBlur(boxBlur(height, w, h, bevel), w, h, bevel), w, h, strength);
  await sharp(normal, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(dir, "normal.png.tmp"));
  fs.renameSync(path.join(dir, "normal.png.tmp"), path.join(dir, "normal.png"));
  written.push("normal.png");
  return written;
}
