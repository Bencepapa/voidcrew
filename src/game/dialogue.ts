// Dialogue libraries written in Twine and exported as Twee 3. Pure code (no DOM), see concept/dialogue-shop-plan.md.
// One .twee file = one library (one Twine story); the passage names are global in it and NPCs share passages.

export type DialogueCommand =
  | { kind: "end" }
  | { kind: "shop"; shop?: string } // no id = the NPC's own shop
  | { kind: "unknown"; raw: string };

export interface DialoguePassage {
  name: string;
  tags: string[];
  text: string;
  choices: { label: string; to: string }[];
  commands: DialogueCommand[];
}

export interface Dialogue {
  id: string;
  title: string;
  /** the passages an NPC can start from: tagged `start`, plus one named exactly `Start` */
  entries: string[];
  passages: Record<string, DialoguePassage>;
}

export interface DialogueProblem {
  severity: "error" | "warning";
  passage?: string;
  message: string;
}

/** `:: Name [tag1 tag2] {"position":...}`: the part after `::`. Escapes `\[ \] \{ \}` in the name. */
export function parseHeader(rest: string): { name: string; tags: string[] } {
  let name = "";
  let tagText = "";
  let i = 0;
  for (; i < rest.length; i++) {
    const c = rest[i];
    if (c === "\\" && i + 1 < rest.length) { name += rest[i + 1]; i++; continue; }
    if (c === "[" || c === "{") break;
    name += c;
  }
  if (rest[i] === "[") {
    for (i++; i < rest.length && rest[i] !== "]"; i++) tagText += rest[i];
  }
  return { name: name.trim(), tags: tagText.split(/\s+/).filter(Boolean) };
}

export function parseLink(inner: string): { label: string; to: string } {
  const right = inner.lastIndexOf("->");
  if (right >= 0) return { label: inner.slice(0, right).trim(), to: inner.slice(right + 2).trim() };
  const left = inner.indexOf("<-");
  if (left >= 0) return { label: inner.slice(left + 2).trim(), to: inner.slice(0, left).trim() };
  const bar = inner.indexOf("|");
  if (bar >= 0) return { label: inner.slice(0, bar).trim(), to: inner.slice(bar + 1).trim() };
  return { label: inner.trim(), to: inner.trim() };
}

function parseCommand(line: string): DialogueCommand {
  const parts = line.slice(1).trim().split(/\s+/);
  const word = (parts[0] ?? "").toLowerCase();
  if (word === "end" && parts.length === 1) return { kind: "end" };
  if (word === "shop" && parts.length <= 2) return parts[1] ? { kind: "shop", shop: parts[1] } : { kind: "shop" };
  return { kind: "unknown", raw: line };
}

function parseBody(name: string, tags: string[], lines: string[]): DialoguePassage {
  const choices: DialoguePassage["choices"] = [];
  const commands: DialogueCommand[] = [];
  const text: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith("@")) { commands.push(parseCommand(line.trim())); continue; }
    let hadLink = false;
    const rest = line.replace(/\[\[(.+?)\]\]/g, (_, inner: string) => { hadLink = true; choices.push(parseLink(inner)); return ""; });
    if (hadLink && rest.trim() === "") continue;
    text.push(hadLink ? rest.trimEnd() : line);
  }
  return { name, tags, text: text.join("\n").replace(/^\s*\n/, "").trim(), choices, commands };
}

export function parseTwee(source: string, id: string, knownShops?: ReadonlySet<string>): { dialogue: Dialogue; problems: DialogueProblem[] } {
  const lines = source.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const problems: DialogueProblem[] = [];
  const passages: Record<string, DialoguePassage> = {};
  const order: string[] = [];
  let title = "";
  let current: { name: string; tags: string[]; body: string[] } | undefined;

  const finish = () => {
    if (!current) return;
    const { name, tags, body } = current;
    current = undefined;
    if (name === "StoryTitle") { title = body.join(" ").trim(); return; }
    if (name === "StoryData") return;
    if (name in passages) {
      problems.push({ severity: "error", passage: name, message: `Duplicate passage name "${name}"` });
      return;
    }
    passages[name] = parseBody(name, tags, body);
    order.push(name);
  };
  for (const line of lines) {
    if (line.startsWith("::")) {
      finish();
      const header = parseHeader(line.slice(2));
      current = { ...header, body: [] };
    } else current?.body.push(line);
  }
  finish();

  const entries = order.filter(n => passages[n].tags.includes("start") || /^start(\s|$)/i.test(n));
  const dialogue: Dialogue = { id, title: title || id, entries, passages };
  problems.push(...checkDialogue(dialogue, knownShops));
  return { dialogue, problems };
}

/** Everything except the duplicate names (those are only visible while parsing). */
export function checkDialogue(d: Dialogue, knownShops?: ReadonlySet<string>): DialogueProblem[] {
  const problems: DialogueProblem[] = [];
  const list = Object.values(d.passages);
  if (!d.entries.length) problems.push({ severity: "error", message: "No entry passage (name a passage `Start` or `Start <name>`, or tag it `start`)" });
  for (const p of list) {
    for (const c of p.choices) {
      if (!(c.to in d.passages)) problems.push({ severity: "error", passage: p.name, message: `Broken link: "${c.label}" points to the missing passage "${c.to}"` });
    }
    for (const c of p.commands) {
      if (c.kind === "unknown") problems.push({ severity: "warning", passage: p.name, message: `Unknown command ${c.raw}` });
      else if (c.kind === "shop" && c.shop && knownShops && !knownShops.has(c.shop)) {
        problems.push({ severity: "warning", passage: p.name, message: `Unknown shop "${c.shop}"` });
      }
    }
  }
  const seen = new Set<string>();
  const queue = d.entries.filter(n => n in d.passages);
  for (const n of queue) seen.add(n);
  for (let i = 0; i < queue.length; i++) {
    for (const c of d.passages[queue[i]].choices) {
      if (c.to in d.passages && !seen.has(c.to)) { seen.add(c.to); queue.push(c.to); }
    }
  }
  for (const p of list) {
    const empty = !p.text && !p.choices.length;
    if (!seen.has(p.name)) {
      // a fresh Twine passage ("Untitled Passage") is empty on purpose: stay silent
      if (!(empty && !p.commands.length)) problems.push({ severity: "warning", passage: p.name, message: "Unreachable from every entry passage" });
      continue;
    }
    if (d.entries.includes(p.name) && !p.choices.length && !p.commands.some(c => c.kind === "end")) {
      problems.push({ severity: "warning", passage: p.name, message: "Dead end: an entry passage with no choices and no @end" });
    }
    if (empty && !p.commands.length) problems.push({ severity: "warning", passage: p.name, message: "Empty passage: no text and no choices" });
  }
  return problems;
}

export interface DialogueState {
  passage: string;
  /** the commands executed so far, in order: "shop: wizard-shop", "shop", "end", "unknown: @wave" */
  log: string[];
  ended: boolean;
  /** the shop the last opened passage asked for ("" = the NPC's own shop) */
  openedShop?: string;
}

function open(d: Dialogue, passage: string, log: string[]): DialogueState {
  const p = d.passages[passage];
  if (!p) throw new Error(`No passage "${passage}"`);
  const state: DialogueState = { passage, log: [...log], ended: false };
  for (const c of p.commands) {
    if (c.kind === "end") { state.log.push("end"); state.ended = true; break; }
    if (c.kind === "shop") { state.log.push(c.shop ? `shop: ${c.shop}` : "shop"); state.openedShop = c.shop ?? ""; }
    else state.log.push(`unknown: ${c.raw}`);
  }
  return state;
}

export const startDialogue = (d: Dialogue, entry: string): DialogueState => open(d, entry, []);

/** Follow choice `index` of the current passage. Out of range, a broken link or an ended dialogue: the state is unchanged. */
export function choose(d: Dialogue, state: DialogueState, index: number): DialogueState {
  if (state.ended) return state;
  const c = d.passages[state.passage]?.choices[index];
  if (!c || !(c.to in d.passages)) return state;
  return open(d, c.to, state.log);
}
