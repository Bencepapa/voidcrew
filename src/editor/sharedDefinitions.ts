import type { WorldId } from "../game/worlds";
import { listSharedObjects, sharedAssetBase } from "./sharedTextures";
import { sharedUpload } from "./sharedAuth";

type Kind = "prop" | "door";
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const revisions = (rows: { name: string }[]) => rows.flatMap(({ name }) =>
  /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : []).filter(Number.isSafeInteger).sort((a, b) => b - a);

export async function loadDefinitions<T>(world: WorldId, kind: Kind, read: (raw: unknown) => T | undefined, init?: RequestInit) {
  const prefix = `${world}/${kind}`;
  const rows = await listSharedObjects(prefix, init);
  const definitions = await Promise.all(rows.filter(({ name }) => uuidPattern.test(name)).map(async ({ name }) => {
    const path = `${prefix}/${name}`;
    for (const revision of revisions(await listSharedObjects(path, init))) {
      const response = await fetch(`${sharedAssetBase()}${path}/r${revision}/meta.json`, init);
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) throw new Error(`${kind} asset: HTTP ${response.status}`);
      const metadata = await response.json().catch(() => null);
      if (metadata?.type !== kind) continue;
      const definition = read(metadata.definition);
      if (definition) return [`${world}_${kind}_${name}`, definition] as const;
    }
  }));
  return new Map(definitions.filter(row => row !== undefined));
}

export async function publishDefinition(world: WorldId, kind: Kind, id: string, definition: object) {
  const prefix = `${world}_${kind}_`;
  const uuid = id.slice(prefix.length);
  if (!id.startsWith(prefix) || !uuidPattern.test(uuid)) throw new Error("Invalid asset ID");
  const path = `${world}/${kind}/${uuid}`;
  const rev = (revisions(await listSharedObjects(path))[0] ?? 0) + 1;
  await sharedUpload(`/storage/v1/object/void-textures/${path}/r${rev}/meta.json`,
    JSON.stringify({ v: 1, type: kind, rev, definition }), "application/json");
}
