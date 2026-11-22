// Parser of the story-engine Twee dialect (concept/story-example/README.md) on top of the dialogue parser's header/link helpers.
// Pure code. Nothing throws: every complaint is a StoryProblem, and a bad expression is kept as an ExprRef with its error.
import { parseHeader, parseLink } from "../dialogue";
import { EMPTY_CONTEXT, evalExpr, parseExpr, type Expr, type ExprError, type Value, type VarRef } from "./expr";
import type { FileKind } from "./state";

export interface StoryProblem { severity: "error" | "warning"; file: string; passage?: string; message: string }

/** An expression as written plus its parse result (src is kept for messages and the debug panel). */
export interface ExprRef { src: string; expr?: Expr; error?: ExprError }

export type StoryCommand =
  | { kind: "end" }
  | { kind: "shop"; shop?: string }
  | { kind: "set"; target: VarRef; op: "=" | "+=" | "-="; value: ExprRef }
  | { kind: "give" | "take"; item: string; n: number }
  | { kind: "reward"; what: string; n: number }
  | { kind: "quest"; action: "start" | "done" | "fail"; id: string }
  | { kind: "emit"; event: string; arg?: string }
  | { kind: "endchapter"; target?: string }
  | { kind: "goto"; target: string }
  | { kind: "unknown"; raw: string };

export type StoryNode =
  | { k: "text"; text: string }
  | { k: "choice"; label: string; to: string; guard?: ExprRef }
  | { k: "cmd"; cmd: StoryCommand }
  | { k: "if"; cond: ExprRef; then: StoryNode[]; else: StoryNode[] };

export interface PassageHeader {
  npc?: string;
  overlay: boolean;
  when?: ExprRef;
  priority: number;
  once: boolean;
  on?: { event: string; arg?: string };
  speaker?: string;
  reply?: { id: string; delayMs: number };
  title?: string;
  goal?: string;
  readyWhen?: ExprRef;
  fate?: string;
  chapter?: string;
  nexts: { target: string; when?: ExprRef }[];
}

export interface StoryPassage { name: string; tags: string[]; header: PassageHeader; nodes: StoryNode[] }

export interface QuestDef { id: string; passage: string; title: string; goal: string; readyWhen?: ExprRef; fate?: string }
export interface ChainRule { chapter: string; passage: string; nexts: { target: string; when?: ExprRef }[] }

export interface StoryFile {
  id: string;
  title: string;
  kind: FileKind;
  vars: Record<string, Value>;
  returns: string[];
  start?: string;
  passages: Record<string, StoryPassage>;
  /** passage names in file order */
  order: string[];
  /** passages with `@npc` (NPC entries) */
  entries: string[];
  /** `[on]` passages */
  handlers: string[];
  /** `[banter]` passages */
  banters: string[];
  quests: QuestDef[];
  chain: ChainRule[];
  problems: StoryProblem[];
}

export interface StoryBundle {
  files: Record<string, StoryFile>;
  /** file ids in the order they were given (the order that breaks ties between entries) */
  order: string[];
  /** the campaign file's id */
  campaign?: string;
}

const HEADER_WORDS = new Set(["npc", "overlay", "when", "priority", "once", "on", "speaker", "reply", "title", "goal", "ready_when", "fate", "chapter", "next"]);

export const exprRef = (src: string): ExprRef => {
  const r = parseExpr(src);
  return r.ok ? { src, expr: r.expr } : { src, error: r.error };
};

const emptyHeader = (): PassageHeader => ({ overlay: false, priority: 0, once: false, nexts: [] });

export const questIdOf = (passageName: string): string => passageName.replace(/^quest\s+/i, "").trim();

function parseDelay(s: string | undefined): number | undefined {
  const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(s ?? "");
  if (!m) return undefined;
  return Math.round(Number(m[1]) * (m[2] === "ms" ? 1 : 1000));
}

class Ctx {
  constructor(private file: string, private passage: string | undefined, private problems: StoryProblem[]) {}
  report(severity: StoryProblem["severity"], message: string) { this.problems.push({ severity, file: this.file, passage: this.passage, message }); }
}

function parseCommand(line: string, c: Ctx): StoryCommand {
  const m = /^@(\S+)\s*(.*)$/.exec(line.trim());
  const word = (m?.[1] ?? "").toLowerCase();
  const rest = (m?.[2] ?? "").trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  const bad = (msg: string): StoryCommand => { c.report("error", `${msg}: ${line.trim()}`); return { kind: "unknown", raw: line.trim() }; };
  const count = (s: string | undefined): number | undefined => (s === undefined ? 1 : /^\d+$/.test(s) ? Number(s) : undefined);
  switch (word) {
    case "end": return parts.length === 0 ? { kind: "end" } : bad("@end takes no arguments");
    case "shop": return parts.length <= 1 ? (parts[0] ? { kind: "shop", shop: parts[0] } : { kind: "shop" }) : bad("@shop takes at most one id");
    case "set": {
      const s = /^([A-Za-z_][\w.-]*)\s*(\+=|-=|=)\s*(.+)$/.exec(rest);
      if (!s) return bad("Malformed @set (want `@set name = expression`)");
      const dot = s[1].indexOf(".");
      const target: VarRef = dot < 0 ? { name: s[1] } : { scope: s[1].slice(0, dot), name: s[1].slice(dot + 1) };
      return { kind: "set", target, op: s[2] as "=" | "+=" | "-=", value: exprRef(s[3]) };
    }
    case "give":
    case "take": {
      const n = count(parts[1]);
      return parts.length >= 1 && parts.length <= 2 && n !== undefined ? { kind: word, item: parts[0], n } : bad(`Malformed @${word} (want \`@${word} item [n]\`)`);
    }
    case "reward": {
      const n = count(parts[1]);
      return parts.length === 2 && n !== undefined ? { kind: "reward", what: parts[0], n } : bad("Malformed @reward (want `@reward credits n`)");
    }
    case "quest":
      return parts.length === 2 && ["start", "done", "fail"].includes(parts[0])
        ? { kind: "quest", action: parts[0] as "start" | "done" | "fail", id: parts[1] }
        : bad("Malformed @quest (want `@quest start|done|fail id`)");
    case "emit": return parts.length >= 1 && parts.length <= 2 ? { kind: "emit", event: parts[0], arg: parts[1] } : bad("Malformed @emit (want `@emit event [arg]`)");
    case "endchapter": return parts.length <= 1 ? { kind: "endchapter", target: parts[0] } : bad("Malformed @endchapter (want `@endchapter [chapter-file]`)");
    case "goto": return rest ? { kind: "goto", target: rest } : bad("Malformed @goto (want `@goto file/Passage`)");
    default: c.report("warning", `Unknown command ${line.trim()}`); return { kind: "unknown", raw: line.trim() };
  }
}

function parseHeaderLine(line: string, h: PassageHeader, c: Ctx) {
  const m = /^@(\S+)\s*(.*)$/.exec(line.trim())!;
  const word = m[1].toLowerCase();
  const rest = m[2].trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  switch (word) {
    case "npc": if (parts.length === 1) h.npc = parts[0]; else c.report("error", `@npc takes one id: ${line.trim()}`); break;
    case "overlay": h.overlay = true; break;
    case "once": h.once = true; break;
    case "when": h.when = exprRef(rest); break;
    case "ready_when": h.readyWhen = exprRef(rest); break;
    case "priority": if (/^-?\d+$/.test(rest)) h.priority = Number(rest); else c.report("error", `@priority wants a whole number: ${line.trim()}`); break;
    case "on": if (parts.length >= 1 && parts.length <= 2) h.on = { event: parts[0], arg: parts[1] }; else c.report("error", `Malformed @on (want \`@on event [arg]\`): ${line.trim()}`); break;
    case "speaker": if (parts.length === 1) h.speaker = parts[0]; else c.report("error", `@speaker takes one id: ${line.trim()}`); break;
    case "reply": {
      const delayMs = parseDelay(parts[1] ?? "0");
      if (parts.length >= 1 && parts.length <= 2 && delayMs !== undefined) h.reply = { id: parts[0], delayMs };
      else c.report("error", `Malformed @reply (want \`@reply id 2s\`): ${line.trim()}`);
      break;
    }
    case "title": h.title = rest; break;
    case "goal": h.goal = rest; break;
    case "fate": h.fate = rest; break;
    case "chapter": h.chapter = rest; break;
    case "next": {
      const n = /^(\S+)(?:\s+@if\s+(.+))?$/.exec(rest);
      if (n) h.nexts.push({ target: n[1], when: n[2] ? exprRef(n[2]) : undefined });
      else c.report("error", `Malformed @next (want \`@next chapter-file [@if expression]\`): ${line.trim()}`);
      break;
    }
  }
}

function parseNodes(lines: string[], header: PassageHeader, c: Ctx): StoryNode[] {
  const root: StoryNode[] = [];
  type Frame = { node: Extract<StoryNode, { k: "if" }>; inElse: boolean };
  const stack: Frame[] = [];
  const target = (): StoryNode[] => {
    const top = stack[stack.length - 1];
    return top ? (top.inElse ? top.node.else : top.node.then) : root;
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("@")) {
      const word = (/^@(\S+)/.exec(t)?.[1] ?? "").toLowerCase();
      if (word === "if") {
        const node: Extract<StoryNode, { k: "if" }> = { k: "if", cond: exprRef(t.slice(3).trim()), then: [], else: [] };
        target().push(node);
        stack.push({ node, inElse: false });
      } else if (word === "else") {
        const top = stack[stack.length - 1];
        if (!top || top.inElse) c.report("error", "@else without a matching @if");
        else top.inElse = true;
      } else if (word === "endif") {
        if (!stack.pop()) c.report("error", "@endif without a matching @if");
      } else if (HEADER_WORDS.has(word)) parseHeaderLine(t, header, c);
      else target().push({ k: "cmd", cmd: parseCommand(t, c) });
      continue;
    }
    let hadLink = false;
    const links: { label: string; to: string }[] = [];
    const rest = raw.replace(/\[\[(.+?)\]\]/g, (_, inner: string) => { hadLink = true; links.push(parseLink(inner)); return ""; });
    if (!hadLink) { target().push({ k: "text", text: raw }); continue; }
    let guard: ExprRef | undefined;
    let leftover = rest;
    const g = /^\s*@if\s+(.+)$/.exec(rest);
    if (g) { guard = exprRef(g[1]); leftover = ""; }
    for (const l of links) target().push({ k: "choice", label: l.label, to: l.to, guard });
    if (leftover.trim()) target().push({ k: "text", text: leftover.trimEnd() });
  }
  if (stack.length) c.report("error", `${stack.length} @if without @endif`);
  return root;
}

/** Plain text of a nodes list is rendered by the engine (conditions!); this is only for tools that want every line. */
export function allNodes(nodes: StoryNode[], out: StoryNode[] = []): StoryNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.k === "if") { allNodes(n.then, out); allNodes(n.else, out); }
  }
  return out;
}

const KINDS: FileKind[] = ["campaign", "chapter", "global"];

export function parseStoryFile(source: string, id: string): StoryFile {
  const lines = source.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const problems: StoryProblem[] = [];
  const raw: { name: string; tags: string[]; body: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith("::")) raw.push({ ...parseHeader(line.slice(2)), body: [] });
    else raw[raw.length - 1]?.body.push(line);
  }

  const file: StoryFile = {
    id, title: id, kind: "global", vars: {}, returns: [], passages: {}, order: [], entries: [], handlers: [], banters: [], quests: [], chain: [], problems,
  };
  let sawFileData = false;
  for (const { name, tags, body } of raw) {
    if (name === "StoryTitle") { file.title = body.join(" ").trim() || id; continue; }
    if (name === "StoryData") continue;
    if (name === "FileData") { sawFileData = true; parseFileData(file, body); continue; }
    const c = new Ctx(id, name, problems);
    if (name in file.passages) { c.report("error", `Duplicate passage name "${name}"`); continue; }
    const header = emptyHeader();
    const nodes = parseNodes(body, header, c);
    file.passages[name] = { name, tags, header, nodes };
    file.order.push(name);
    const special = ["on", "banter", "quest", "chapter"].find(t => tags.includes(t));
    if (!special && (header.npc !== undefined)) file.entries.push(name);
    else if (!special && tags.includes("start")) c.report("warning", "Tagged `start` but has no @npc: no NPC will use it");
    if (tags.includes("on")) {
      file.handlers.push(name);
      if (!header.on) c.report("error", "An [on] passage needs `@on event [arg]`");
    }
    if (tags.includes("banter")) file.banters.push(name);
    if (tags.includes("quest")) {
      file.quests.push({ id: questIdOf(name), passage: name, title: header.title ?? questIdOf(name), goal: header.goal ?? "", readyWhen: header.readyWhen, fate: header.fate });
    }
    if (tags.includes("chapter")) {
      if (!header.chapter) c.report("error", "A [chapter] passage needs `@chapter file`");
      else file.chain.push({ chapter: header.chapter, passage: name, nexts: header.nexts });
    }
  }
  if (!sawFileData) problems.push({ severity: "error", file: id, message: "No FileData passage (needs at least `@kind campaign|chapter|global`)" });
  return file;
}

function parseFileData(file: StoryFile, body: string[]) {
  const c = new Ctx(file.id, "FileData", file.problems);
  let sawKind = false;
  for (const line of body) {
    const t = line.trim();
    if (!t) continue;
    const m = /^@(\S+)\s*(.*)$/.exec(t);
    if (!m) { c.report("warning", `Unexpected text in FileData: ${t}`); continue; }
    const word = m[1].toLowerCase();
    const rest = m[2].trim();
    if (word === "kind") {
      sawKind = true;
      if (KINDS.includes(rest as FileKind)) file.kind = rest as FileKind;
      else c.report("error", `Unknown @kind "${rest}" (campaign, chapter or global)`);
    } else if (word === "var") {
      const v = /^([A-Za-z_][\w-]*)(?:\s*=\s*(.+))?$/.exec(rest);
      if (!v) { c.report("error", `Malformed @var: ${t}`); continue; }
      if (v[1] in file.vars) c.report("error", `Duplicate @var "${v[1]}"`);
      if (v[2] === undefined) { file.vars[v[1]] = false; continue; }
      const r = parseExpr(v[2]);
      if (!r.ok) { c.report("error", `Malformed @var value: ${r.error.message}`); file.vars[v[1]] = false; continue; }
      file.vars[v[1]] = evalExpr(r.expr, EMPTY_CONTEXT);
    } else if (word === "returns") {
      file.returns.push(...rest.split(/[\s,]+/).filter(Boolean));
    } else if (word === "start") file.start = rest;
    else c.report("warning", `Unknown FileData command ${t}`);
  }
  if (!sawKind) c.report("error", "FileData has no @kind");
}

export function buildBundle(sources: readonly { id: string; twee: string }[]): { bundle: StoryBundle; problems: StoryProblem[] } {
  const bundle: StoryBundle = { files: {}, order: [] };
  const problems: StoryProblem[] = [];
  for (const s of sources) {
    if (s.id in bundle.files) { problems.push({ severity: "error", file: s.id, message: `Duplicate file id "${s.id}"` }); continue; }
    const f = parseStoryFile(s.twee, s.id);
    bundle.files[s.id] = f;
    bundle.order.push(s.id);
    problems.push(...f.problems);
  }
  const campaigns = bundle.order.filter(id => bundle.files[id].kind === "campaign");
  bundle.campaign = campaigns[0];
  if (campaigns.length > 1) problems.push({ severity: "error", file: campaigns[1], message: `More than one campaign file (${campaigns.join(", ")})` });
  return { bundle, problems };
}

/** A link or @goto target: a passage of the same file, or `file/Passage`. */
export function resolveTarget(bundle: StoryBundle, fileId: string, to: string): { file: string; passage: string } | undefined {
  if (bundle.files[fileId] && to in bundle.files[fileId].passages) return { file: fileId, passage: to };
  const slash = to.indexOf("/");
  if (slash > 0) {
    const f = bundle.files[to.slice(0, slash)];
    const p = to.slice(slash + 1).trim();
    if (f && p in f.passages) return { file: f.id, passage: p };
  }
  return undefined;
}
