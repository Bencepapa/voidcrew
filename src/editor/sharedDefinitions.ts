import type { WorldId } from "../game/worlds";
import { listSharedObjects, sharedAssetBase } from "./sharedTextures";
import { sharedUpload } from "./sharedAuth";

type Kind = "prop" | "door" | "actor";
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const revisions = (rows: { name: string }[]) => rows.flatMap(({ name }) =>
  /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : []).filter(Number.isSafeInteger).sort((a, b) => b - a);

export async function loadDefinitions<T>(world: WorldId, kind: Kind, read: (raw: unknown, base: string) => T | undefined, init?: RequestInit) {
  const prefix = `${world}/${kind}`;
  const rows = await listSharedObjects(prefix, init);
  const definitions = await Promise.all(rows.filter(({ name }) => uuidPattern.test(name)).map(async ({ name }) => {
    const path = `${prefix}/${name}`;
    for (const revision of revisions(await listSharedObjects(path, init))) {
      const base = `${sharedAssetBase()}${path}/r${revision}/`;
      const response = await fetch(`${base}meta.json`, init);
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) throw new Error(`${kind} asset: HTTP ${response.status}`);
      const metadata = await response.json().catch(() => null);
      if (metadata?.type !== kind) continue;
      const definition = read(metadata.definition, base);
      if (definition) return [`${world}_${kind}_${name}`, definition] as const;
    }
  }));
  return new Map(definitions.filter(row => row !== undefined));
}

export async function publishDefinition(world: WorldId, kind: Kind, id: string, definition: object, files: { name: string; blob: Blob }[] = []) {
  const prefix = `${world}_${kind}_`;
  const uuid = id.slice(prefix.length);
  if (!id.startsWith(prefix) || !uuidPattern.test(uuid)) throw new Error("Invalid asset ID");
  const path = `${world}/${kind}/${uuid}`;
  const rev = (revisions(await listSharedObjects(path))[0] ?? 0) + 1;
  const revisionPath = `${path}/r${rev}/`;
  for (const { name, blob } of files) {
    await sharedUpload(`/storage/v1/object/void-textures/${revisionPath}${name}`, blob, blob.type);
  }
  await sharedUpload(`/storage/v1/object/void-textures/${revisionPath}meta.json`,
    JSON.stringify({ v: 1, type: kind, rev, definition }), "application/json");
  return sharedAssetBase() + revisionPath;
}
