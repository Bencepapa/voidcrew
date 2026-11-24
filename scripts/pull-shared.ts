import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import sharp from "sharp";
import { generateMaps } from "../src/render/depthNormal";
import { readPickupAppearance } from "../src/game/bundledImages";
import { actorFiles, bundledActorFolder, COMMON_FOLDER, commonFolder, commonIdOk, readCommonDefinition, revisionNumbers, type CommonKind, type DefinitionKind } from "../src/game/sharedContent";

// npm run pull:shared [outdir] [--list]
//   --list (alias --dry-run): only says what would be bundled (and what is kept as it is); nothing is downloaded
//   beyond the small meta.json / map-head reads, and nothing is written.
const flags = process.argv.slice(2).filter(arg => arg.startsWith("--"));
const [output] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const dryRun = flags.includes("--list") || flags.includes("--dry-run");
for (const flag of flags) if (!["--list", "--dry-run"].includes(flag)) throw new Error(`Unknown option ${flag} (use --list).`);
const root = resolve(output ?? ".");
const catalogPath = join(root, "src/game/sharedBuiltins.json");
const catalog = existsSync(catalogPath)
  ? JSON.parse(await readFile(catalogPath, "utf8"))
  : { textures: {}, maps: {} };
catalog.images ??= {};
for (const path of [".env.local", ".env"]) if (existsSync(path)) loadEnvFile(path);
const project = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!project || !key) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
const bucket = "/storage/v1/object/";
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
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

async function saveCatalog() {
  if (dryRun) return;
  await mkdir(dirname(catalogPath), { recursive: true });
  const pending = catalogPath + ".tmp";
  await writeFile(pending, json(catalog));
  await rename(pending, catalogPath);
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
  if (dryRun) { console.log(`Would bundle texture ${id} (r${rev}).`); return; }
  const maps = meta.maps ?? {};
  const files: Record<string, Buffer> = { "diffuse.png": await file(legacy ? folder : folder + "/diffuse.png") };
  for (const channel of ["normal", "depth", "emissive"]) {
    if (maps[channel] === "uploaded") files[channel + ".png"] = await file(`${folder}/${channel}.png`);
  }
  if (maps.gloss === "uploaded" || maps.metal === "uploaded") files["surface.png"] = await file(folder + "/surface.png");
  const source = meta.transparency?.source;
  if (maps.normal === "auto" || maps.depth === "auto" || source === "none" || source === "colorKey") {
    const { data, info: { width, height } } = await sharp(files["diffuse.png"]).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = new Uint8ClampedArray(data);
    const hex = /^#([\da-f]{6})$/i.exec(meta.transparency?.colorKey ?? "")?.[1] ?? "ff00ff";
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    if (source === "none" || source === "colorKey") {
      for (let i = 0; i < rgba.length; i += 4) {
        if (source === "none") rgba[i + 3] = 255;
        else if (rgb.every((value, channel) => Math.abs(value - rgba[i + channel]) <= 6)) rgba[i + 3] = 0;
      }
    }
    const png = (pixels: Uint8ClampedArray) => sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer();
    if (source === "none" || source === "colorKey") files["diffuse.png"] = await png(rgba);
    if (maps.normal === "auto" || maps.depth === "auto") {
      const generated = generateMaps(rgba, width, height);
      for (const channel of ["normal", "depth"] as const) {
        if (maps[channel] === "auto") files[channel + ".png"] = await png(generated[channel]);
      }
    }
  }
  const kinds = (Array.isArray(meta.kinds) ? meta.kinds : []).filter((kind: unknown) => ["wall", "floor", "ceiling", "propFace"].includes(kind as string));
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), ".pull-shared-"));
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(staging, name), bytes);
  await rename(staging, target);
  catalog.textures[id] = { rev, label: meta.name, kinds: kinds.length ? kinds : ["wall", "floor"], pixelArt: meta.pixelArt !== false,
    smooth: meta.smooth === true, files: Object.keys(files), tuning: meta.tuning };
  await saveCatalog();
  console.log(`Bundled texture ${id} (r${rev}).`);
}

// Stills (portrait), decals and pickups (item). A pickup comes with its normal and depth maps
// (public/shared-images/<id>.normal.png / .depth.png) and its look (category, height, glow, value) in the catalog.
async function pullImages(world: string, type: "portrait" | "decal" | "item") {
  const prefix = `${world}/${type}`;
  for (const { name: idPart } of await list(prefix)) {
    if (!uuid.test(idPart)) continue;
    const path = `${prefix}/${idPart}`;
    const id = `${world}_${type}_${idPart}`;
    const target = join(root, "public/shared-images", id + ".png");
    const versions = (await list(path)).flatMap(({ name }) => /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : [])
      .filter(Number.isSafeInteger).sort((a, b) => b - a);
    for (const rev of versions) {
      const folder = `${path}/r${rev}/`;
      const response = await asset(folder + "meta.json");
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) throw new Error(`Could not read ${folder} metadata (HTTP ${response.status}).`);
      const { name, type: savedType, width, height, surface, purpose, hasNormal, pickup } = await response.json();
      if (savedType !== type || typeof name !== "string" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) continue;
      if (existsSync(target) || Object.hasOwn(catalog.images, id)) {
        if (catalog.images[id]?.rev !== rev) console.warn(`Kept existing ${id}; shared revision: ${rev}.`);
        break;
      }
      if (dryRun) { console.log(`Would bundle ${type} ${id} (r${rev}).`); break; }
      const png = await file(folder + "diffuse.png");
      const actual = await sharp(png).metadata();
      if (actual.format !== "png" || actual.width !== width || actual.height !== height) throw new Error(`Invalid PNG: ${folder}diffuse.png`);
      // a decal's own normal map (revisions before it have none): public/shared-images/<id>.normal.png (checked before anything is written)
      // a pickup's normal and depth maps (publishing always makes both): <id>.normal.png and <id>.depth.png
      const extra: Record<string, Buffer> = {};
      if (type === "decal" && hasNormal === true) extra.normal = await file(folder + "normal.png");
      if (type === "item") for (const channel of ["normal", "depth"]) extra[channel] = await file(`${folder}${channel}.png`);
      for (const [channel, bytes] of Object.entries(extra)) {
        const info = await sharp(bytes).metadata();
        if (info.format !== "png" || info.width !== width || info.height !== height) throw new Error(`Invalid PNG: ${folder}${channel}.png`);
      }
      await mkdir(dirname(target), { recursive: true });
      for (const [channel, bytes] of Object.entries(extra)) await writeFile(join(root, "public/shared-images", `${id}.${channel}.png`), bytes, { flag: "wx" });
      await writeFile(target, png, { flag: "wx" });
      const validPurpose = type === "portrait" && (purpose === "loading" || purpose === "portrait" || purpose === "room") ? purpose : undefined;
      catalog.images[id] = { world, type, name, width, height, rev,
        ...(validPurpose ? { purpose: validPurpose } : {}),
        ...(type === "decal" && ["wall", "floor", "ceiling"].includes(surface) ? { surface } : {}),
        ...(type === "decal" && extra.normal ? { hasNormal: true } : {}),
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
      if (dryRun) { console.log(`Would bundle ${kind} ${id} (r${found.rev}).`); continue; }
      const files: Record<string, Buffer> = {};
      for (const name of actorFiles(definition)) {
        files[name] = await file(found.folder + name);
        const info = await sharp(files[name]).metadata();
        const format = name.endsWith(".webp") ? "webp" : "png";
        if (info.format !== format || (name.startsWith("diffuse") && (info.width !== definition.width || info.height !== definition.height))) {
          throw new Error(`Invalid ${format}: ${found.folder}${name}`);
        }
      }
      await mkdir(dirname(target), { recursive: true });
      const staging = await mkdtemp(join(dirname(target), ".pull-shared-"));
      for (const [name, bytes] of Object.entries(files)) await writeFile(join(staging, name), bytes);
      await rename(staging, target);
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
