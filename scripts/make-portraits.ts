import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";

// The crew's portraits for the party panel (see PartyPanel.tsx): each
// painted one in concept/gen/portraits (any size, named after the
// crewmate - "Reese.png") made into public/portraits/<id>.webp, small
// enough to load at once and sharp on a phone's screen.
//
//   npx tsx scripts/make-portraits.ts

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = path.join(ROOT, "concept/gen/portraits");
const OUT = path.join(ROOT, "public/portraits");
const SIZE = 256;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const file of fs.readdirSync(WORK).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
    const id = path.parse(file).name.toLowerCase();
    const out = path.join(OUT, `${id}.webp`);
    await sharp(path.join(WORK, file)).resize(SIZE, SIZE, { fit: "cover" }).webp({ quality: 85 }).toFile(out);
    console.log(`${file} -> ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
