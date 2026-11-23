// The story's save state and its pure reducers (no DOM, no storage). Everything here is JSON-serialisable.
// Inventory, credits and the party belong to the game; the story only keeps what it owns.
import type { Value, VarRef } from "./expr";

export const STORY_STATE_VERSION = 1;

export type QuestState = "none" | "active" | "ready" | "done" | "failed" | "expired";
export type QuestFate = "expires" | "carry";
export type FileKind = "campaign" | "chapter" | "global";

export interface StoryState {
  v: typeof STORY_STATE_VERSION;
  /** the story is over (a campaign `@next end`) */
  ended: boolean;
  campaign: Record<string, Value>;
  /** the active chapter's file id, null before the start and after the end */
  chapter: string | null;
  chapterVars: Record<string, Value>;
  /** per global file id */
  globals: Record<string, Record<string, Value>>;
  /** every quest that is not "none"; "expired" entries are the tombstones */
  quests: Record<string, Exclude<QuestState, "none">>;
  /** carried quests that outlive their chapter: quest id -> the file that defines it */
  carried: Record<string, string>;
  /** "file/Passage" keys of the passages entered so far (the chapter's are dropped with it) */
  visited: string[];
  /** "file/Passage" keys of the `@once` passages already shown */
  once: string[];
}

export function newState(campaign: Record<string, Value> = {}, globals: Record<string, Record<string, Value>> = {}): StoryState {
  return {
    v: STORY_STATE_VERSION,
    ended: false,
    campaign: { ...campaign },
    chapter: null,
    chapterVars: {},
    globals: Object.fromEntries(Object.entries(globals).map(([k, v]) => [k, { ...v }])),
    quests: {},
    carried: {},
    visited: [],
    once: [],
  };
}

// ---- variables ----

/** Who reads or writes: the file the running passage belongs to. */
export interface VarOwner { fileId: string; kind: FileKind; returns?: readonly string[] }

/** A global file by id; `kovacs` also finds `npc-kovacs` (the README writes `kovacs.met`). */
export function resolveGlobal(state: StoryState, scope: string): string | undefined {
  if (scope in state.globals) return scope;
  return Object.keys(state.globals).find(k => k.replace(/^npc-/, "") === scope);
}

export function readVar(state: StoryState, ref: VarRef, reader: VarOwner): Value | undefined {
  if (ref.scope === undefined) {
    if (reader.kind === "campaign") return state.campaign[ref.name];
    if (reader.kind === "chapter") return state.chapter === reader.fileId ? state.chapterVars[ref.name] : undefined;
    return state.globals[reader.fileId]?.[ref.name];
  }
  if (ref.scope === "campaign") return state.campaign[ref.name];
  const file = resolveGlobal(state, ref.scope);
  return file === undefined ? undefined : state.globals[file][ref.name];
}

export type SetResult = { ok: true; state: StoryState } | { ok: false; error: string };

/** Write with the scope rules: own variables; `campaign.x` only for the campaign file or a chapter that lists x in `@returns`; never another file's. */
export function setVar(state: StoryState, ref: VarRef, value: Value, writer: VarOwner): SetResult {
  if (ref.scope === undefined) {
    if (writer.kind === "campaign") return writeCampaign(state, ref.name, value);
    if (writer.kind === "chapter") {
      if (state.chapter !== writer.fileId) return { ok: false, error: `Chapter "${writer.fileId}" is not active: cannot set "${ref.name}"` };
      if (!(ref.name in state.chapterVars)) return { ok: false, error: `Unknown variable "${ref.name}" in ${writer.fileId}` };
      return { ok: true, state: { ...state, chapterVars: { ...state.chapterVars, [ref.name]: value } } };
    }
    const own = state.globals[writer.fileId];
    if (!own || !(ref.name in own)) return { ok: false, error: `Unknown variable "${ref.name}" in ${writer.fileId}` };
    return { ok: true, state: { ...state, globals: { ...state.globals, [writer.fileId]: { ...own, [ref.name]: value } } } };
  }
  if (ref.scope === "campaign") {
    if (writer.kind === "global") return { ok: false, error: `${writer.fileId} is a global file: it cannot write campaign.${ref.name}` };
    if (writer.kind === "chapter" && !writer.returns?.includes(ref.name)) {
      return { ok: false, error: `campaign.${ref.name} is not in the @returns of ${writer.fileId}` };
    }
    return writeCampaign(state, ref.name, value);
  }
  return { ok: false, error: `Cannot write ${ref.scope}.${ref.name}: another file's variables are read-only` };
}

function writeCampaign(state: StoryState, name: string, value: Value): SetResult {
  if (!(name in state.campaign)) return { ok: false, error: `Unknown campaign variable "${name}"` };
  return { ok: true, state: { ...state, campaign: { ...state.campaign, [name]: value } } };
}

/** The debug panel's write: ignores the scope rules, but only an existing variable. scope: "campaign", "chapter" or a global file id. */
export function setVarDebug(state: StoryState, scope: string, name: string, value: Value): SetResult {
  if (scope === "campaign") return writeCampaign(state, name, value);
  if (scope === "chapter") {
    if (!(name in state.chapterVars)) return { ok: false, error: `Unknown chapter variable "${name}"` };
    return { ok: true, state: { ...state, chapterVars: { ...state.chapterVars, [name]: value } } };
  }
  const file = resolveGlobal(state, scope);
  if (file === undefined || !(name in state.globals[file])) return { ok: false, error: `Unknown variable ${scope}.${name}` };
  return { ok: true, state: { ...state, globals: { ...state.globals, [file]: { ...state.globals[file], [name]: value } } } };
}

// ---- quests ----

export const questState = (state: StoryState, id: string): QuestState => state.quests[id] ?? "none";

export type QuestAction = "start" | "done" | "fail" | "ready" | "unready";

const TRANSITIONS: Record<QuestAction, { from: QuestState[]; to: Exclude<QuestState, "none"> }> = {
  start: { from: ["none"], to: "active" },
  done: { from: ["active", "ready"], to: "done" },
  fail: { from: ["active", "ready"], to: "failed" },
  ready: { from: ["active"], to: "ready" },
  unready: { from: ["ready"], to: "active" },
};

/** The new state, or the very same object when the transition does not apply (starting a started quest, finishing one that is not running...). */
export function transitionQuest(state: StoryState, id: string, action: QuestAction): StoryState {
  const t = TRANSITIONS[action];
  if (!t.from.includes(questState(state, id))) return state;
  return { ...state, quests: { ...state.quests, [id]: t.to } };
}

// ---- chapters ----

/** What closing a chapter needs to know about it (the parser's StoryFile satisfies this). */
export interface ChapterDef { id: string; quests: readonly { id: string; fate?: string }[] }

export function enterChapter(state: StoryState, id: string, vars: Record<string, Value>): StoryState {
  return { ...state, chapter: id, chapterVars: { ...vars } };
}

/**
 * "What happens when a chapter closes": the chapter's variables and its visited/once keys go;
 * carry quests that are running become global (state and definition survive);
 * expiring quests that were running leave a tombstone ("expired"); finished ones keep their done/failed.
 * Inventory and `campaign.*` are untouched.
 */
export function closeChapter(state: StoryState, chapter: ChapterDef): StoryState {
  const quests = { ...state.quests };
  const carried = { ...state.carried };
  for (const q of chapter.quests) {
    const s = questState(state, q.id);
    if (q.fate === "carry") {
      if (s !== "none") carried[q.id] = chapter.id;
    } else if (s === "active" || s === "ready") quests[q.id] = "expired";
  }
  const prefix = `${chapter.id}/`;
  return {
    ...state,
    chapter: null,
    chapterVars: {},
    quests,
    carried,
    visited: state.visited.filter(k => !k.startsWith(prefix)),
    once: state.once.filter(k => !k.startsWith(prefix)),
  };
}

// ---- visited / once ----

export const passageKey = (file: string, passage: string) => `${file}/${passage}`;
export const markVisited = (state: StoryState, key: string): StoryState => (state.visited.includes(key) ? state : { ...state, visited: [...state.visited, key] });
export const markOnce = (state: StoryState, key: string): StoryState => (state.once.includes(key) ? state : { ...state, once: [...state.once, key] });

// ---- saving ----

export interface SaveRuntime { dialogue?: boolean; shop?: boolean; cutscene?: boolean }

/** Saving is refused while a dialogue, a shop or a cutscene is running (an auto-save waits for the end). */
export const canSave = (runtime: SaveRuntime): boolean => !runtime.dialogue && !runtime.shop && !runtime.cutscene;

export const serializeState = (state: StoryState): string => JSON.stringify(state);

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Older versions are migrated here (none exist yet); anything unreadable or newer than this build is null. */
export function migrateState(raw: unknown): StoryState | null {
  if (!isRecord(raw)) return null;
  let cur: Record<string, unknown> = raw;
  // (future: `if (cur.v === 1) cur = { ...cur, v: 2, ... }` one step per version)
  if (cur.v !== STORY_STATE_VERSION) return null;
  const rec = (k: string) => isRecord(cur[k]);
  const arr = (k: string) => Array.isArray(cur[k]) && (cur[k] as unknown[]).every(x => typeof x === "string");
  if (!rec("campaign") || !rec("chapterVars") || !rec("globals") || !rec("quests") || !rec("carried") || !arr("visited") || !arr("once")) return null;
  if (cur.chapter !== null && typeof cur.chapter !== "string") return null;
  cur = { ended: false, ...cur };
  return cur as unknown as StoryState;
}

export function deserializeState(json: string): StoryState | null {
  try {
    return migrateState(JSON.parse(json));
  } catch {
    return null;
  }
}
