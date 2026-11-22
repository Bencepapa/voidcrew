// Static checks of a story bundle (concept/story-example/scenarios.md, "Checker cases"). Pure code: reads the parsed bundle, reports
// {severity, file, passage?, message}. Parse-level problems (duplicate passages, unbalanced @if, unknown commands) come along.
import { collectRefs, type VarRef } from "./expr";
import {
  buildBundle, resolveTarget, type ExprRef, type StoryBundle, type StoryFile, type StoryNode, type StoryPassage, type StoryProblem,
} from "./storyParse";

export type { StoryProblem } from "./storyParse";

const nodeLists = (nodes: StoryNode[]): StoryNode[][] => {
  const out: StoryNode[][] = [nodes];
  for (const n of nodes) if (n.k === "if") out.push(...nodeLists(n.then), ...nodeLists(n.else));
  return out;
};
/** every node at any depth, with whether it is under an @if */
function walk(nodes: StoryNode[], fn: (n: StoryNode, conditional: boolean) => void, conditional = false) {
  for (const n of nodes) {
    fn(n, conditional);
    if (n.k === "if") { walk(n.then, fn, true); walk(n.else, fn, true); }
  }
}

/** a choice the player always gets: unguarded and not under an @if (or in both branches of one) */
function alwaysChoice(nodes: StoryNode[]): boolean {
  return nodes.some(n => (n.k === "choice" && !n.guard) || (n.k === "if" && n.else.length > 0 && alwaysChoice(n.then) && alwaysChoice(n.else)));
}

export function checkStory(bundle: StoryBundle): StoryProblem[] {
  const out: StoryProblem[] = [];
  const add = (severity: StoryProblem["severity"], file: string, passage: string | undefined, message: string) => out.push({ severity, file, passage, message });
  const files = bundle.order.map(id => bundle.files[id]);
  for (const f of files) out.push(...f.problems);

  const campaign = bundle.campaign ? bundle.files[bundle.campaign] : undefined;
  if (!campaign) add("error", files[0]?.id ?? "", undefined, "No campaign file (a file with `@kind campaign`)");
  const questIds = new Map<string, string>();
  for (const f of files) for (const q of f.quests) {
    if (questIds.has(q.id)) add("error", f.id, q.passage, `Quest "${q.id}" is also defined in ${questIds.get(q.id)}`);
    else questIds.set(q.id, f.id);
  }

  // ---- expressions and variables ----
  const checkVar = (f: StoryFile, p: string | undefined, ref: VarRef, src: string) => {
    if (ref.scope === undefined) {
      if (!(ref.name in f.vars)) add("error", f.id, p, `Unknown variable "${ref.name}" in ${f.id} (${src}): declare it with @var in FileData`);
    } else if (ref.scope === "campaign") {
      if (campaign && !(ref.name in campaign.vars)) add("error", f.id, p, `Unknown variable "campaign.${ref.name}" (${src})`);
    } else {
      const target = files.find(g => g.kind === "global" && (g.id === ref.scope || g.id.replace(/^npc-/, "") === ref.scope));
      if (!target) add("error", f.id, p, `Unknown file "${ref.scope}" in "${ref.scope}.${ref.name}" (${src}): only global files are readable by name`);
      else if (!(ref.name in target.vars)) add("error", f.id, p, `Unknown variable "${ref.name}" in ${target.id} (${src})`);
    }
  };
  const checkExpr = (f: StoryFile, p: string | undefined, ref: ExprRef | undefined) => {
    if (!ref) return;
    if (!ref.expr) { add("error", f.id, p, `Malformed expression "${ref.src}": ${ref.error?.message ?? "?"}`); return; }
    const refs = collectRefs(ref.expr);
    for (const v of refs.vars) checkVar(f, p, v, ref.src);
    for (const c of refs.calls) {
      if (c.fn === "quest" && c.arg !== undefined && !questIds.has(c.arg)) add("error", f.id, p, `Unknown quest "${c.arg}" in ${ref.src}`);
    }
  };
  const checkSet = (f: StoryFile, p: string, ref: VarRef) => {
    if (ref.scope === undefined) {
      if (!(ref.name in f.vars)) add("error", f.id, p, `@set of an unknown variable "${ref.name}" in ${f.id}`);
    } else if (ref.scope === "campaign") {
      if (f.kind === "global") add("error", f.id, p, `A global file cannot write campaign.${ref.name}`);
      else if (f.kind === "chapter" && !f.returns.includes(ref.name)) add("error", f.id, p, `@set campaign.${ref.name}: "${ref.name}" is not in the @returns of ${f.id}`);
      else if (campaign && !(ref.name in campaign.vars)) add("error", f.id, p, `@set of an unknown campaign variable "${ref.name}"`);
    } else add("error", f.id, p, `@set ${ref.scope}.${ref.name}: another file's variables are read-only`);
  };

  const turnIns = new Map<string, Set<string>>(); // quest id -> kinds of the files that `@quest done` it
  const reachable = new Set<string>();
  const key = (file: string, passage: string) => `${file}/${passage}`;

  for (const f of files) {
    for (const name of f.returns) if (campaign && !(name in campaign.vars)) add("error", f.id, undefined, `@returns "${name}" is not a campaign variable`);
    for (const name of f.order) {
      const p = f.passages[name];
      checkExpr(f, name, p.header.when);
      checkExpr(f, name, p.header.readyWhen);
      for (const n of p.header.nexts) checkExpr(f, name, n.when);
      walk(p.nodes, n => {
        if (n.k === "if") checkExpr(f, name, n.cond);
        else if (n.k === "choice") {
          checkExpr(f, name, n.guard);
          checkTarget(f, name, n.to, `link "${n.label}"`);
        } else if (n.k === "cmd") {
          const c = n.cmd;
          if (c.kind === "set") { checkSet(f, name, c.target); checkExpr(f, name, c.value); }
          else if (c.kind === "quest") {
            if (!questIds.has(c.id)) add("error", f.id, name, `Unknown quest "${c.id}" in @quest ${c.action}`);
            if (c.action === "done") turnIns.set(c.id, (turnIns.get(c.id) ?? new Set()).add(f.kind));
          } else if (c.kind === "endchapter" && c.target !== undefined && bundle.files[c.target]?.kind !== "chapter") {
            add("error", f.id, name, `@endchapter target "${c.target}" is not a chapter file`);
          } else if (c.kind === "goto") checkTarget(f, name, c.target, "@goto");
        }
      });
    }
  }
  function checkTarget(f: StoryFile, passage: string, to: string, what: string) {
    if (resolveTarget(bundle, f.id, to)) return;
    const slash = to.indexOf("/");
    const fileId = slash > 0 ? to.slice(0, slash) : undefined;
    if (fileId && !bundle.files[fileId]) add("error", f.id, passage, `Unknown file "${fileId}" in ${what} -> "${to}"`);
    else add("error", f.id, passage, `Broken ${what}: the passage "${to}" does not exist`);
  }

  // ---- quests ----
  for (const f of files) for (const q of f.quests) {
    if (!q.fate) add("error", f.id, q.passage, `Quest "${q.id}" has no @fate (expires or carry)`);
    else if (q.fate !== "expires" && q.fate !== "carry") add("error", f.id, q.passage, `Quest "${q.id}": @fate must be expires or carry, not "${q.fate}"`);
    else if (q.fate === "carry" && f.kind === "chapter" && !turnIns.get(q.id)?.has("global")) {
      add("error", f.id, q.passage, `Carry quest "${q.id}" has no turn-in (\`@quest done ${q.id}\`) in a global file${turnIns.has(q.id) ? ": it exists only in a chapter file, which is gone when the chapter closes" : ""}`);
    }
    if (f.kind === "campaign") add("warning", f.id, q.passage, `Quest "${q.id}" is defined in the campaign file`);
  }

  // ---- chain, chapters ----
  const chapterFiles = files.filter(f => f.kind === "chapter");
  if (campaign) {
    if (!campaign.start) add("error", campaign.id, undefined, "The campaign has no @start chapter");
    else if (bundle.files[campaign.start]?.kind !== "chapter") add("error", campaign.id, undefined, `@start "${campaign.start}" is not a chapter file`);
    for (const rule of campaign.chain) {
      if (bundle.files[rule.chapter]?.kind !== "chapter") add("error", campaign.id, rule.passage, `Unknown chapter "${rule.chapter}" in @chapter`);
      for (const n of rule.nexts) {
        if (n.target !== "end" && bundle.files[n.target]?.kind !== "chapter") add("error", campaign.id, rule.passage, `Unknown @next chapter "${n.target}"`);
      }
      if (!rule.nexts.length) add("warning", campaign.id, rule.passage, `Chapter "${rule.chapter}" has no @next: it can never hand over`);
    }
    for (const c of chapterFiles) {
      if (!campaign.chain.some(r => r.chapter === c.id)) add("warning", c.id, undefined, `Chapter "${c.id}" is not in the campaign's chain (no [chapter] passage names it)`);
    }
  }
  for (const f of files) if (f.kind !== "campaign") for (const r of f.chain) add("warning", f.id, r.passage, "[chapter] passages only count in the campaign file");

  // ---- reachability, endchapter ----
  const queue: [string, string][] = [];
  const reach = (file: string, passage: string) => {
    if (reachable.has(key(file, passage))) return;
    reachable.add(key(file, passage));
    queue.push([file, passage]);
  };
  for (const f of files) for (const name of f.order) {
    const p = f.passages[name];
    if (f.entries.includes(name) || p.tags.some(t => ["on", "banter", "quest", "chapter"].includes(t))) reach(f.id, name);
  }
  for (let i = 0; i < queue.length; i++) {
    const [fid, name] = queue[i];
    walk(bundle.files[fid].passages[name].nodes, n => {
      const to = n.k === "choice" ? n.to : n.k === "cmd" && n.cmd.kind === "goto" ? n.cmd.target : undefined;
      const t = to === undefined ? undefined : resolveTarget(bundle, fid, to);
      if (t) reach(t.file, t.passage);
    });
  }
  const hasEndChapter = (p: StoryPassage) => { let found = false; walk(p.nodes, n => { if (n.k === "cmd" && n.cmd.kind === "endchapter") found = true; }); return found; };
  for (const f of files) {
    for (const name of f.order) {
      if (!reachable.has(key(f.id, name))) {
        const p = f.passages[name];
        if (p.nodes.some(n => n.k !== "text" || n.text.trim())) add("warning", f.id, name, "Unreachable from every entry, handler and link");
      }
    }
    if (f.kind === "chapter" && !f.order.some(n => reachable.has(key(f.id, n)) && hasEndChapter(f.passages[n]))) {
      add("warning", f.id, undefined, "No reachable @endchapter: this chapter can never end");
    }
  }

  // ---- fallbacks ----
  for (const f of files) for (const name of f.order) {
    const p = f.passages[name];
    const hasChoice = nodeLists(p.nodes).some(l => l.some(n => n.k === "choice"));
    const terminal = p.nodes.some(n => n.k === "cmd" && (n.cmd.kind === "end" || n.cmd.kind === "goto"));
    if (hasChoice && !terminal && !alwaysChoice(p.nodes)) add("warning", f.id, name, "No fallback: every choice is guarded, so the player can get stuck with none");
  }
  const byNpc = new Map<string, { file: StoryFile; name: string }[]>();
  for (const f of files) for (const name of f.entries) {
    const npc = f.passages[name].header.npc!;
    byNpc.set(npc, [...(byNpc.get(npc) ?? []), { file: f, name }]);
  }
  for (const [npc, entries] of byNpc) {
    const unguarded = entries.some(e => { const h = e.file.passages[e.name].header; return !h.when && !h.once; });
    if (!unguarded) add("warning", entries[0].file.id, entries[0].name, `No fallback entry for NPC "${npc}": every entry has @when or @once, so the NPC can fall silent`);
    if (entries.some(e => e.file.kind === "global")) {
      for (const e of entries) {
        if (e.file.kind === "chapter" && !e.file.passages[e.name].header.overlay) add("warning", e.file.id, e.name, `NPC "${npc}" also has global entries: mark this chapter entry @overlay so it wins while the chapter is active`);
      }
    }
  }
  return out;
}

/** Parse the sources and check them: parse problems, bundle-level problems and the static checks. */
export function checkSources(sources: readonly { id: string; twee: string }[]): { bundle: StoryBundle; problems: StoryProblem[] } {
  const { bundle, problems: built } = buildBundle(sources);
  const own = new Set(bundle.order.flatMap(id => bundle.files[id].problems));
  const extra = built.filter(p => !own.has(p));
  return { bundle, problems: [...extra, ...checkStory(bundle)] };
}
