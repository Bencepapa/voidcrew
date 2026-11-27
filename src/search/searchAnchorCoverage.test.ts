import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const files = [
  "components/DebugPanel.tsx", "components/MapRenderSettings.tsx",
  "components/SoundSection.tsx", "components/AudioProbeSection.tsx",
  "components/SharedCacheDebugSection.tsx", "components/StoryDebugSection.tsx",
  "editor/PropAssetFields.tsx", "editor/PrismPropFields.tsx",
];
const controls = new Set(["input", "select", "textarea", "button", "NumberField"]);
const helpers = new Set(["range", "check", "slider", "textureSelect"]);
const exceptions = new Map<string, string>([
  ["components/DebugPanel.tsx textarea onChange={(e) => setPostBox({ ...postBox, text: e.target.value })}", "Transient editor opened by the anchored copy and paste controls."],
  ["components/DebugPanel.tsx button onClick={() => applyPostText(postBox.text)}", "Transient editor opened by the anchored copy and paste controls."],
  ["components/DebugPanel.tsx button onClick={() => setPostBox(null)}", "Transient editor opened by the anchored copy and paste controls."],
  ["components/DebugPanel.tsx select onChange={(e) => onMood({ ...moodOverride, [key]: e.target.value || undefined })}", "Seeded variation overrides are available only for varied maps."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt(relative(0, 3)))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt(relative(0, -3)))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt(relative(-3, 0)))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playOrbit())}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt({ ...relative(3, 0), walls: 3 }))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt({ ...relative(3, 0), cackle: true }, 6000))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt({ ...relative(-3, 0), cackle: true }, 6000))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playAt({ ...relative(3, 0), cackle: true, walls: 2 }, 6000))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => playMany(20))}", "The probe group already has one entry point."],
  ["components/AudioProbeSection.tsx button onClick={run(() => stopAllProbes())}", "The probe group already has one entry point."],
  ["components/StoryDebugSection.tsx input onChange={(e) => storyDebugSetVar(scope, name, e.target.checked)}", "Campaign data or the action paired with the chapter picker."],
  ["components/StoryDebugSection.tsx input key={String(value)} type={typeof value === \"number\" ? \"number\" : \"text\"} defaultValue={value} className={`${FIELD} w-28`} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === \"Enter\") commit(e.currentTarget.value); }}", "Campaign data or the action paired with the chapter picker."],
  ["components/StoryDebugSection.tsx button onClick={() => storyJumpToChapter(jump)}", "Campaign data or the action paired with the chapter picker."],
  ["components/StoryDebugSection.tsx select onChange={(e) => storyDebugSetQuest(id, e.target.value as QuestState)}", "Campaign data or the action paired with the chapter picker."],
  ["editor/PropAssetFields.tsx button onClick={startPublish}", "Publishing or discarding a draft requires an explicit action in the form."],
  ["editor/PropAssetFields.tsx button onClick={async () => { if (!window.confirm(t(\"assetManager.image.discardConfirm\", { name: definition.name || t(\"assetManager.untitled\") }))) return; try { await discardPropDraft(draft.id); } catch (error) { onError(errorText(error)); } }}", "Publishing or discarding a draft requires an explicit action in the form."],
]);
const found = new Set<string>();
const gaps: string[] = [];

for (const file of files) {
  const path = new URL(`../${file}`, import.meta.url);
  const source = ts.createSourceFile(file, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function missing(node: ts.Node, name: string, description: string) {
    const key = `${file} ${name} ${description.replace(/\s+/g, " ").trim()}`;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (exceptions.has(key)) found.add(key);
    else gaps.push(`${file}:${line}: ${key}`);
  }
  function walk(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attributes = node.attributes.getText(source);
      if (controls.has(tag) && !/\bsearchAnchor\(|\{\.\.\.(?:s\.)?anchor\b|\banchor=\{sizeAnchors\[axis\]\}/.test(attributes)) {
        const property = node.attributes.properties.find(prop =>
          ts.isJsxAttribute(prop) && (prop.name.getText(source) === "onClick" || prop.name.getText(source) === "onChange"));
        missing(node, tag, property?.getText(source) ?? attributes);
      }
    }
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.flatMap(prop => prop.name ? [prop.name.getText(source)] : []);
      if (["key", "label", "min", "max"].every(name => names.includes(name))) {
        if (!names.includes("anchor")) missing(node, "slider-config", node.properties.find(prop => prop.name?.getText(source) === "key")!.getText(source));
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text)) {
      const name = node.expression.text;
      const argumentsText = node.arguments.map(argument => argument.getText(source)).join(" ");
      // Named slider configs are checked at their declaration.
      if (!(name === "slider" && node.arguments[0] && ts.isIdentifier(node.arguments[0])) &&
          !/\bsearchAnchor\(/.test(argumentsText)) missing(node, name, node.arguments[0]?.getText(source) ?? "");
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}

const stale = [...exceptions.keys()].filter(key => !found.has(key));
assert.deepEqual(stale, [], "Remove obsolete search-anchor exceptions");
assert.equal(gaps.length, 0, `Unanchored editor controls:\n${gaps.join("\n")}`);
