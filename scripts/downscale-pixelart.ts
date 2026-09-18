import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";

const GEN_DIR = path.resolve(import.meta.dirname, "../concept/gen");
const FACTOR = 5;
const SRC_PREFIX = "wall2_";
const DST_PREFIX = "wall3_";

async function main() {
  const files = fs.readdirSync(GEN_DIR).filter((f) => f.startsWith(SRC_PREFIX) && f.endsWith(".png"));

  for (const file of files) {
    const srcPath = path.join(GEN_DIR, file);
    const dstPath = path.join(GEN_DIR, file.replace(SRC_PREFIX, DST_PREFIX));

    const img = sharp(srcPath);
    const meta = await img.metadata();
    const width = Math.round((meta.width ?? 0) / FACTOR);
    const height = Math.round((meta.height ?? 0) / FACTOR);

    await img.resize(width, height, { kernel: "nearest" }).toFile(dstPath);
    console.log(`${file} (${meta.width}x${meta.height}) -> ${path.basename(dstPath)} (${width}x${height})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
