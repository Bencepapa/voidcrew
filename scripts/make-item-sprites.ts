import sharp from "sharp";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Makes the loot items' texture sets (public/textures/item_<id>: diffuse,
// depth, normal - see src/game/items.ts) for the game's item sprites.
//
//   npx tsx scripts/make-item-sprites.ts
//
// From concept/gen/items/items.png and items_depth.png if they're there (an
// AI sheet: the items in a grid of 5 columns and 2 rows, in ITEM_ORDER, on
// magenta; the depth sheet the same layout, white nearest, black behind -
// see scripts/gen-items.ts for the prompts), else from the simple drawn
// placeholders below.

const ROOT = path.resolve(import.meta.dirname, "..");
const SHEET = path.join(ROOT, "concept/gen/items/items.png");
const DEPTH = path.join(ROOT, "concept/gen/items/items_depth.png");
const WORK = path.join(ROOT, "concept/gen/items/cut");
const ITEM_ORDER = ["scrap", "wiring", "circuit", "powercell", "servo", "medkit", "ammo", "rations", "credits", "datachip"];
const COLS = 5;
const ROWS = 2;
const SIZE = "96";

// Placeholders: each item drawn in a 128 box - its colors, and the same
// shapes in grays for its depth (white nearest)
const OUTLINE = `stroke="#16181c" stroke-width="4" stroke-linejoin="round"`;
const PLACEHOLDERS: Record<string, { color: string; depth: string }> = {
  scrap: {
    color: `<polygon points="14,98 40,70 70,84 58,108" fill="#7a6a5a" ${OUTLINE}/><polygon points="44,96 76,58 112,76 92,110" fill="#8d8378" ${OUTLINE}/><polygon points="30,74 56,46 84,60 62,86" fill="#a0521e" ${OUTLINE}/><circle cx="86" cy="96" r="6" fill="#c9c2b8" ${OUTLINE}/>`,
    depth: `<polygon points="14,98 40,70 70,84 58,108" fill="#707070"/><polygon points="44,96 76,58 112,76 92,110" fill="#909090"/><polygon points="30,74 56,46 84,60 62,86" fill="#c0c0c0"/><circle cx="86" cy="96" r="6" fill="#ffffff"/>`,
  },
  wiring: {
    color: `<ellipse cx="64" cy="80" rx="44" ry="26" fill="none" stroke="#16181c" stroke-width="22"/><ellipse cx="64" cy="80" rx="44" ry="26" fill="none" stroke="#b8342c" stroke-width="7"/><ellipse cx="64" cy="74" rx="38" ry="22" fill="none" stroke="#d8b224" stroke-width="7"/><ellipse cx="64" cy="86" rx="40" ry="20" fill="none" stroke="#3a3d42" stroke-width="7"/>`,
    depth: `<ellipse cx="64" cy="80" rx="44" ry="26" fill="none" stroke="#b0b0b0" stroke-width="22"/><ellipse cx="64" cy="74" rx="38" ry="22" fill="none" stroke="#ffffff" stroke-width="8"/>`,
  },
  circuit: {
    color: `<rect x="16" y="36" width="96" height="64" rx="4" fill="#2f6b3a" ${OUTLINE}/><rect x="30" y="50" width="24" height="18" fill="#22252a"/><rect x="62" y="56" width="34" height="22" fill="#22252a"/><rect x="18" y="92" width="92" height="6" fill="#d9a520"/><path d="M34 76 H56 V88 M70 46 V54" stroke="#9fd28a" stroke-width="3" fill="none"/>`,
    depth: `<rect x="16" y="36" width="96" height="64" rx="4" fill="#808080"/><rect x="30" y="50" width="24" height="18" fill="#e0e0e0"/><rect x="62" y="56" width="34" height="22" fill="#ffffff"/>`,
  },
  powercell: {
    color: `<rect x="40" y="22" width="48" height="90" rx="10" fill="#4a4f57" ${OUTLINE}/><rect x="54" y="12" width="20" height="12" fill="#8d9097" ${OUTLINE}/><rect x="40" y="56" width="48" height="14" fill="#3ee6f0"/><rect x="46" y="30" width="8" height="70" fill="#6c727b"/>`,
    depth: `<rect x="40" y="22" width="48" height="90" rx="10" fill="#c0c0c0"/><rect x="54" y="12" width="20" height="12" fill="#909090"/><rect x="58" y="22" width="12" height="90" fill="#ffffff"/>`,
  },
  servo: {
    color: `<rect x="22" y="48" width="64" height="54" rx="6" fill="#5b5f66" ${OUTLINE}/><circle cx="92" cy="60" r="22" fill="#a8a296" ${OUTLINE}/><circle cx="92" cy="60" r="7" fill="#2b2d31"/><path d="M22 90 Q8 96 12 112" stroke="#b8342c" stroke-width="6" fill="none"/><rect x="30" y="58" width="30" height="8" fill="#d9a520"/>`,
    depth: `<rect x="22" y="48" width="64" height="54" rx="6" fill="#a0a0a0"/><circle cx="92" cy="60" r="22" fill="#e0e0e0"/><circle cx="92" cy="60" r="7" fill="#ffffff"/>`,
  },
  medkit: {
    color: `<rect x="16" y="40" width="96" height="66" rx="8" fill="#e4e2dc" ${OUTLINE}/><rect x="48" y="28" width="32" height="14" rx="4" fill="none" ${OUTLINE}/><rect x="56" y="52" width="16" height="42" fill="#c22a24"/><rect x="43" y="65" width="42" height="16" fill="#c22a24"/>`,
    depth: `<rect x="16" y="40" width="96" height="66" rx="8" fill="#c0c0c0"/><rect x="48" y="28" width="32" height="14" rx="4" fill="#808080"/><rect x="56" y="52" width="16" height="42" fill="#e8e8e8"/><rect x="43" y="65" width="42" height="16" fill="#e8e8e8"/>`,
  },
  ammo: {
    color: `<rect x="14" y="46" width="100" height="58" rx="3" fill="#56603a" ${OUTLINE}/><rect x="14" y="46" width="100" height="14" fill="#6b7648" ${OUTLINE}/><rect x="34" y="70" width="60" height="16" fill="#d6b52a"/><rect x="58" y="38" width="12" height="10" fill="#2b2d31"/>`,
    depth: `<rect x="14" y="46" width="100" height="58" rx="3" fill="#b0b0b0"/><rect x="14" y="46" width="100" height="14" fill="#d8d8d8"/>`,
  },
  rations: {
    color: `<rect x="22" y="80" width="84" height="24" rx="4" fill="#b8bcc2" ${OUTLINE}/><rect x="26" y="58" width="80" height="24" rx="4" fill="#cfd3d8" ${OUTLINE}/><rect x="20" y="36" width="82" height="24" rx="4" fill="#a9adb3" ${OUTLINE}/><rect x="44" y="42" width="30" height="10" fill="#c27a24"/>`,
    depth: `<rect x="22" y="80" width="84" height="24" rx="4" fill="#909090"/><rect x="26" y="58" width="80" height="24" rx="4" fill="#b8b8b8"/><rect x="20" y="36" width="82" height="24" rx="4" fill="#e0e0e0"/>`,
  },
  credits: {
    color: `<rect x="20" y="40" width="88" height="56" rx="8" fill="#d4a52a" ${OUTLINE}/><rect x="30" y="52" width="22" height="16" fill="#8a6a1a"/><circle cx="84" cy="74" r="12" fill="#9ee8ff"/><rect x="30" y="80" width="40" height="6" fill="#8a6a1a"/>`,
    depth: `<rect x="20" y="40" width="88" height="56" rx="8" fill="#c0c0c0"/><rect x="30" y="52" width="22" height="16" fill="#e8e8e8"/><circle cx="84" cy="74" r="12" fill="#ffffff"/>`,
  },
  datachip: {
    color: `<rect x="36" y="30" width="56" height="74" rx="4" fill="#3b4048" ${OUTLINE}/><rect x="44" y="96" width="40" height="14" fill="#d9a520" ${OUTLINE}/><rect x="46" y="40" width="36" height="22" fill="#262a30"/><circle cx="64" cy="78" r="6" fill="#4aa8ff"/>`,
    depth: `<rect x="36" y="30" width="56" height="74" rx="4" fill="#c0c0c0"/><rect x="44" y="96" width="40" height="14" fill="#808080"/><circle cx="64" cy="78" r="6" fill="#ffffff"/>`,
  },
};

const svg = (body: string, background?: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${background ? `<rect width="128" height="128" fill="${background}"/>` : ""}${body}</svg>`,
  );

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const fromSheet = fs.existsSync(SHEET) && fs.existsSync(DEPTH);
  if (fromSheet) {
    const meta = await sharp(SHEET).metadata();
    const depthMeta = await sharp(DEPTH).metadata();
    const cw = Math.floor(meta.width! / COLS);
    const ch = Math.floor(meta.height! / ROWS);
    const dw = Math.floor(depthMeta.width! / COLS);
    const dh = Math.floor(depthMeta.height! / ROWS);
    for (const [i, id] of ITEM_ORDER.entries()) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      await sharp(SHEET).extract({ left: col * cw, top: row * ch, width: cw, height: ch }).png().toFile(path.join(WORK, `${id}.png`));
      await sharp(DEPTH)
        .extract({ left: col * dw, top: row * dh, width: dw, height: dh })
        .resize(cw, ch)
        .png()
        .toFile(path.join(WORK, `${id}_depth.png`));
    }
  } else {
    for (const id of ITEM_ORDER) {
      const art = PLACEHOLDERS[id];
      await sharp(svg(art.color)).png().toFile(path.join(WORK, `${id}.png`));
      await sharp(svg(art.depth, "#000000")).png().toFile(path.join(WORK, `${id}_depth.png`));
    }
  }
  for (const id of ITEM_ORDER) {
    const out = path.join(ROOT, "public/textures", `item_${id}`);
    const args = ["tsx", "scripts/process-texture.ts", "--diffuse", path.join(WORK, `${id}.png`), "--depth", path.join(WORK, `${id}_depth.png`)];
    args.push("--out", out, "--size", SIZE, "--trim", "--levels", "4", "--min-island", "2");
    if (fromSheet) args.push("--key", "ff00ff");
    execFileSync("npx", args, { cwd: ROOT, stdio: "inherit", shell: true });
  }
  console.log(`Made ${ITEM_ORDER.length} item texture sets ${fromSheet ? "from the AI sheets" : "from the placeholders"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
