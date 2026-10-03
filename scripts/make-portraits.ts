import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";

// The crew's portraits for the party panel (see PartyPanel.tsx): the
// painted ones in concept/gen/portraits (any size) made into
// public/portraits/<id>.webp, small enough to load at once and sharp on a
// phone's screen. A picture named after a crewmate ("Reese.png") is theirs;
// any other is a 2 x 2 sheet of all four, in the order of SHEET.
//
//   npx tsx scripts/make-portraits.ts

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = path.join(ROOT, "concept/gen/portraits");
const OUT = path.join(ROOT, "public/portraits");
const SIZE = 256;
// a sheet's portraits: top left, top right, bottom left, bottom right
const SHEET = ["reese", "lyn", "orion", "kell"];

async function save(image: sharp.Sharp, id: string) {
  const out = path.join(OUT, `${id}.webp`);
  await image.resize(SIZE, SIZE, { fit: "cover" }).webp({ quality: 88 }).toFile(out);
  console.log(`  -> ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const file of fs.readdirSync(WORK).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
    const source = path.join(WORK, file);
    const id = path.parse(file).name.toLowerCase();
    console.log(file);
    if (SHEET.includes(id)) {
      await save(sharp(source), id);
      continue;
    }
    const { width = 0, height = 0 } = await sharp(source).metadata();
    const w = Math.floor(width / 2);
    const h = Math.floor(height / 2);
    for (const [k, crew] of SHEET.entries()) {
      await save(sharp(source).extract({ left: (k % 2) * w, top: Math.floor(k / 2) * h, width: w, height: h }), crew);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
