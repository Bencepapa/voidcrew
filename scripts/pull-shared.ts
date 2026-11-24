import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import sharp from "sharp";
import { readPickupAppearance } from "../src/game/bundledImages";
import { skyIssues, SKY_MAX_WIDTH, SKY_MIN_WIDTH } from "../src/game/skyImage";
import { bundleFileNames, readBundleFiles, type BundleExt, type BundleFiles, type BundleMapKey } from "../src/game/bundleFiles";
import { actorFiles, bundledActorFolder, COMMON_FOLDER, commonFolder, commonIdOk, readCommonDefinition, revisionNumbers, type CommonKind, type DefinitionKind } from "../src/game/sharedContent";
import { bakeTexture, type TextureBakeInput } from "./bundleTexture";
import { encodeSource, type Encoded } from "./imageEncode";

// npm run pull:shared [outdir] [--list]
//   --list (alias --dry-run): only says what would be bundled (and what is kept as it is, and which files and formats
//   each asset would get); nothing is downloaded beyond the small meta.json / map-head reads, and nothing is written.
//
// Images in the bundle are LOSSLESS, always (the textures are pixel art): every image file the script writes goes
// through scripts/imageEncode.ts, which keeps the smaller of an optimised PNG and a lossless WebP (PNG unless the WebP is
// at least 10% smaller), checks the decoded pixels against the source, and names the file after what it really is
// (diffuse.webp only when it is WebP). The catalog records the real names (`files`, see src/game/bundleFiles.ts).
// Every bundled texture gets its Auto normal / depth maps baked in, so the shipped game never derives anything
// (the client never tracks a bundled texture for upgradeShared: setSharedTextures drops bundled ids).
// The resolution hook is MAX_TEXTURE_SIZE in scripts/imageEncode.ts (Infinity: nothing is resized).
//
// TODO (geometry, not done yet): relief geometry could be baked the same way. The game builds it from a texture's depth
// map in src/render/reliefMesh.ts; a baked file (say relief.bin, listed in the catalog `files` under a new key) would
// be produced right after the maps below, from the baked depth, and read instead of loadHeightGrid. See
// concept/webp-compression-plan.md, "Implementation status".
const flags = process.argv.slice(2).filter(arg => arg.startsWith("--"));
const [output] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const dryRun = flags.includes("--list") || flags.includes("--dry-run");
for (const flag of flags) if (!["--list", "--dry-run"].includes(flag)) throw new Error(`Unknown option ${flag} (use --list).`);
const root = resolve(output ?? ".");
const catalogPath = join(root, "src/game/sharedBuiltins.json");
const catalog = existsSync(catalogPath)
  ? JSON.parse((await readFile(catalogPath, "utf8")).replace(/^﻿/, "")) // (an editor may have left a BOM)
  : { textures: {}, maps: {} };
catalog.images ??= {};
for (const path of [".env.local", ".env"]) if (existsSync(path)) loadEnvFile(path);
const project = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!project || !key) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
const bucket = "/storage/v1/object/";
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
// Moves a freshly written folder into place. On Windows a rename of a new folder can fail with EPERM/EBUSY while
// a file watcher (the dev server) or a scanner still holds it: retry a few times, then copy it over and remove the
// staging folder (a half-written target is never left behind: the copy goes into a new folder that did not exist).
async function moveFolder(from: string, to: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") throw error;
      await new Promise(done => setTimeout(done, 150 * (attempt + 1)));
    }
  }
  await cp(from, to, { recursive: true, errorOnExist: true, force: false });
  await rm(from, { recursive: true, force: true }).catch(() => undefined); // (a locked staging folder is cleaned up by hand)
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

interface TextureMeta {
  name: string;
  type?: string;
  kinds?: string[];
  maps?: Record<string, string>;
  transparency?: { source?: string; colorKey?: string };
  pixelArt?: boolean;
  smooth?: boolean;
  tuning?: unknown;
  // the store's own file names, when a revision says (a later editor may publish WebP); none: <map>.png
  files?: unknown;
}

async function request(path: string, body?: unknown): Promise<Response> {
  return fetch(project + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: key!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

async function pages<T>(fetchPage: (offset: number) => Promise<Response>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetchPage(offset);
    if (!response.ok) throw new Error(`Shared listing failed (HTTP ${response.status}).`);
    const page = await response.json() as T[];
    result.push(...page);
    if (page.length < 100) return result;
  }
}

const list = (prefix: string) => pages<{ name: string }>(offset => request(bucket + "list/void-textures", {
  prefix, offset, limit: 100, sortBy: { column: "name", order: "asc" },
}));
const asset = (path: string) => request(bucket + "public/void-textures/" + path);
async function file(path: string) {
  const response = await asset(path);
  if (!response.ok) throw new Error(`Missing ${path} (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

// ---- what was written, for the final table ----
interface Written { asset: string; role: string; name: string; ext: BundleExt; bytes: number; pngBytes: number; sourceBytes?: number }
const written: Written[] = [];
const kb = (bytes: number) => `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
function record(asset: string, role: string, name: string, encoded: Encoded) {
  written.push({ asset, role, name, ext: encoded.ext, bytes: encoded.bytes.length, pngBytes: encoded.pngBytes, sourceBytes: encoded.sourceBytes });
  const from = encoded.sourceBytes ? `, from ${kb(encoded.sourceBytes)}` : "";
  console.log(`  ${name}: ${kb(encoded.bytes.length)}${from} (${encoded.note})`);
}
function printSummary() {
  if (!written.length) return;
  const rows = new Map<string, { files: number; webp: number; bytes: number; png: number; source: number; sourced: number }>();
  for (const w of written) {
    const row = rows.get(w.role) ?? { files: 0, webp: 0, bytes: 0, png: 0, source: 0, sourced: 0 };
    row.files++; row.webp += w.ext === "webp" ? 1 : 0; row.bytes += w.bytes; row.png += w.pngBytes;
    if (w.sourceBytes) { row.source += w.sourceBytes; row.sourced += w.bytes; }
    rows.set(w.role, row);
  }
  const total = { files: 0, webp: 0, bytes: 0, png: 0, source: 0, sourced: 0 };
  console.log("\nImage files written (lossless; 'PNG-opt' = the same pixels as an optimised PNG):");
  console.log("  kind".padEnd(18) + "files".padStart(7) + "webp".padStart(7) + "bytes".padStart(12) + "PNG-opt".padStart(12) + "saved".padStart(12));
  for (const [role, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${role}`.padEnd(18) + String(row.files).padStart(7) + String(row.webp).padStart(7) + kb(row.bytes).padStart(12) + kb(row.png).padStart(12) + kb(row.png - row.bytes).padStart(12));
    for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += row[key];
  }
  console.log("  total".padEnd(18) + String(total.files).padStart(7) + String(total.webp).padStart(7) + kb(total.bytes).padStart(12) + kb(total.png).padStart(12) + kb(total.png - total.bytes).padStart(12));
  if (total.source) console.log(`  (the ${kb(total.sourced)} of those that came from a downloaded file were ${kb(total.source)} there; baked Auto maps have no download)`);
}

/** The file name the store keeps for a map: `meta.files` when a revision names one (a later editor), else `<key>.png`. */
const storeName = (meta: { files?: unknown }, key: BundleMapKey) => readBundleFiles(meta.files)[key] ?? `${key}.png`;

async function saveCatalog() {
  if (dryRun) return;
  await mkdir(dirname(catalogPath), { recursive: true });
  const pending = catalogPath + ".tmp";
  await writeFile(pending, json(catalog));
  // (the dev server may hold the catalog open - the game imports it: on Windows a rename over it then fails with
  // EPERM/EBUSY; retry, and as the last resort write the file in place)
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await rename(pending, catalogPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") throw error;
      await new Promise(done => setTimeout(done, 150 * (attempt + 1)));
    }
  }
  await writeFile(catalogPath, json(catalog));
  await rm(pending, { force: true }).catch(() => undefined);
}

async function pullTexture(world: string, name: string) {
  const legacy = /^[a-z0-9-]+\.png$/.test(name);
  if (!legacy && !uuid.test(name)) return;
  const id = `${world}_shared_${legacy ? name.slice(0, -4) : name}`;
  const target = join(root, "public/textures", id);
  let rev = 0;
  let meta: TextureMeta = { name: name.slice(37, -4) || name };
  let folder = `${world}/${name}`;
  if (!legacy) {
    const versions = (await list(folder)).map(entry => /^r(\d+)$/.exec(entry.name))
      .flatMap(match => match ? [Number(match[1])] : []).sort((a, b) => b - a);
    for (const version of versions) {
      const path = `${world}/${name}/r${version}`;
      const response = await asset(path + "/meta.json");
      if (response.status === 404 || response.status === 400) continue;
      if (!response.ok) throw new Error(`Could not read ${path} metadata (HTTP ${response.status}).`);
      meta = await response.json();
      if (!meta || typeof meta.name !== "string" || (meta.type && meta.type !== "texture")) continue;
      rev = version;
      folder = path;
      break;
    }
    if (!rev) return;
  }
  if (existsSync(target) || Object.hasOwn(catalog.textures, id)) {
    if (catalog.textures[id]?.rev !== rev) console.warn(`Kept existing ${id}; shared revision: ${rev}.`);
    return;
  }
  const maps = meta.maps ?? {};
  const source = meta.transparency?.source;
  if (dryRun) {
    const how = (channel: string) => maps[channel] === "auto" ? "baked from the diffuse" : maps[channel] === "uploaded" ? "uploaded" : "none (flat)";
    const surface = maps.gloss === "uploaded" || maps.metal === "uploaded" ? ", surface" : "";
    console.log(`Would bundle texture ${id} (r${rev}): diffuse${source === "none" || source === "colorKey" ? ` (transparency ${source} baked in)` : ""}, ` +
      `normal ${how("normal")}, depth ${how("depth")}${maps.emissive === "uploaded" ? ", emissive" : ""}${surface}; each file the smaller of PNG and lossless WebP (sizes known after the download).`);
    return;
  }
  console.log(`Texture ${id} (r${rev}):`);
  const at = (key: BundleMapKey) => legacy ? folder : `${folder}/${storeName(meta, key)}`;
  const sources: TextureBakeInput["sources"] = { diffuse: await file(at("diffuse")) };
  for (const channel of ["normal", "depth", "emissive"] as const) {
    if (maps[channel] === "uploaded") sources[channel] = await file(at(channel));
  }
  if (maps.gloss === "uploaded" || maps.metal === "uploaded") sources.surface = await file(at("surface"));
  // transparency and the Auto maps baked in, every map encoded (scripts/bundleTexture.ts)
  const encoded = await bakeTexture({ sources, maps, transparency: meta.transparency });
  const exts: Partial<Record<BundleMapKey, BundleExt>> = {};
  for (const [key, one] of Object.entries(encoded) as [BundleMapKey, Encoded][]) { exts[key] = one.ext; record(id, key, `${key}.${one.ext}`, one); }
  const files: BundleFiles = bundleFileNames(exts);
  const kinds = (Array.isArray(meta.kinds) ? meta.kinds : []).filter((kind: unknown) => ["wall", "floor", "ceiling", "propFace"].includes(kind as string));
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), ".pull-shared-"));
  for (const [key, one] of Object.entries(encoded) as [BundleMapKey, Encoded][]) await writeFile(join(staging, files[key]!), one.bytes);
  await moveFolder(staging, target);
  catalog.textures[id] = { rev, label: meta.name, kinds: kinds.length ? kinds : ["wall", "floor"], pixelArt: meta.pixelArt !== false,
    smooth: meta.smooth === true, files, tuning: meta.tuning };
  await saveCatalog();
  console.log(`Bundled texture ${id} (r${rev}).`);
}

// Stills (portrait), decals, pickups (item) and skies (sky). A pickup comes with its normal and depth maps
// (public/shared-images/<id>.normal.png / .depth.png) and its look (category, height, glow, value) in the catalog.
// A sky is a single 2:1 panorama (public/shared-images/<id>.<ext>, lossless like the rest); a map names it by its id.
async function pullImages(world: string, type: "portrait" | "decal" | "item" | "sky") {
  const prefix = `${world}/${type}`;
  for (const { name: idPart } of await list(prefix)) {
    if (!uuid.test(idPart)) continue;
    const path = `${prefix}/${idPart}`;
    const id = `${world}_${type}_${idPart}`;
    const exists = () => ["png", "webp"].some(ext => existsSync(join(root, "public/shared-images", `${id}.${ext}`)));
    const versions = (await list(path)).flatMap(({ name }) => /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : [])
      .filter(Number.isSafeInteger).sort((a, b) => b - a);
    for (const rev of versions) {
      const folder = `${path}/r${rev}/`;
      const response = await asset(folder + "meta.json");
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) throw new Error(`Could not read ${folder} metadata (HTTP ${response.status}).`);
      const { name, type: savedType, width, height, surface, purpose, hasNormal, pickup, files: storeFiles } = await response.json();
      if (savedType !== type || typeof name !== "string" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) continue;
      if (exists() || Object.hasOwn(catalog.images, id)) {
        if (catalog.images[id]?.rev !== rev) console.warn(`Kept existing ${id}; shared revision: ${rev}.`);
        break;
      }
      // a sky that is not a usable 2:1 panorama would only look wrong in the game: not bundled (the editor refuses it too)
      if (type === "sky" && skyIssues(width, height).errors.length) {
        console.warn(`Skipped sky ${id} (r${rev}): ${width}x${height} is not a usable 2:1 panorama (width ${SKY_MIN_WIDTH}-${SKY_MAX_WIDTH}).`);
        break;
      }
      if (dryRun) {
        const maps = type === "item" ? " + normal and depth maps" : type === "decal" && hasNormal === true ? " + normal map" : type === "sky" ? " (2:1 sky panorama)" : "";
        console.log(`Would bundle ${type} ${id} (r${rev}): ${width}x${height}${maps}; each file the smaller of PNG and lossless WebP (sizes known after the download).`);
        break;
      }
      console.log(`${type} ${id} (r${rev}):`);
      const names = (key: BundleMapKey) => readBundleFiles(storeFiles)[key] ?? `${key}.png`;
      // the maps: a decal's own normal map (revisions before it have none), a pickup's normal and depth maps (publishing always makes both)
      // all downloaded and checked before anything is written
      const sources: Partial<Record<BundleMapKey, Buffer>> = { diffuse: await file(folder + names("diffuse")) };
      if (type === "decal" && hasNormal === true) sources.normal = await file(folder + names("normal"));
      if (type === "item") for (const channel of ["normal", "depth"] as const) sources[channel] = await file(folder + names(channel));
      for (const [channel, bytes] of Object.entries(sources)) {
        const info = await sharp(bytes).metadata();
        if ((info.format !== "png" && info.format !== "webp") || info.width !== width || info.height !== height) throw new Error(`Invalid image: ${folder}${names(channel as BundleMapKey)}`);
      }
      const encoded: Partial<Record<BundleMapKey, Encoded>> = {};
      for (const key of Object.keys(sources) as BundleMapKey[]) encoded[key] = await encodeSource(sources[key]!);
      const exts: Partial<Record<BundleMapKey, BundleExt>> = {};
      for (const [key, one] of Object.entries(encoded) as [BundleMapKey, Encoded][]) {
        exts[key] = one.ext;
        record(id, key === "diffuse" ? `${type} image` : key, `${key}.${one.ext}`, one);
      }
      const files = bundleFileNames(exts);
      // public/shared-images/<id>.<ext>, <id>.normal.<ext>, <id>.depth.<ext>
      await mkdir(join(root, "public/shared-images"), { recursive: true });
      for (const [key, one] of Object.entries(encoded) as [BundleMapKey, Encoded][]) {
        await writeFile(join(root, "public/shared-images", key === "diffuse" ? `${id}.${one.ext}` : `${id}.${key}.${one.ext}`), one.bytes, { flag: "wx" });
      }
      const validPurpose = type === "portrait" && (purpose === "loading" || purpose === "portrait" || purpose === "room") ? purpose : undefined;
      catalog.images[id] = { world, type, name, width, height, rev, files,
        ...(validPurpose ? { purpose: validPurpose } : {}),
        ...(type === "decal" && ["wall", "floor", "ceiling"].includes(surface) ? { surface } : {}),
        ...(type === "decal" && encoded.normal ? { hasNormal: true } : {}),
        ...(type === "item" ? { pickup: readPickupAppearance(pickup) } : {}) };
      await saveCatalog();
      console.log(`Bundled ${type} ${id} (r${rev}).`);
      break;
    }
  }
}

// The latest revision folder of `path` whose meta.json is of the wanted type (half-published folders are skipped).
async function latestMeta(path: string, type: string) {
  for (const rev of revisionNumbers(await list(path))) {
    const folder = `${path}/r${rev}/`;
    const response = await asset(folder + "meta.json");
    if (response.status === 400 || response.status === 404) continue;
    if (!response.ok) throw new Error(`Could not read ${folder} metadata (HTTP ${response.status}).`);
    const meta = await response.json().catch(() => null);
    if (meta?.type === type) return { rev, folder, meta };
  }
}

// Props, door types and NPCs: the definition goes into the catalog (re-checked when the game installs it);
// an NPC's colour map (png or webp) and normal map go to public/shared-actors/<id>/.
async function pullDefinitions(world: string, kind: DefinitionKind) {
  const bundled = (catalog.definitions ??= { prop: {}, door: {}, actor: {} })[kind] ??= {};
  for (const { name: uuidPart } of await list(`${world}/${kind}`)) {
    if (!uuid.test(uuidPart)) continue;
    const id = `${world}_${kind}_${uuidPart}`;
    const found = await latestMeta(`${world}/${kind}/${uuidPart}`, kind);
    if (!found || !found.meta.definition || typeof found.meta.definition !== "object") continue;
    if (Object.hasOwn(bundled, id)) {
      if (bundled[id].rev !== found.rev) console.warn(`Kept existing ${kind} ${id}; shared revision: ${found.rev}.`);
      continue;
    }
    const definition = found.meta.definition;
    if (kind === "actor") {
      const target = join(root, "public", bundledActorFolder(id));
      if (existsSync(target)) { console.warn(`Kept existing NPC files ${id}.`); continue; }
      if (typeof definition.name !== "string" || !Number.isSafeInteger(definition.width) || !Number.isSafeInteger(definition.height) ||
          (definition.diffuseFile !== undefined && definition.diffuseFile !== "diffuse.png" && definition.diffuseFile !== "diffuse.webp")) {
        console.warn(`Skipped NPC ${id}: invalid definition.`);
        continue;
      }
      if (dryRun) { console.log(`Would bundle ${kind} ${id} (r${found.rev}): colour map${definition.hasNormal === true ? " + normal map" : ""}; the colour map the smaller of PNG and lossless WebP, the normal map PNG (sizes known after the download).`); continue; }
      console.log(`${kind} ${id} (r${found.rev}):`);
      // the colour map may become png or webp (definition.diffuseFile says which, as the editor writes it); the normal map stays a png
      const files: Record<string, Buffer> = {};
      for (const name of actorFiles(definition)) {
        const bytes = await file(found.folder + name);
        const info = await sharp(bytes).metadata();
        const format = name.endsWith(".webp") ? "webp" : "png";
        if (info.format !== format || (name.startsWith("diffuse") && (info.width !== definition.width || info.height !== definition.height))) {
          throw new Error(`Invalid ${format}: ${found.folder}${name}`);
        }
        const diffuse = name.startsWith("diffuse");
        const one = await encodeSource(bytes, { pngOnly: !diffuse });
        const stem = diffuse ? "diffuse" : "normal";
        files[`${stem}.${one.ext}`] = one.bytes;
        record(id, `npc ${stem}`, `${stem}.${one.ext}`, one);
        if (diffuse) {
          // (the definition is what the game reads the name from: an NPC sheet without it is a png)
          if (one.ext === "webp") definition.diffuseFile = "diffuse.webp";
          else if (definition.diffuseFile !== undefined) definition.diffuseFile = "diffuse.png";
        }
      }
      await mkdir(dirname(target), { recursive: true });
      const staging = await mkdtemp(join(dirname(target), ".pull-shared-"));
      for (const [name, bytes] of Object.entries(files)) await writeFile(join(staging, name), bytes);
      await moveFolder(staging, target);
    } else {
      if (dryRun) { console.log(`Would bundle ${kind} ${id} (r${found.rev}).`); continue; }
      // textures a prop or door uses that are not bundled (they come with their own pull) are worth a warning
      const used = kind === "prop" ? [definition.texture] : [definition.leaf, definition.frame];
      for (const texture of used) {
        if (typeof texture === "string" && texture.includes("_shared_") && !Object.hasOwn(catalog.textures, texture) && !existsSync(join(root, "public/textures", texture))) {
          console.warn(`${kind} ${id} uses texture ${texture}, which is not bundled (is it published?).`);
        }
      }
    }
    bundled[id] = { rev: found.rev, definition };
    await saveCatalog();
    console.log(`Bundled ${kind} ${id} (r${found.rev}).`);
  }
}

// Dialogue libraries (src/dialogues/<id>.twee) and shops (src/shops/<id>.json) are world-independent.
// A file this script wrote earlier is updated to a newer revision; a hand-made file with the same id is kept.
async function pullCommon(kind: CommonKind) {
  const tracked = (catalog[kind === "dialogue" ? "dialogues" : "shops"] ??= {});
  for (const { name: id } of await list(`${COMMON_FOLDER}/${kind}`)) {
    if (!commonIdOk(id)) continue;
    const found = await latestMeta(commonFolder(kind, id), kind);
    const definition = found && readCommonDefinition(kind, found.meta, id);
    if (!found || !definition) continue;
    const target = join(root, kind === "dialogue" ? "src/dialogues" : "src/shops", id + (kind === "dialogue" ? ".twee" : ".json"));
    const mine = Object.hasOwn(tracked, id);
    if (existsSync(target) && !(mine && tracked[id] < found.rev)) {
      if (tracked[id] !== found.rev) console.warn(`Kept existing ${kind} ${id}; shared revision: ${found.rev}.`);
      continue;
    }
    if (dryRun) { console.log(`Would bundle ${kind} ${id} (r${found.rev}).`); continue; }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "twee" in definition ? definition.twee.replace(/\r\n?/g, "\n").replace(/\n*$/, "\n") : json(definition));
    Object.defineProperty(tracked, id, { value: found.rev, enumerable: true, writable: true, configurable: true });
    await saveCatalog();
    console.log(`Bundled ${kind} ${id} (r${found.rev}).`);
  }
}

await pullCommon("dialogue");
await pullCommon("shop");

for (const world of ["fantasy", "scifi"]) {
  for (const { name } of await list(world)) await pullTexture(world, name);
  await pullImages(world, "portrait");
  await pullImages(world, "decal");
  await pullImages(world, "item");
  await pullImages(world, "sky");
  for (const kind of ["prop", "door", "actor"] as const) await pullDefinitions(world, kind);
  const heads = await pages<{ id: string; revision: number }>(offset =>
    request(`/rest/v1/void_map_heads?select=id,revision&world=eq.${world}&order=id&limit=100&offset=${offset}`));
  const versions = catalog.maps[world] ??= {};
  for (const { id, revision } of heads) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !Number.isSafeInteger(revision) || revision < 1) continue;
    const target = join(root, "src/maps", world, id + ".json");
    const otherWorld = world === "fantasy" ? "scifi" : "fantasy";
    if (existsSync(target) || existsSync(join(root, "src/maps", otherWorld, id + ".json")) || Object.hasOwn(versions, id)) {
      if (versions[id] !== revision) console.warn(`Kept existing map ${world}/${id}; shared revision: ${revision}.`);
      continue;
    }
    if (dryRun) { console.log(`Would bundle map ${world}/${id} (r${revision}).`); continue; }
    const response = await request(`/rest/v1/void_maps?select=body&world=eq.${world}&id=eq.${id}&revision=eq.${revision}`);
    if (!response.ok) throw new Error(`Could not download map ${id} (HTTP ${response.status}).`);
    const [row] = await response.json();
    if (!Array.isArray(row?.body?.layout)) throw new Error(`Invalid map ${id} (r${revision}).`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json(row.body), { flag: "wx" });
    Object.defineProperty(versions, id, { value: revision, enumerable: true, writable: true, configurable: true });
    await saveCatalog();
    console.log(`Bundled map ${world}/${id} (r${revision}).`);
  }
}

printSummary();
