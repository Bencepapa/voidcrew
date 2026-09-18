import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";

config({ path: path.resolve(import.meta.dirname, "../.env.local") });

const OUT_DIR = path.resolve(import.meta.dirname, "../concept/gen");
// gemini-2.5-flash-image is deprecated (shuts down 2026-10-02); use its successor.
// Swap to "gemini-3.1-flash-image" if edit-consistency quality needs the step-up.
const MODEL = "gemini-3.1-flash-lite-image";

const BASE_PROMPT =
  "A single flat sci-fi corridor wall panel texture, seamless and tileable, " +
  "brushed metal bulkhead with recessed panel seams and a few rivets, " +
  "orthographic front-on view like a material swatch (not a rendered scene), " +
  "completely flat, even, shadowless studio lighting, no directional highlights, " +
  "no vignette, no perspective, plain retro-industrial sci-fi style, square image.";

const RELIGHT_PROMPTS: Record<string, string> = {
  lit_top: "Keep the exact same wall panel, same camera, same proportions, same details. Only change the lighting: light this panel from directly above, so the top edges of raised details are bright and the undersides are in shadow.",
  lit_bottom: "Keep the exact same wall panel, same camera, same proportions, same details. Only change the lighting: light this panel from directly below, so the bottom edges of raised details are bright and the top edges are in shadow.",
  lit_left: "Keep the exact same wall panel, same camera, same proportions, same details. Only change the lighting: light this panel from the left side, so the left edges of raised details are bright and the right edges are in shadow.",
  lit_right: "Keep the exact same wall panel, same camera, same proportions, same details. Only change the lighting: light this panel from the right side, so the right edges of raised details are bright and the left edges are in shadow.",
};

async function generateBase(ai: GoogleGenAI): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: BASE_PROMPT,
  });
  const data = response.data;
  if (!data) throw new Error("No image data in base generation response.\n" + response.text);
  return Buffer.from(data, "base64");
}

async function relight(ai: GoogleGenAI, baseImage: Buffer, prompt: string): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: baseImage.toString("base64") } },
        ],
      },
    ],
  });
  const data = response.data;
  if (!data) throw new Error("No image data in relight response.\n" + response.text);
  return Buffer.from(data, "base64");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY. Add it to .env.local (see .env.example) and re-run.");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log("Generating base diffuse texture...");
  const base = await generateBase(ai);
  fs.writeFileSync(path.join(OUT_DIR, "wall_diffuse.png"), base);
  console.log("Saved wall_diffuse.png");

  for (const [name, prompt] of Object.entries(RELIGHT_PROMPTS)) {
    console.log(`Generating ${name}...`);
    const img = await relight(ai, base, prompt);
    fs.writeFileSync(path.join(OUT_DIR, `wall_${name}.png`), img);
    console.log(`Saved wall_${name}.png`);
  }

  console.log(`\nDone. Review the images in ${OUT_DIR}`);
  console.log("Check that the 4 lit variants stay structurally identical to wall_diffuse.png before feeding them into Sprite Lamp.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
