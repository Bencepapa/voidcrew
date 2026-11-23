// The running game's single StoryEngine (module state like meta.ts / inventoryStore.ts).
// The game raises events and talks to NPCs here; the engine's Effect[] are applied to the real
// inventory, credits, shop window and log, in order. Saving is postponed while a dialogue, a shop
// or a cutscene is on (canSave below), and flushed when it is over.
// Vite-only (the story files come from import.meta.glob): the pure parts are storyHost / storyEffects /
// storySaveGate, with tests.
import { useSyncExternalStore } from "react";
import { loadStory } from "../../story/load";
import { crewOf } from "../crew";
import { removeItem } from "../inventory";
import { addToInventory, changeInventory, getInventory } from "../inventoryStore";
import { getMeta, loadStoryState, saveStoryState, setCredits } from "../meta";
import { activeWorld } from "../worlds";
import { applyStoryEffects, touchesInventory, type StoryEffectTarget } from "./storyEffects";
import { createStoryHost } from "./storyHost";
import { createSaveGate, hostCanSave } from "./storySaveGate";
import { StoryEngine, type DialogueView, type Effect } from "./storyEngine";
import type { QuestState, StoryState } from "./state";

export interface StoryUiHandlers {
  /** a story `@shop` (its id, or the NPC's own) - open the shop window */
  openShop?: (shop: string) => void;
  /** a line for the game's log (a story beat, a party remark) */
  log?: (text: string) => void;
}

const LOG_SIZE = 50;

let engine: StoryEngine | null = null;
let initialized = false;
let view: DialogueView | null = null;
let ownShop: string | undefined;
// an old dialogue library (not the engine's) is open: saving waits for it too
let externalDialogue = false;
let effects: Effect[] = [];
let revision = 0;
let ui: StoryUiHandlers = {};

const listeners = new Set<() => void>();
const notify = () => {
  revision++;
  for (const l of listeners) l();
};

export function subscribeStory(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Re-render on any story change (a passage, an effect, a debug edit). */
export const useStoryRevision = (): number => useSyncExternalStore(subscribeStory, () => revision, () => revision);

/** The app's side of the effects (the shop window, the log). Call it from an effect. */
export function configureStoryUi(handlers: StoryUiHandlers) {
  ui = handlers;
}

/** The host's canSave: the engine's own dialogue/shop/cutscene, plus an old dialogue library's window. */
export function canSave(): boolean {
  return !!engine && hostCanSave(engine.canSave(), externalDialogue);
}

const gate = createSaveGate(canSave, () => { if (engine) saveStoryState(engine.snapshot()); });

const speakerName = (id: string) => crewOf(activeWorld()).find((c) => c.id === id)?.name ?? id.toUpperCase();

function effectTarget(): StoryEffectTarget {
  return {
    give: (item, n) => { addToInventory([{ item, count: n }]); },
    take: (item, n) => { changeInventory((inv) => removeItem(inv, item, n).inv); },
    reward: (what, n) => {
      if (what === "credits") setCredits(getMeta().credits + n);
      else console.warn(`[story] @reward ${what} ${n}: only credits are wired`);
    },
    shop: (shop) => {
      const id = shop ?? ownShop;
      if (id) ui.openShop?.(id);
      else console.warn("[story] @shop has no id and the NPC has no shop");
    },
    end: () => { /* the view already carries ended: true; the box shows its close button */ },
    text: (text) => ui.log?.(text),
    banter: (speaker, text, reply) => {
      ui.log?.(speaker ? `${speakerName(speaker)}: ${text}` : text);
      if (reply) setTimeout(() => ui.log?.(`${speakerName(reply.speaker)}: ${reply.text}`), reply.delayMs);
    },
    chapterStarted: () => { /* saved after the batch */ },
    chapterEnded: () => { /* saved after the batch */ },
    storyEnded: () => { /* saved after the batch */ },
    chapterBlocked: () => { /* saved after the batch */ },
    questChanged: () => { /* saved after the batch */ },
    emit: () => { /* the engine queued it itself; nothing for the game to do */ },
    error: (e) => {
      const line = `[story] ${e.file ?? "?"}${e.passage ? `/${e.passage}` : ""}: ${e.message}`;
      if (e.severity === "error") console.error(line); else console.warn(line);
    },
  };
}

function apply(next: Effect[]) {
  effects = [...effects, ...next].slice(-LOG_SIZE);
  if (!engine) return;
  applyStoryEffects(next, effectTarget());
  // (the inventory just changed: a quest's readiness follows it)
  if (touchesInventory(next)) {
    const more = engine.refreshQuests();
    if (more.length) { apply(more); return; }
  }
  gate.request();
  notify();
}

function ensure(): StoryEngine | null {
  if (initialized) return engine;
  initialized = true;
  const loaded = loadStory();
  if (!loaded) return null;
  const host = createStoryHost({
    inventory: getInventory,
    party: () => crewOf(activeWorld()).map((c) => c.id),
  });
  engine = new StoryEngine(loaded.bundle, host);
  const saved = loadStoryState();
  if (saved) engine.load(saved);
  else apply(engine.startCampaign());
  return engine;
}

/** Save now if it is allowed, else wait for the dialogue / shop / cutscene to end. */
export function storySave() {
  if (ensure()) gate.request();
}

// ---- what the game calls ----

export const storyEnabled = (): boolean => ensure() !== null;

/**
 * The NPC id the story knows: the actor type (`ActorSpec.actor`), or the type without its trailing
 * variant number (smith1 -> smith) when only that one has an entry.
 */
export function storyNpcId(actorType: string): string {
  const e = ensure();
  if (!e) return actorType;
  if (e.resolveEntry(actorType)) return actorType;
  const stripped = actorType.replace(/\d+$/, "");
  return stripped !== actorType && e.resolveEntry(stripped) ? stripped : actorType;
}

/** Whether the story has an entry for this NPC right now (its entry resolution). */
export function storyHandles(actorType: string): boolean {
  const e = ensure();
  return !!e && !!e.resolveEntry(storyNpcId(actorType));
}

/** Start the story's talk with an NPC (its own shop id opens a parameter-less @shop). null: no entry, use the old path. */
export function storyTalk(actorType: string, shop?: string): DialogueView | null {
  const e = ensure();
  if (!e || !e.resolveEntry(storyNpcId(actorType))) return null;
  ownShop = shop;
  const r = e.talk(storyNpcId(actorType));
  view = r.view;
  apply(r.effects);
  return view;
}

export function storyChoose(index: number): DialogueView | null {
  const e = ensure();
  if (!e) return null;
  const r = e.choose(index);
  if (r.view) view = r.view;
  apply(r.effects);
  return view;
}

/** The dialogue window closed (Esc, walk away, Close): the engine settles a chapter that waited for it. */
export function storyEndDialogue() {
  const e = ensure();
  if (!e) return;
  view = null;
  ownShop = undefined;
  apply(e.endDialogue());
}

export const storyCurrentView = (): DialogueView | null => (initialized ? view : null);

/** An old (non-story) dialogue library's window opened or closed. */
export function storySetDialogue(on: boolean) {
  if (!initialized) return;
  externalDialogue = on;
  if (!on) gate.flush();
}

export function storySetShopOpen(on: boolean) {
  if (!engine) return;
  engine.setShopOpen(on);
  if (!on) gate.flush();
}

export function storySetCutscene(on: boolean) {
  if (!engine) return;
  engine.setCutscene(on);
  if (!on) gate.flush();
}

/** A game event (`enemy_dead tyrant`, `item_picked lana_ring`, `level_exit deck1`, `map_entered deck1`). */
export function storyEvent(event: string, arg?: string) {
  const e = ensure();
  if (!e || e.state.ended) return;
  apply(e.dispatch(event, arg));
}

// ---- the debug panel ----

export interface StoryDebug {
  status: ReturnType<StoryEngine["status"]>;
  state: StoryState;
  chapters: string[];
  quests: string[];
  log: readonly Effect[];
  canSave: boolean;
}

export function storyDebug(): StoryDebug | null {
  const e = ensure();
  if (!e) return null;
  const files = Object.values(e.bundle.files);
  return {
    status: e.status(),
    state: e.snapshot(),
    chapters: e.bundle.order.filter((id) => e.bundle.files[id].kind === "chapter"),
    quests: files.flatMap((f) => f.quests.map((q) => q.id)),
    log: effects,
    canSave: canSave(),
  };
}

export function storyDebugSetVar(scope: string, name: string, value: number | string | boolean): boolean {
  const e = ensure();
  if (!e) return false;
  const ok = e.debugSetVar(scope, name, value);
  if (ok) gate.request();
  notify();
  return ok;
}

export function storyDebugSetQuest(id: string, state: QuestState): boolean {
  const e = ensure();
  if (!e) return false;
  const ok = e.debugSetQuest(id, state);
  if (ok) gate.request();
  notify();
  return ok;
}

export function storyJumpToChapter(chapter: string) {
  const e = ensure();
  if (e) apply(e.jumpToChapter(chapter));
}
