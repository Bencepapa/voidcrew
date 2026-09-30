import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";

// Generates the loot items' art (see src/game/items.ts) with Gemini: one
// sheet of all of them on magenta, in a grid, and a depth sheet of the same
// layout made from it - for scripts/make-item-sprites.ts to cut into
// texture sets.
//
//   npx tsx scripts/gen-items.ts            (both sheets)
//   npx tsx scripts/gen-items.ts --depth    (only the depth sheet, from the saved one)

config({ path: path.resolve(import.meta.dirname, "../.env.local") });

const OUT_DIR = path.resolve(import.meta.dirname, "../concept/gen/items");
const MODEL = "gemini-3.1-flash-lite-image";

// in reading order, 5 per row (make-item-sprites.ts cuts them the same way)
export const ITEM_SHEET = [
  ["scrap", "a small pile of bent, rusty scrap metal plates and a bolt"],
  ["wiring", "a coiled bundle of insulated cables, red, yellow and black wires"],
  ["circuit", "a green circuit board with chips and gold contacts"],
  ["powercell", "a cylindrical power cell battery with a glowing cyan band"],
  ["servo", "a chunky servo motor with a gear and cable stub"],
  ["medkit", "a white medical kit case with a red cross"],
  ["ammo", "an olive-green ammunition box with a yellow stencil"],
  ["rations", "a stack of three foil-wrapped ration packs"],
  ["credits", "a gold credit chip, a thick plastic card with a hologram"],
  ["datachip", "a small data chip cartridge with a blue light"],
];

const SHEET_PROMPT =
  "A sprite sheet of 10 separate sci-fi loot items for a retro first-person dungeon crawler, " +
  "arranged in a neat grid of 5 columns and 2 rows, each item centered in its own cell with " +
  "plenty of empty space around it, each seen from the front and slightly above (three-quarter view), " +
  "on a completely flat pure magenta background (#ff00ff) with no shadows on the background. " +
  "Gritty worn industrial sci-fi, painted pixel-art look with dark outlines, muted colors with a few bright accents. " +
  "No text, no labels, no numbers, no grid lines. The items, in reading order: " +
  ITEM_SHEET.map(([, d], i) => `${i + 1}. ${d}`).join("; ") +
  ".";

const DEPTH_PROMPT =
  "Turn this sprite sheet into its depth map: keep the exact same layout, the same items at the same " +
  "places and sizes with the same outlines. Each item in grayscale, white where it comes nearest to the " +
  "viewer, darker where it's farther back; the background pure black. No colors, no shading from light, " +
  "no outlines drawn in, only the depth.";

async function generate(ai: GoogleGenAI, parts: object[]): Promise<Buffer> {
  const response = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts }] });
  const data = response.data;
  if (!data) throw new Error("No image data in the response.\n" + response.text);
  return Buffer.from(data, "base64");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY. Add it to .env.local (see .env.example) and re-run.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const sheetPath = path.join(OUT_DIR, "items.png");
  if (!process.argv.includes("--depth")) {
    console.log("Generating the item sheet...");
    fs.writeFileSync(sheetPath, await generate(ai, [{ text: SHEET_PROMPT }]));
    console.log(`Saved ${sheetPath}`);
  }
  console.log("Generating its depth sheet...");
  const sheet = fs.readFileSync(sheetPath);
  const depth = await generate(ai, [{ text: DEPTH_PROMPT }, { inlineData: { mimeType: "image/png", data: sheet.toString("base64") } }]);
  fs.writeFileSync(path.join(OUT_DIR, "items_depth.png"), depth);
  console.log(`Saved ${path.join(OUT_DIR, "items_depth.png")}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("gen-items.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
