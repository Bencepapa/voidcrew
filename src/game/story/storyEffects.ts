// Applying the engine's Effect[] to the game, in the order the engine returned them.
// The target is injected (the live one is in storyRuntime.ts) so the order and the routing stay testable.
import type { Effect } from "./storyEngine";
import type { QuestState } from "./state";

export interface StoryEffectTarget {
  give(item: string, n: number): void;
  take(item: string, n: number): void;
  reward(what: string, n: number): void;
  /** `shop` is the id (undefined: the NPC's own, the caller knows it) */
  shop(shop: string | undefined): void;
  /** the running dialogue is over: the host may close its box (the view already says `ended`) */
  end(): void;
  /** a story beat (an `[on]` handler's text) */
  text(text: string): void;
  /** a party remark, with the second voice that answers after `reply.delayMs` */
  banter(speaker: string | undefined, text: string, reply?: { speaker: string; delayMs: number; text: string }): void;
  chapterStarted(chapter: string): void;
  chapterEnded(chapter: string, next: string): void;
  storyEnded(): void;
  chapterBlocked(chapter: string): void;
  questChanged(id: string, state: QuestState): void;
  emit(event: string, arg?: string): void;
  error(effect: Extract<Effect, { kind: "error" }>): void;
}

/** Run the effects top to bottom; every effect is routed exactly once. */
export function applyStoryEffects(effects: readonly Effect[], target: StoryEffectTarget): void {
  for (const e of effects) {
    switch (e.kind) {
      case "give": target.give(e.item, e.n); break;
      case "take": target.take(e.item, e.n); break;
      case "reward": target.reward(e.what, e.n); break;
      case "shop": target.shop(e.shop); break;
      case "end": target.end(); break;
      case "text": target.text(e.text); break;
      case "banter": target.banter(e.speaker, e.text, e.reply); break;
      case "questChanged": target.questChanged(e.id, e.state); break;
      case "chapterStarted": target.chapterStarted(e.chapter); break;
      case "chapterEnded": target.chapterEnded(e.chapter, e.next); break;
      case "storyEnded": target.storyEnded(); break;
      case "chapterBlocked": target.chapterBlocked(e.chapter); break;
      case "emit": target.emit(e.event, e.arg); break;
      case "error": target.error(e); break;
    }
  }
}

/** Whether the effects changed the inventory or credits (quest readiness may follow). */
export const touchesInventory = (effects: readonly Effect[]): boolean =>
  effects.some((e) => e.kind === "give" || e.kind === "take" || e.kind === "reward");
