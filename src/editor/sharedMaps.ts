// Opening a shared map revision as a local (unsaved) map. Guests can do this;
// saving and publishing still need a signed-in editor.

import { t } from "../i18n";
import type { MapFile } from "../game/mapFormat";
import type { GameMap } from "../game/types";
import type { WorldId } from "../game/worlds";
import { createMap } from "./mapStore";
import { sharedProject, sharedRequest } from "./sharedAuth";
import type { SharedMapHead } from "./sharedMapHeads";

const SEP = " – ";

// a shared head's title is "Place – Name" (the head table has no place column)
export function splitSharedTitle(title: string): { place?: string; name: string } {
  const i = title.indexOf(SEP);
  return i > 0 ? { place: title.slice(0, i), name: title.slice(i + SEP.length) } : { name: title };
}

const origins = new Map<string, SharedMapHead>();
const originKey = (world: WorldId, id: string) => JSON.stringify([sharedProject, world, id]);

export function sharedOrigin(world: WorldId, id: string): SharedMapHead | undefined {
  const key = originKey(world, id);
  try {
    return origins.get(key) ?? JSON.parse(localStorage.getItem("voidcrew:shared:" + key) ?? "null");
  } catch {
    return origins.get(key);
  }
}

export function rememberSharedOrigin(world: WorldId, id: string, head: SharedMapHead) {
  const key = originKey(world, id);
  origins.set(key, head);
  try {
    localStorage.setItem("voidcrew:shared:" + key, JSON.stringify(head));
  } catch {
    /* the session cache remains available */
  }
}

// Fetches the revision's body and creates a new local map from it.
export async function loadSharedMap(world: WorldId, head: SharedMapHead, init?: RequestInit): Promise<GameMap> {
  const rows = await sharedRequest<{ body: MapFile }[]>(
    "/rest/v1/void_maps?select=body&world=eq." + world + "&id=eq." + encodeURIComponent(head.id) + "&revision=eq." + head.revision,
    init,
  );
  if (!rows.length) throw new Error(t("editorShell.shared.mapVersionUnavailable"));
  const id = "shared-" + crypto.randomUUID();
  // (a version saved before places existed: the place comes from the title, else "Shared")
  const body = { ...rows[0].body };
  if (!body.place) {
    const { place, name } = splitSharedTitle(head.title);
    body.place = place ?? t("mapDialog.sharedPlace");
    body.name = name;
    body.showTitle ??= false;
  }
  const result = createMap(id, body, undefined, world);
  if ("error" in result) throw new Error(result.error);
  rememberSharedOrigin(world, id, head);
  return result.map;
}
