import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

// Packs one world of the game into a folder (and a zip) someone else can play:
//
//   npm run pack -- --world fantasy
//
// It builds the game for that world (only its maps are in the build, the world
// picker is left out, the game is served from the root), puts the build in
// <out>/game/ and next to it the launchers: Start-Game.bat (Windows - a tiny
// PowerShell web server, nothing to install), start.sh (macOS / Linux, needs
// python3) and a README. Writes dist-<world>/<Title>/ and dist-<world>/<Title>.zip.

const { values: args } = parseArgs({
  options: {
    world: { type: "string", default: "fantasy" },
    out: { type: "string" },
    title: { type: "string" },
    zip: { type: "boolean", default: true },
  },
});

const WORLD_TITLES: Record<string, string> = { fantasy: "VoidFantasy", scifi: "VoidCrew" };
const world = args.world!;
if (!WORLD_TITLES[world]) {
  console.error(`Unknown world "${world}" (fantasy or scifi)`);
  process.exit(1);
}
const title = args.title ?? WORLD_TITLES[world];
const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.resolve(root, args.out ?? `dist-${world}`);
const pkgDir = path.join(outRoot, title);
const gameDir = path.join(pkgDir, "game");

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(gameDir, { recursive: true });

console.log(`Building ${world}...`);
execSync(`npx vite build --outDir "${gameDir}" --emptyOutDir`, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_WORLD: world, VOID_BASE: "/" },
});

// the launchers
for (const file of ["server.ps1", "Start-Game.bat", "start.sh"]) {
  fs.copyFileSync(path.join(root, "packaging", file), path.join(pkgDir, file));
}
const readme = `${title}
${"=".repeat(title.length)}

Windows:      double-click Start-Game.bat (it starts a small local server and opens the
              browser; keep its window open while you play).
macOS/Linux:  run ./start.sh (needs python3), then open http://localhost:8765/

The game runs in your browser (WebGL), from this folder - nothing is installed and
nothing is sent anywhere. Controls: W/S step, A/D turn, Q/E strafe (or the pad at
the bottom left), mouse to look and aim; Tab opens the map editor, which can also
download the map (the Download button) to share.

Needs a recent Chrome, Edge or Firefox with WebGL.
`;
fs.writeFileSync(path.join(pkgDir, "README.txt"), readme);

if (args.zip) {
  const zip = path.join(outRoot, `${title}.zip`);
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${pkgDir}' -DestinationPath '${zip}' -Force"`, { stdio: "inherit" });
    } else {
      execSync(`zip -qr "${zip}" "${title}"`, { cwd: outRoot, stdio: "inherit" });
    }
    console.log(`Zip: ${path.relative(root, zip)} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`);
  } catch {
    console.warn("Could not make the zip - the folder is still there.");
  }
}
console.log(`Package: ${path.relative(root, pkgDir)}`);
