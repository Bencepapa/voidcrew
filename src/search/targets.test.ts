import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dictionaryText } from "../i18n";
import { ASSET_SEARCH_KINDS, assetTarget } from "./assetTargets";
import { registerEditorSearchOpeners } from "./editorSearchOpeners";
import { hasOpener, navigate } from "./openers";
import { searchAnchor } from "./searchAnchor";
import { findSearchTarget, SEARCH_TARGETS } from "./targets";

async function main() {
  const src = new URL("../", import.meta.url);
  const anchored = new Set<string>();
  for (const path of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!path.endsWith(".tsx")) continue;
    const source = readFileSync(new URL(path.replaceAll("\\", "/"), src), "utf8");
    for (const match of source.matchAll(/\bsearchAnchor\(["']([^"']+)["']\)/g)) anchored.add(match[1]);
  }
  const unregister = registerEditorSearchOpeners({
    openMapRender: () => {},
    openAssetTree: () => {},
    openDebug: () => {},
    openAssetManager: () => {},
    openAsset: () => {},
  });
  const ids = new Set<string>();
  for (const target of SEARCH_TARGETS) {
    assert.match(target.id, /^[\w]+(?:\.[\w]+)+$/);
    assert.ok(hasOpener(target.kind), `Missing opener for ${target.id}`);
    for (const lang of ["en", "hu"] as const) {
      assert.ok(dictionaryText(target.titleKey, lang), `Missing ${lang} ${target.titleKey} for ${target.id}`);
    }
    assert.ok(anchored.has(target.id), `Missing searchAnchor for ${target.id}`);
    for (const id of [target.id, ...(target.oldIds ?? [])]) {
      assert.ok(!ids.has(id), `Duplicate target ID or alias ${id}`);
      ids.add(id);
      assert.equal(findSearchTarget(id), target);
    }
  }
  for (const kind of ASSET_SEARCH_KINDS) {
    const target = assetTarget({ kind, id: "catalog-item_1", name: "Fixture", category: "test" });
    assert.ok(hasOpener(target.kind), `Missing opener for ${target.kind}`);
    for (const lang of ["en", "hu"] as const) assert.ok(dictionaryText(target.titleKey, lang), `Missing ${lang} ${target.titleKey}`);
  }
  assert.deepEqual(searchAnchor("tool.roofAuto"), { "data-search-target": "tool.roofAuto" });
  await assert.doesNotReject(async () => assert.equal(await navigate("missing"), false));
  unregister();
  assert.ok(SEARCH_TARGETS.every(target => !hasOpener(target.kind)));
}

void main();
