// Dialogue libraries and shops in the shared store (world-independent, append-only, JSON only):
//   common/dialogue/<id>/r<rev>/meta.json   { v, type, rev, definition: { name, twee } }
//   common/shop/<id>/r<rev>/meta.json       { v, type, rev, definition: ShopDef }
// Guests read them (loaded in the background by autoShared); editors publish. Pure parts: game/sharedContent.ts.
import { setSharedDialogues } from "../game/dialogueCatalog";
import type { DialogueSource } from "../game/dialogueCatalogCore";
import type { ShopDef } from "../game/shop";
import { setSharedShops } from "../game/shopCatalog";
import { commonFolder, commonIdOk, commonMeta, COMMON_FOLDER, nextRevision, readCommonDefinition, revisionNumbers, type CommonKind, type SharedDialogueDefinition } from "../game/sharedContent";
import { t } from "../i18n";
import { sharedConfigured, sharedToken, sharedUpload } from "./sharedAuth";
import { listSharedObjects, sharedAssetBase } from "./sharedTextures";

type Definition<K extends CommonKind> = { dialogue: SharedDialogueDefinition; shop: ShopDef }[K];

async function loadAll<K extends CommonKind>(kind: K, init?: RequestInit): Promise<Map<string, Definition<K>>> {
  const prefix = `${COMMON_FOLDER}/${kind}`;
  const folders = (await listSharedObjects(prefix, init)).filter(({ name }) => commonIdOk(name));
  const rows = await Promise.all(folders.map(async ({ name: id }) => {
    for (const rev of revisionNumbers(await listSharedObjects(`${prefix}/${id}`, init))) {
      const response = await fetch(`${sharedAssetBase()}${prefix}/${id}/r${rev}/meta.json`, init);
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) throw new Error(`${kind}: HTTP ${response.status}`);
      const definition = readCommonDefinition(kind, await response.json().catch(() => null), id);
      if (definition) return [id, definition as Definition<K>] as const;
    }
  }));
  return new Map(rows.filter(row => row !== undefined));
}

async function publish(kind: CommonKind, id: string, definition: object) {
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  if (!commonIdOk(id)) throw new Error(t("dialogue.publishBadId"));
  const folder = commonFolder(kind, id);
  const rev = nextRevision(await listSharedObjects(folder));
  await sharedUpload(`/storage/v1/object/void-textures/${folder}/r${rev}/meta.json`, JSON.stringify(commonMeta(kind, rev, definition)), "application/json");
  return rev;
}

let dialogues = new Map<string, DialogueSource>();
let loadedDialogues = 0;

export async function loadSharedDialogues(init?: RequestInit) {
  if (!sharedConfigured) return;
  const request = ++loadedDialogues;
  const rows = await loadAll("dialogue", init);
  if (init?.signal?.aborted || request !== loadedDialogues) return;
  dialogues = new Map([...rows].map(([id, { twee }]) => [id, { id, twee }]));
  setSharedDialogues([...dialogues.values()]);
}

export async function loadSharedShops(init?: RequestInit) {
  if (!sharedConfigured) return;
  const rows = await loadAll("shop", init);
  if (!init?.signal?.aborted) setSharedShops(rows);
}

/** Publishes a local dialogue library as the next revision of its id (append-only). */
export async function publishDialogue(id: string, name: string, twee: string) {
  const rev = await publish("dialogue", id, { name, twee });
  dialogues = new Map(dialogues).set(id, { id, twee });
  loadedDialogues++;
  setSharedDialogues([...dialogues.values()]);
  return rev;
}

/** Publishes a shop as the next revision of its id. (No editor UI yet: shop editing is H4b.) */
export async function publishShop(shop: ShopDef) {
  const rev = await publish("shop", shop.id, shop);
  await loadSharedShops();
  return rev;
}
