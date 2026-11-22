// Run: npx tsx src/game/story/storyParse.test.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { allNodes, buildBundle, parseStoryFile, resolveTarget } from "./storyParse";

// FileData + passage headers + commands + nesting + guards, in one small file
{
  const src = [
    ":: StoryTitle", "Demo", "",
    ":: FileData", "@kind chapter", '@var seen = false', "@var n = 3", '@var who = "bob"', "@returns a, b", "@start x", "",
    ":: Entry [start]", "@npc smith", "@overlay", '@when quest("q") == "none"', "@priority 5", "@once",
    "Hello there.", "@if seen", "Seen.", "@if n > 2", "Deep.", "@endif", "@else", "Not seen.", "@endif",
    "[[Go->Other]] @if !seen", "[[Far->file2/Remote]]", "@set seen = true", "@set campaign.a += 2", "@give sword 2", "@take coin", "@reward credits 40",
    "@quest start q", "@emit boom now", "@endchapter next-ch", "@goto file2/Remote", "@shop shop1", "@end", "",
    ":: Other", "text", "", ":: H [on]", "@on enemy_dead tyrant", "@set seen = true", "",
    ":: B [banter]", "@on item_picked ring", "@speaker mira", "@reply rook 2s", '"yo"', "",
    ":: Quest q [quest]", "@title T", "@goal G", '@ready_when has("x") >= 3', "@fate carry", "",
    ":: Chain [chapter]", "@chapter c1", "@next c2 @if campaign.a > 1", "@next end", "",
  ].join("\n");
  const f = parseStoryFile(src, "demo");
  assert.deepEqual(f.problems, []);
  assert.equal(f.title, "Demo");
  assert.equal(f.kind, "chapter");
  assert.deepEqual(f.vars, { seen: false, n: 3, who: "bob" });
  assert.deepEqual(f.returns, ["a", "b"]);
  assert.equal(f.start, "x");
  assert.deepEqual(f.entries, ["Entry"]);
  assert.deepEqual(f.handlers, ["H"]);
  assert.deepEqual(f.banters, ["B"]);
  const h = f.passages.Entry.header;
  assert.equal(h.npc, "smith");
  assert.equal(h.overlay, true);
  assert.equal(h.priority, 5);
  assert.equal(h.once, true);
  assert.ok(h.when?.expr);
  assert.deepEqual(f.passages.H.header.on, { event: "enemy_dead", arg: "tyrant" });
  assert.deepEqual(f.passages.B.header.reply, { id: "rook", delayMs: 2000 });
  assert.equal(f.passages.B.header.speaker, "mira");
  assert.deepEqual(f.quests.map(q => [q.id, q.title, q.goal, q.fate, !!q.readyWhen?.expr]), [["q", "T", "G", "carry", true]]);
  assert.deepEqual(f.chain[0].nexts.map(n => [n.target, !!n.when]), [["c2", true], ["end", false]]);
  assert.equal(f.chain[0].chapter, "c1");

  const nodes = f.passages.Entry.nodes;
  assert.equal(nodes[0].k, "text");
  const iff = nodes[1];
  assert.ok(iff.k === "if");
  assert.deepEqual(iff.then.map(n => n.k), ["text", "if"]);
  assert.deepEqual(iff.else.map(n => n.k), ["text"]);
  const choices = allNodes(nodes).filter(n => n.k === "choice");
  assert.deepEqual(choices.map(c => [c.k === "choice" && c.label, c.k === "choice" && c.to, c.k === "choice" && !!c.guard]), [["Go", "Other", true], ["Far", "file2/Remote", false]]);
  const cmds = nodes.filter(n => n.k === "cmd").map(n => (n.k === "cmd" ? n.cmd : null)!);
  assert.deepEqual(cmds.map(c => c.kind), ["set", "set", "give", "take", "reward", "quest", "emit", "endchapter", "goto", "shop", "end"]);
  assert.deepEqual(cmds[1], { kind: "set", target: { scope: "campaign", name: "a" }, op: "+=", value: cmds[1].kind === "set" ? cmds[1].value : null });
  assert.deepEqual(cmds[2], { kind: "give", item: "sword", n: 2 });
  assert.deepEqual(cmds[3], { kind: "take", item: "coin", n: 1 });
  assert.deepEqual(cmds[4], { kind: "reward", what: "credits", n: 40 });
  assert.deepEqual(cmds[5], { kind: "quest", action: "start", id: "q" });
  assert.deepEqual(cmds[6], { kind: "emit", event: "boom", arg: "now" });
  assert.deepEqual(cmds[7], { kind: "endchapter", target: "next-ch" });
  assert.deepEqual(cmds[8], { kind: "goto", target: "file2/Remote" });
  assert.deepEqual(cmds[9], { kind: "shop", shop: "shop1" });
}

// problems: malformed things are reported, nothing throws
{
  const src = [
    ":: Start [start]", "@set", "@give", "@quest finish x", "@frobnicate", "@if a ==", "text", "[[x->Y]] @if (", ":: Start", "dup",
  ].join("\n");
  const f = parseStoryFile(src, "bad");
  const msgs = f.problems.map(p => `${p.severity}:${p.message}`);
  assert.ok(msgs.some(m => /No FileData/.test(m)));
  assert.ok(msgs.some(m => /Malformed @set/.test(m)));
  assert.ok(msgs.some(m => /Malformed @give/.test(m)));
  assert.ok(msgs.some(m => /Malformed @quest/.test(m)));
  assert.ok(msgs.some(m => /warning:Unknown command @frobnicate/.test(m)));
  assert.ok(msgs.some(m => /@if without @endif/.test(m)));
  assert.ok(msgs.some(m => /Duplicate passage name "Start"/.test(m)));
  assert.ok(msgs.some(m => /no @npc/.test(m)));
  const iff = f.passages.Start.nodes.find(n => n.k === "if");
  assert.ok(iff && iff.k === "if" && iff.cond.error); // malformed expression kept with its error
  assert.ok(allNodes(f.passages.Start.nodes).some(n => n.k === "choice" && n.guard?.error));

  const e1 = parseStoryFile(":: FileData\n@kind chapter\n:: A\n@else\n@endif\n", "e1").problems.map(p => p.message);
  assert.ok(e1.some(m => /@else without/.test(m)) && e1.some(m => /@endif without/.test(m)));
  const e2 = parseStoryFile(":: FileData\n@kind weird\n@var x = (\n@var y = 1\n@var y = 2\n@frob\n:: [on]\n", "e2").problems.map(p => p.message);
  assert.ok(e2.some(m => /Unknown @kind/.test(m)) && e2.some(m => /Malformed @var value/.test(m)) && e2.some(m => /Duplicate @var/.test(m)) && e2.some(m => /Unknown FileData/.test(m)));
  assert.ok(parseStoryFile(":: FileData\n:: A [on]\nx\n", "e3").problems.some(p => /needs `@on/.test(p.message)));
  assert.ok(parseStoryFile(":: FileData\n@kind campaign\n:: C [chapter]\n@next a\n", "e4").problems.some(p => /needs `@chapter/.test(p.message)));
  assert.ok(parseStoryFile(":: FileData\n@kind campaign\n:: C [chapter]\n@chapter a\n@next\n", "e5").problems.some(p => /Malformed @next/.test(p.message)));
}

// a bundle of the real example files, and target resolution
{
  const dir = "concept/story-example";
  const sources = readdirSync(dir).filter(n => n.endsWith(".twee")).sort().map(n => ({ id: n.replace(/\.twee$/, ""), twee: readFileSync(`${dir}/${n}`, "utf8") }));
  const { bundle, problems } = buildBundle(sources);
  assert.deepEqual(problems, []);
  assert.equal(bundle.campaign, "campaign");
  assert.equal(bundle.order.length, 7);
  assert.deepEqual(Object.keys(bundle.files["chapter-1-zsarnok"].passages).includes("Smith Chapter1"), true);
  assert.deepEqual(bundle.files["chapter-1-zsarnok"].entries, ["Tyrant judgement", "Smith Chapter1", "Lana Chapter1"]);
  assert.deepEqual(bundle.files["npc-kovacs"].entries, ["Start Smith"]);
  assert.deepEqual(bundle.files["chapter-1-zsarnok"].quests.map(q => [q.id, q.fate]), [["sword", "expires"], ["ring", "carry"]]);
  assert.deepEqual(bundle.files["campaign"].chain.map(c => c.chapter), ["chapter-1-zsarnok", "chapter-2-labirintus", "chapter-3-hajo"]);
  assert.deepEqual(bundle.files["campaign"].vars, { tyrant_fate: "none", heroism: 0, labyrinth_route: "none" });
  assert.equal(bundle.files["campaign"].start, "chapter-1-zsarnok");
  assert.deepEqual(bundle.files["party-banter"].banters, ["Banter Tyrant Dead", "Banter Rook Reply", "Banter Ring Found"]);

  assert.deepEqual(resolveTarget(bundle, "chapter-1-zsarnok", "npc-kovacs/Talk"), { file: "npc-kovacs", passage: "Talk" });
  assert.deepEqual(resolveTarget(bundle, "npc-kovacs", "Talk"), { file: "npc-kovacs", passage: "Talk" });
  assert.equal(resolveTarget(bundle, "npc-kovacs", "Nope"), undefined);
  assert.equal(resolveTarget(bundle, "npc-kovacs", "nofile/Talk"), undefined);

  const dup = buildBundle([sources[0], sources[0]]);
  assert.ok(dup.problems.some(p => /Duplicate file id/.test(p.message)));
}

console.log("storyParse ok");
