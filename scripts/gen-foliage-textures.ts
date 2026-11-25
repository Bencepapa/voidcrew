import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FOLIAGE, TILE_SIZE, foliageStats, renderFoliage, seamMismatches, type FoliageId } from "./foliageTexture";
import { encodeLossless } from "./imageEncode";
import { normalMapFromHeight } from "./normalMap";

const root = fileURLToPath(new URL("../", import.meta.url));
const size = TILE_SIZE;
const width = size * 3;
const gap = 12;
const height = size * 3 + gap * 2;
const preview = new Uint8Array(width * height * 4);
const sky = [142, 187, 220];

async function writePng(file: string, data: Uint8Array, width: number, height: number) {
  const png = await encodeLossless({ data, width, height }, { pngOnly: true });
  await writeFile(file, png.bytes);
}

function makeNormal(depth: Uint8Array) {
  // Supply a wrapped border for the Sobel filter in the shared normal-map tool.
  const stride = size + 2;
  const padded = new Float32Array(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < stride; x++) {
      padded[y * stride + x] = depth[(y * size + (x + size - 1) % size) * 4];
    }
  }
  const rgb = normalMapFromHeight(padded, stride, size, 0.7);
  const normal = new Uint8Array(depth.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * stride + x + 1) * 3;
      normal.set([rgb[src], rgb[src + 1], rgb[src + 2], 255], (y * size + x) * 4);
    }
  }
  return normal;
}

for (let i = 0; i < preview.length; i += 4) preview.set([...sky, 255], i);
for (const [row, id] of (Object.keys(FOLIAGE) as FoliageId[]).entries()) {
  const { diffuse, depth } = renderFoliage(id);
  const normal = makeNormal(depth);
  const dir = join(root, "public/textures", id);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writePng(join(dir, "diffuse.png"), diffuse, size, size),
    writePng(join(dir, "depth.png"), depth, size, size),
    writePng(join(dir, "normal.png"), normal, size, size),
  ]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * size + x % size) * 4;
      const dst = ((row * (size + gap) + y) * width + x) * 4;
      const alpha = diffuse[src + 3] / 255;
      for (let c = 0; c < 3; c++) preview[dst + c] = Math.round(diffuse[src + c] * alpha + sky[c] * (1 - alpha));
    }
  }

  const offset = size / 2;
  const shifted = renderFoliage(id, FOLIAGE[id].seed, offset);
  console.log(id, { ...foliageStats(diffuse), seamMismatches: seamMismatches(diffuse, shifted.diffuse, offset) });
}
const previewDir = join(root, "concept/fantasy");
await mkdir(previewDir, { recursive: true });
await writePng(join(previewDir, "foliage-preview.png"), preview, width, height);
