// The running game's single StoryEngine (module state like meta.ts / inventoryStore.ts).
// The game raises events and talks to NPCs here; the engine's Effect[] are applied to the real
// inventory, credits, shop window and log, in order. Saving is postponed while a dialogue, a shop
// or a cutscene is on (canSave below), and flushed when it is over.
import { useSyncExternalStore } from "react";
import { loadStory } from "../../story/load";
import { crewOf } from "../crew";
import { removeItem } from "../inventory";
import { addToInventory, changeInventory, getInventory } from "../inventoryStore";
import { getMeta, loadStoryState, saveStoryState, setCredits } from "../meta";
import { activeWorld } from "../worlds";
import { applyStoryEffects, type StoryEffectTarget } from "./storyEffects";
import { createStoryHost } from "./storyHost";
import { StoryEngine, type DialogueView, type Effect } from "./storyEngine";
import type { StoryState } from "./state";

export interface StoryUiHandlers {
  /** a story `@shop` (its id, or the NPC's own) - open the shop window */
  openShop?: (shop: string) => void;
}

const LOG_SIZE = 50;

let engine: StoryEngine | null = null;
let initialized = false;
let view: DialogueView | null = null;
let ownShop: string | undefined;
// an old dialogue library (not the engine's) is open: saving waits for it too
let externalDialogue = false;
let pendingSave = false;
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

/** The app's side of the effects (the shop window). Call it once, from an effect. */
export function configureStoryUi(handlers: StoryUiHandlers) {
  ui = handlers;
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
    text: (text, kind, speaker) => {
      // (the debug panel's effect log keeps it; the game log stays the game's)
      void text; void kind; void speaker;
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
  if (engine) applyStoryEffects(next, effectTarget());
  pendingSave = true;
  flushSave();
  notify();
}

/** The host's canSave: the engine's own dialogue/shop/cutscene, plus an old dialogue library's window. */
export function canSave(): boolean {
  return !!engine && !externalDialogue && engine.canSave();
}

function flushSave() {
  if (!pendingSave || !engine || !canSave()) return;
  pendingSave = false;
  saveStoryState(engine.snapshot());
}

/** Save now if it is allowed, else wait for the dialogue / shop / cutscene to end. */
export function storySave() {
  ensure();
  pendingSave = true;
  flushSave();
}

// ---- what the game calls ----

export const storyEnabled = (): boolean => ensure() !== null;

/** The NPC id the story knows: the actor type, or the type without its trailing variant number (smith1 -> smith). */
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

/** Start the story's talk with an NPC (its own shop id opens a parameter-less @shop). null: no entry. */
export function storyTalk(actorType: string, shop?: string): DialogueView | null {
  const e = ensure();
  if (!e) return null;
  ownShop = shop;
  const r = e.talk(storyNpcId(actorType));
  apply(r.effects);
  view = r.view ?? e.currentView();
  notify();
  return view;
}

export function storyChoose(index: number): DialogueView | null {
  const e = ensure();
  if (!e) return null;
  const r = e.choose(index);
  apply(r.effects);
  view = r.view ?? e.currentView();
  notify();
  return view;
}

/** The dialogue window closed (Esc, walk away, Close): the engine settles a chapter that waited for it. */
export function storyEndDialogue() {
  const e = ensure();
  if (!e) return;
  apply(e.endDialogue());
  view = null;
  ownShop = undefined;
  notify();
}

export const storyCurrentView = (): DialogueView | null => (initialized ? view : null);

/** An old (non-story) dialogue library's window opened or closed. */
export function storySetDialogue(on: boolean) {
  if (initialized) {
    externalDialogue = on;
    if (!on) flushSave();
  }
}

export function storySetShopOpen(on: boolean) {
  if (!initialized) return;
  ensure()?.setShopOpen(on);
  if (!on) flushSave();
}

export function storySetCutscene(on: boolean) {
  if (!initialized) return;
  ensure()?.setCutscene(on);
  if (!on) flushSave();
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
  log: readonly Effect[];
}

export function storyDebug(): StoryDebug | null {
  const e = ensure();
  if (!e) return null;
  const chapters = e.bundle.order.filter((id) => e.bundle.files[id].kind === "chapter");
  return { status: e.status(), state: e.snapshot(), chapters, log: effects };
}

export function storyDebugSetVar(scope: string, name: string, value: number | string | boolean): boolean {
  const e = ensure();
  if (!e) return false;
  const ok = e.debugSetVar(scope, name, value);
  notify();
  if (ok) { pendingSave = true; flushSave(); }
  return ok;
}

export function storyDebugSetQuest(id: string, state: import("./state").QuestState): boolean {
  const e = ensure();
  if (!e) return false;
  const ok = e.debugSetQuest(id, state);
  notify();
  if (ok) { pendingSave = true; flushSave(); }
  return ok;
}

export function storyJumpToChapter(chapter: string) {
  const e = ensure();
  if (!e) return;
  apply(e.jumpToChapter(chapter));
}
