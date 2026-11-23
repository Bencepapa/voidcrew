// The story runtime (no DOM, no storage): campaign start, passages, NPC entry resolution, events, chapters, quests.
// The host passes queries (inventory, party) and applies the returned effects; the engine never touches the game itself.
import { evalBool, evalExpr, type ExprContext, type Value } from "./expr";
import {
  closeChapter, canSave, enterChapter, markOnce, markVisited, newState, passageKey, questState, readVar, setVar, setVarDebug, transitionQuest,
  type QuestAction, type QuestState, type StoryState, type VarOwner,
} from "./state";
import { resolveTarget, type ExprRef, type QuestDef, type StoryBundle, type StoryCommand, type StoryFile, type StoryNode } from "./storyParse";

/** What the story needs to ask the game. */
export interface StoryHost {
  has(item: string): number;
  party(id: string): boolean;
}

export type Effect =
  | { kind: "give" | "take"; item: string; n: number }
  | { kind: "reward"; what: string; n: number }
  | { kind: "emit"; event: string; arg?: string }
  | { kind: "shop"; shop?: string }
  /** the running dialogue was ended by `@end` */
  | { kind: "end" }
  /** text of an `[on]` handler (a chapter intro, a story beat) */
  | { kind: "text"; file: string; passage: string; text: string }
  /** a party remark; `reply` is a second voice that answers after `delayMs` (already guard-checked) */
  | { kind: "banter"; file: string; passage: string; speaker?: string; text: string; reply?: { speaker: string; delayMs: number; text: string } }
  | { kind: "questChanged"; id: string; state: QuestState }
  | { kind: "chapterStarted"; chapter: string }
  /** `next` is the next chapter's id, or "end" when the story ends */
  | { kind: "chapterEnded"; chapter: string; next: string }
  /** a chapter was asked to end but no `@next` rule is true (or the target is unknown): it stays open */
  | { kind: "chapterBlocked"; chapter: string }
  | { kind: "storyEnded" }
  | { kind: "error"; severity: "error" | "warning"; file?: string; passage?: string; message: string };

export interface DialogueView {
  npc: string;
  file: string;
  passage: string;
  text: string;
  choices: { label: string }[];
  /** no more choices to make (the host closes the dialogue box; a shop effect may still be open) */
  ended: boolean;
}

export interface StepResult { view: DialogueView | null; effects: Effect[] }

interface Choice { label: string; file: string; passage: string }
interface Dialogue { npc: string; choices: Choice[]; view: DialogueView }
interface Run { effects: Effect[]; text: string[]; choices: Choice[]; ended: boolean; cur: { file: string; passage: string }; depth: number }

const MAX_GOTO_DEPTH = 20;
const MAX_SETTLE_STEPS = 200;

const SAFE_DEFAULT: StoryState = newState();

export class StoryEngine {
  state: StoryState = SAFE_DEFAULT;
  private dlg: Dialogue | null = null;
  private pending: { target?: string } | null = null;
  private queue: { event: string; arg?: string }[] = [];
  private shopOpen = false;
  private cutsceneOn = false;

  constructor(readonly bundle: StoryBundle, readonly host: StoryHost, state?: StoryState) {
    if (state) this.state = state;
  }

  // ---- lifecycle ----

  /** A new game: campaign and global variables at their defaults, the campaign's `@start` chapter begun. */
  startCampaign(): Effect[] {
    const effects: Effect[] = [];
    const camp = this.bundle.campaign ? this.bundle.files[this.bundle.campaign] : undefined;
    const globals: Record<string, Record<string, Value>> = {};
    for (const id of this.bundle.order) if (this.bundle.files[id].kind === "global") globals[id] = this.bundle.files[id].vars;
    this.state = newState(camp?.vars ?? {}, globals);
    this.dlg = null;
    this.pending = null;
    this.queue = [];
    const first = camp?.start;
    if (!camp || !first) effects.push(this.err("The campaign has no @start chapter"));
    else if (this.bundle.files[first]?.kind !== "chapter") effects.push(this.err(`@start "${first}" is not a chapter file`));
    else this.startChapter(first, effects);
    this.settle(effects);
    return effects;
  }

  /** Continue from a saved state (a running dialogue or pending close is not part of a save). */
  load(state: StoryState) {
    this.state = state;
    this.dlg = null;
    this.pending = null;
    this.queue = [];
  }

  snapshot(): StoryState { return JSON.parse(JSON.stringify(this.state)) as StoryState; }

  status() {
    return { chapter: this.state.chapter, ended: this.state.ended, dialogue: this.dlg ? { npc: this.dlg.npc, file: this.dlg.view.file, passage: this.dlg.view.passage } : null, closePending: this.pending !== null };
  }

  // ---- saving ----

  setShopOpen(on: boolean) { this.shopOpen = on; }
  setCutscene(on: boolean) { this.cutsceneOn = on; }
  canSave(): boolean { return canSave({ dialogue: this.dlg !== null, shop: this.shopOpen, cutscene: this.cutsceneOn }); }

  // ---- dialogue ----

  /** The passage an NPC starts from now, or undefined (silent). Pure: does not mark anything. */
  resolveEntry(npc: string): { file: string; passage: string } | undefined {
    type Cand = { file: string; passage: string; tier: number; priority: number; idx: number };
    const cands: Cand[] = [];
    const collect = (f: StoryFile, tierOf: (overlay: boolean) => number) => {
      for (const name of f.entries) {
        const h = f.passages[name].header;
        if (h.npc === npc) cands.push({ file: f.id, passage: name, tier: tierOf(h.overlay), priority: h.priority, idx: cands.length });
      }
    };
    const chapter = this.state.chapter ? this.bundle.files[this.state.chapter] : undefined;
    if (chapter) collect(chapter, overlay => (overlay ? 0 : 2));
    for (const id of this.bundle.order) if (this.bundle.files[id].kind === "global") collect(this.bundle.files[id], () => 1);
    cands.sort((a, b) => a.tier - b.tier || b.priority - a.priority || a.idx - b.idx);
    for (const c of cands) {
      const h = this.bundle.files[c.file].passages[c.passage].header;
      if (h.once && this.state.once.includes(passageKey(c.file, c.passage))) continue;
      if (!this.guard(h.when, c.file)) continue;
      return { file: c.file, passage: c.passage };
    }
    return undefined;
  }

  /** Start talking to an NPC. view is null when the NPC has no entry (silent). */
  talk(npc: string): StepResult {
    const effects: Effect[] = [];
    if (this.dlg) this.dlg = null;
    this.refreshQuests(effects);
    const entry = this.resolveEntry(npc);
    if (!entry) { this.settle(effects); return { view: null, effects }; }
    if (this.bundle.files[entry.file].passages[entry.passage].header.once) this.state = markOnce(this.state, passageKey(entry.file, entry.passage));
    return this.step(npc, entry.file, entry.passage, effects);
  }

  /** Follow choice `index` of the running dialogue (no dialogue or a bad index: nothing happens). */
  choose(index: number): StepResult {
    if (!this.dlg) return { view: null, effects: [] };
    const c = this.dlg.choices[index];
    if (!c) return { view: this.dlg.view, effects: [] };
    const effects: Effect[] = [];
    this.refreshQuests(effects);
    return this.step(this.dlg.npc, c.file, c.passage, effects);
  }

  currentView(): DialogueView | null { return this.dlg?.view ?? null; }

  /** The host closed the dialogue (Esc, walking away): a chapter close that waited for it happens now. */
  endDialogue(): Effect[] {
    const effects: Effect[] = [];
    this.dlg = null;
    this.settle(effects);
    return effects;
  }

  private step(npc: string, file: string, passage: string, effects: Effect[]): StepResult {
    const run = this.newRun(effects, file, passage);
    this.runPassage(file, passage, run);
    const view: DialogueView = {
      npc,
      file: run.cur.file,
      passage: run.cur.passage,
      text: run.text.join("\n").replace(/^\s*\n/, "").trim(),
      choices: run.choices.map(c => ({ label: c.label })),
      ended: run.ended || run.choices.length === 0,
    };
    this.dlg = view.ended ? null : { npc, choices: run.choices, view };
    this.settle(effects);
    return { view, effects };
  }

  // ---- events ----

  /** The game raises an event (`enemy_dead tyrant`, `level_exit labirintus`, `item_picked lana_ring`...). */
  dispatch(event: string, arg?: string): Effect[] {
    const effects: Effect[] = [];
    this.queue.push({ event, arg });
    this.settle(effects);
    return effects;
  }

  /** Quest readiness follows the inventory: call after it changed (the engine also does it before every dialogue step). */
  refreshQuests(effects: Effect[] = []): Effect[] {
    for (const [id, st] of Object.entries(this.state.quests)) {
      if (st !== "active" && st !== "ready") continue;
      const found = this.questDef(id);
      const cond = found?.def.readyWhen;
      if (!found || !cond?.expr) continue;
      const next = transitionQuest(this.state, id, evalBool(cond.expr, this.ctx(found.file)) ? "ready" : "unready");
      if (next !== this.state) {
        this.state = next;
        effects.push({ kind: "questChanged", id, state: questState(next, id) });
      }
    }
    return effects;
  }

  /** Debug panel: end the active chapter (quest fates apply) and start `chapter`, skipping every `@next` rule. */
  jumpToChapter(chapter: string): Effect[] {
    const effects: Effect[] = [];
    if (this.bundle.files[chapter]?.kind !== "chapter") return [this.err(`"${chapter}" is not a chapter file`)];
    this.dlg = null;
    this.pending = null;
    if (this.state.chapter) {
      const cur = this.bundle.files[this.state.chapter];
      effects.push({ kind: "chapterEnded", chapter: cur.id, next: chapter });
      this.state = closeChapter(this.state, cur);
    }
    this.state = { ...this.state, ended: false };
    this.startChapter(chapter, effects);
    this.settle(effects);
    return effects;
  }

  /** Debug panel: write any existing variable. scope: "campaign", "chapter" or a global file id. */
  debugSetVar(scope: string, name: string, value: Value): boolean {
    const r = setVarDebug(this.state, scope, name, value);
    if (r.ok) this.state = r.state;
    return r.ok;
  }

  // ---- the loop that settles queued events and a pending chapter close ----

  private settle(effects: Effect[]) {
    for (let guard = 0; guard < MAX_SETTLE_STEPS; guard++) {
      this.refreshQuests(effects);
      const ev = this.queue.shift();
      if (ev) { this.processEvent(ev.event, ev.arg, effects); continue; }
      if (this.pending && !this.dlg) {
        const p = this.pending;
        this.pending = null;
        this.performClose(p.target, effects);
        continue;
      }
      return;
    }
    effects.push(this.err("Story loop did not settle (events or chapters keep triggering each other)"));
    this.queue = [];
    this.pending = null;
  }

  private processEvent(event: string, arg: string | undefined, effects: Effect[]) {
    const groups: StoryFile[] = [];
    const chapter = this.state.chapter ? this.bundle.files[this.state.chapter] : undefined;
    if (chapter) groups.push(chapter);
    for (const id of this.bundle.order) if (this.bundle.files[id].kind === "global") groups.push(this.bundle.files[id]);
    type Cand = { file: StoryFile; name: string; group: number; priority: number; idx: number };
    const cands: Cand[] = [];
    groups.forEach((f, group) => {
      f.order.forEach((name, idx) => {
        const p = f.passages[name];
        const on = p.header.on;
        if (!on || on.event !== event || !(p.tags.includes("on") || p.tags.includes("banter"))) return;
        if (on.arg !== undefined && on.arg !== arg) return;
        cands.push({ file: f, name, group, priority: p.header.priority, idx });
      });
    });
    cands.sort((a, b) => a.group - b.group || b.priority - a.priority || a.idx - b.idx);
    for (const c of cands) {
      const p = c.file.passages[c.name];
      const key = passageKey(c.file.id, c.name);
      if (p.header.once && this.state.once.includes(key)) continue;
      if (!this.guard(p.header.when, c.file.id)) continue;
      if (p.header.once) this.state = markOnce(this.state, key);
      const text = this.runText(c.file.id, c.name, effects);
      if (p.tags.includes("banter")) {
        if (!text) continue;
        effects.push({ kind: "banter", file: c.file.id, passage: c.name, speaker: p.header.speaker, text, reply: this.findReply(c.file, p.header.reply, effects) });
      } else if (text) effects.push({ kind: "text", file: c.file.id, passage: c.name, text });
    }
  }

  private findReply(f: StoryFile, reply: { id: string; delayMs: number } | undefined, effects: Effect[]) {
    if (!reply) return undefined;
    for (const name of f.banters) {
      const p = f.passages[name];
      if (p.header.speaker !== reply.id || p.header.on) continue;
      if (!this.guard(p.header.when, f.id)) continue;
      const text = this.runText(f.id, name, effects);
      if (text) return { speaker: reply.id, delayMs: reply.delayMs, text };
    }
    return undefined;
  }

  // ---- chapters ----

  private startChapter(id: string, effects: Effect[]) {
    this.state = enterChapter(this.state, id, this.bundle.files[id].vars);
    effects.push({ kind: "chapterStarted", chapter: id });
    this.queue.push({ event: "chapter_start" });
  }

  private performClose(target: string | undefined, effects: Effect[]) {
    const cur = this.state.chapter ? this.bundle.files[this.state.chapter] : undefined;
    if (!cur) return;
    let next: string | undefined;
    if (target !== undefined) {
      if (this.bundle.files[target]?.kind === "chapter") next = target;
      else effects.push(this.err(`@endchapter target "${target}" is not a chapter file`, cur.id));
    } else next = this.pickNext(cur.id);
    if (next === undefined) {
      effects.push({ kind: "chapterBlocked", chapter: cur.id });
      return;
    }
    effects.push({ kind: "chapterEnded", chapter: cur.id, next });
    this.state = closeChapter(this.state, cur);
    if (next === "end") {
      this.state = { ...this.state, ended: true };
      effects.push({ kind: "storyEnded" });
    } else this.startChapter(next, effects);
  }

  /** The campaign's `@next` rules for this chapter, first true wins; "end" or a chapter id, undefined if none matches. */
  private pickNext(chapter: string): string | undefined {
    const camp = this.bundle.campaign ? this.bundle.files[this.bundle.campaign] : undefined;
    if (!camp) return undefined;
    for (const rule of camp.chain) {
      if (rule.chapter !== chapter) continue;
      for (const n of rule.nexts) {
        if (!this.guard(n.when, camp.id)) continue;
        if (n.target === "end" || this.bundle.files[n.target]?.kind === "chapter") return n.target;
      }
    }
    return undefined;
  }

  // ---- running passages ----

  private newRun(effects: Effect[], file: string, passage: string): Run {
    return { effects, text: [], choices: [], ended: false, cur: { file, passage }, depth: 0 };
  }

  private runText(file: string, passage: string, effects: Effect[]): string {
    const run = this.newRun(effects, file, passage);
    this.runPassage(file, passage, run);
    return run.text.join("\n").replace(/^\s*\n/, "").trim();
  }

  private runPassage(fileId: string, name: string, run: Run) {
    const p = this.bundle.files[fileId]?.passages[name];
    if (!p) { run.effects.push(this.err(`No passage "${name}"`, fileId)); return; }
    run.cur = { file: fileId, passage: name };
    this.state = markVisited(this.state, passageKey(fileId, name));
    this.execNodes(p.nodes, fileId, name, run);
  }

  /** true = stop the passage (`@end` or a `@goto` ran) */
  private execNodes(nodes: StoryNode[], fileId: string, passage: string, run: Run): boolean {
    for (const n of nodes) {
      switch (n.k) {
        case "text": run.text.push(n.text); break;
        case "choice": {
          if (n.guard && !this.guard(n.guard, fileId)) break;
          const t = resolveTarget(this.bundle, fileId, n.to);
          if (!t) run.effects.push(this.err(`Broken link "${n.label}" -> "${n.to}"`, fileId, passage));
          else run.choices.push({ label: n.label, file: t.file, passage: t.passage });
          break;
        }
        case "if":
          if (this.execNodes(this.guard(n.cond, fileId) ? n.then : n.else, fileId, passage, run)) return true;
          break;
        case "cmd":
          if (this.exec(n.cmd, fileId, passage, run)) return true;
          break;
      }
    }
    return false;
  }

  private exec(cmd: StoryCommand, fileId: string, passage: string, run: Run): boolean {
    const eff = run.effects;
    switch (cmd.kind) {
      case "end": run.ended = true; eff.push({ kind: "end" }); return true;
      case "shop": eff.push({ kind: "shop", shop: cmd.shop }); break;
      case "give": case "take": eff.push({ kind: cmd.kind, item: cmd.item, n: cmd.n }); break;
      case "reward": eff.push({ kind: "reward", what: cmd.what, n: cmd.n }); break;
      case "emit":
        eff.push({ kind: "emit", event: cmd.event, arg: cmd.arg });
        this.queue.push({ event: cmd.event, arg: cmd.arg });
        break;
      case "quest": {
        const next = transitionQuest(this.state, cmd.id, cmd.action as QuestAction);
        if (next === this.state) eff.push(this.err(`@quest ${cmd.action} ${cmd.id}: the quest is "${questState(this.state, cmd.id)}", nothing changed`, fileId, passage, "warning"));
        else {
          this.state = next;
          eff.push({ kind: "questChanged", id: cmd.id, state: questState(next, cmd.id) });
        }
        break;
      }
      case "endchapter":
        if (!this.pending) this.pending = { target: cmd.target };
        else if (cmd.target !== undefined && this.pending.target === undefined) this.pending = { target: cmd.target };
        break;
      case "goto": {
        const t = resolveTarget(this.bundle, fileId, cmd.target);
        if (!t) { eff.push(this.err(`@goto target "${cmd.target}" does not exist`, fileId, passage)); break; }
        if (run.depth >= MAX_GOTO_DEPTH) { eff.push(this.err("@goto chain too deep", fileId, passage)); break; }
        run.choices = [];
        run.depth++;
        this.runPassage(t.file, t.passage, run);
        run.depth--;
        return true;
      }
      case "set": this.execSet(cmd, fileId, passage, eff); break;
      case "unknown": eff.push(this.err(`Unknown command ${cmd.raw}`, fileId, passage, "warning")); break;
    }
    return false;
  }

  private execSet(cmd: Extract<StoryCommand, { kind: "set" }>, fileId: string, passage: string, eff: Effect[]) {
    const ctx = this.ctx(fileId);
    if (!cmd.value.expr) { eff.push(this.err(`@set with a malformed expression: ${cmd.value.src}`, fileId, passage)); return; }
    let v = evalExpr(cmd.value.expr, ctx);
    if (cmd.op !== "=") {
      const cur = ctx.getVar(cmd.target);
      if (typeof cur !== "number" || typeof v !== "number") { eff.push(this.err(`@set ${cmd.op} needs numbers`, fileId, passage)); return; }
      v = cmd.op === "+=" ? cur + v : cur - v;
    }
    const r = setVar(this.state, cmd.target, v, this.owner(this.bundle.files[fileId]));
    if (r.ok) this.state = r.state;
    else eff.push(this.err(r.error, fileId, passage));
  }

  // ---- helpers ----

  private owner(f: StoryFile): VarOwner { return { fileId: f.id, kind: f.kind, returns: f.returns }; }

  private ctx(fileId: string): ExprContext {
    const owner = this.owner(this.bundle.files[fileId]);
    return {
      getVar: ref => readVar(this.state, ref, owner),
      has: item => this.host.has(item),
      quest: id => questState(this.state, id),
      party: id => this.host.party(id),
      chapter: () => this.state.chapter ?? "",
      visited: p => {
        const t = resolveTarget(this.bundle, fileId, p);
        return this.state.visited.includes(t ? passageKey(t.file, t.passage) : p);
      },
    };
  }

  /** a missing guard is true; a malformed one is false (the checker reports it) */
  private guard(ref: ExprRef | undefined, fileId: string): boolean {
    if (!ref) return true;
    return ref.expr ? evalBool(ref.expr, this.ctx(fileId)) : false;
  }

  /** the quest's definition: in the active chapter, carried over from a closed one, or in a global file */
  private questDef(id: string): { def: QuestDef; file: string } | undefined {
    const find = (fileId: string | undefined) => {
      const f = fileId ? this.bundle.files[fileId] : undefined;
      const def = f?.quests.find(q => q.id === id);
      return def && f ? { def, file: f.id } : undefined;
    };
    return find(this.state.chapter ?? undefined) ?? find(this.state.carried[id]) ?? this.bundle.order.map(find).find(Boolean);
  }

  private err(message: string, file?: string, passage?: string, severity: "error" | "warning" = "error"): Effect {
    return { kind: "error", severity, file, passage, message };
  }
}
