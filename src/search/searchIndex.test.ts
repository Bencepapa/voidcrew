import assert from "node:assert/strict";
import { debugEn } from "../i18n/en/debug";
import { debugHu } from "../i18n/hu/debug";
import { editorShellEn } from "../i18n/en/editorShell";
import { editorShellHu } from "../i18n/hu/editorShell";
import { normalizeSearch } from "./normalizeSearch";
import { buildSearchIndex } from "./searchIndex";
import { assetTarget } from "./assetTargets";
import { SEARCH_TARGETS, type SearchTarget } from "./targets";

assert.equal(normalizeSearch("  TETŐ\t és Égbolt "), "teto es egbolt");
for (const dictionary of [{ ...debugEn, ...editorShellEn }, { ...debugHu, ...editorShellHu }]) {
  const index = buildSearchIndex(SEARCH_TARGETS, target => dictionary[target.titleKey as keyof typeof dictionary] ?? target.titleKey);
  for (const query of ["napszak", "time of day"]) {
    assert.equal(index.query(query)[0]?.id, "setting.sky.timeOfDay", query);
  }
  for (const query of ["nap", "sun"]) {
    assert.ok(index.query(query).some(target => target.id === "setting.sky.timeOfDay"), query);
  }
  for (const query of ["teto", "tet", "auto roof"]) {
    assert.equal(index.query(query)[0]?.id, "tool.roofAuto", query);
  }
  // a typo still finds the roof tool group among the first few (the roof forms are its own entries)
  assert.ok(index.query("rorf").slice(0, 3).some(target => target.id === "tool.roofAuto"), "rorf");
  assert.equal(index.query("skyLightAzimuth")[0]?.id, "setting.sky.sunAzimuth");
  assert.equal(index.query("light probes")[0]?.id, "debug.lightProbes");
  assert.deepEqual(index.query(""), []);
  assert.deepEqual(index.query("zzzzzzzz"), []);
}

const base: Omit<SearchTarget, "id"> = { kind: "debug", titleKey: "debug.debug", synonyms: [], keywords: [] };
const ranked = buildSearchIndex([
  { ...base, id: "keyword", keywords: ["lantern"] },
  { ...base, id: "oldId", oldIds: ["lantern"] },
  { ...base, id: "synonym", synonyms: ["lantern"] },
  { ...base, id: "title" },
], target => target.id === "title" ? "lantern" : "");
assert.deepEqual(ranked.query("lantern").map(target => target.id), ["title", "synonym", "oldId", "keyword"]);

const worlds = buildSearchIndex([
  { ...base, id: "neutral" },
  { ...base, id: "fantasy", world: "fantasy" },
  { ...base, id: "scifi", world: "scifi" },
], () => "lantern");
assert.equal(worlds.query("lantern", "fantasy")[0]?.id, "fantasy");
assert.equal(worlds.query("lantern", "scifi")[0]?.id, "scifi");
assert.equal(worlds.query("lantern")[0]?.id, "neutral");

const catalogue = buildSearchIndex([{ ...base, id: "static" }], target => target.asset?.name ?? "roof");
const one = assetTarget({ kind: "assetSound", id: "fantasy_sound_00000000-0000-4000-8000-000000000001", name: "Share Bell", category: "effect" });
const renamed = assetTarget({ ...one.asset!, name: "Village Chime" });
catalogue.replaceAssets([one]);
assert.equal(catalogue.query("bell")[0]?.id, one.id);
catalogue.replaceAssets([renamed]);
assert.equal(renamed.id, one.id);
assert.deepEqual(catalogue.query("bell"), []);
assert.equal(catalogue.query("chime")[0]?.id, one.id);
assert.equal(catalogue.query("roof")[0]?.id, "static");
catalogue.replaceAssets([]);
assert.deepEqual(catalogue.query("chime"), []);
