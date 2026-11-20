// Run: npx tsx src/game/dialogue.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { choose, parseTwee, startDialogue } from "./dialogue";

const sample = (name: string) => readFileSync(`concept/dialogue/samples/${name}`, "utf8");

// the real Twine sample
{
  const { dialogue: d, problems } = parseTwee(sample("void-fantasy.twee"), "void-fantasy");
  assert.equal(d.title, "Void Fantasy");
  assert.deepEqual(d.entries, ["Wizard in town", "Smith in town"]);
  assert.deepEqual(Object.keys(d.passages).sort(), ["Buy/Sell", "Goodbye", "Smith buy", "Smith goodbye", "Smith in town", "Tell me more!", "Untitled Passage", "Wizard in town"]);
  assert.deepEqual(d.passages["Wizard in town"].choices, [
    { label: "Tell me more!", to: "Tell me more!" }, { label: "Buy/Sell", to: "Buy/Sell" }, { label: "Goodbye", to: "Goodbye" },
  ]);
  assert.equal(d.passages["Wizard in town"].text, "Welcome to my humble shop traveller!\nDo not fret, look around and buy anything you wish.");
  assert.deepEqual(d.passages["Buy/Sell"].commands, [{ kind: "shop", shop: "wizard-shop" }]);
  assert.equal(d.passages["Buy/Sell"].text, "Please make your selection traveller!");
  assert.deepEqual(d.passages["Smith buy"].commands, [{ kind: "shop", shop: "smith-shop" }]);
  assert.deepEqual(d.passages["Goodbye"].commands, [{ kind: "end" }]);
  assert.equal(d.passages["Untitled Passage"].text, "");
  assert.deepEqual(problems, []);

  let s = startDialogue(d, "Wizard in town");
  assert.equal(s.ended, false);
  s = choose(d, s, 1);
  assert.equal(s.passage, "Buy/Sell");
  assert.equal(s.openedShop, "wizard-shop");
  assert.deepEqual(s.log, ["shop: wizard-shop"]);
  s = choose(d, s, 1);
  assert.equal(s.passage, "Goodbye");
  assert.equal(s.ended, true);
  assert.deepEqual(s.log, ["shop: wizard-shop", "end"]);
  assert.equal(choose(d, s, 0), s);

  const unknownShop = parseTwee(sample("void-fantasy.twee"), "x", new Set(["wizard-shop"])).problems;
  assert.deepEqual(unknownShop.map(p => [p.severity, p.passage]), [["warning", "Smith buy"]]);
}

// the invalid sample
{
  const { problems } = parseTwee(sample("invalid-duplicate.twee"), "bad");
  const has = (sev: string, re: RegExp) => problems.some(p => p.severity === sev && re.test(p.message));
  assert.ok(has("error", /Duplicate passage name "Goodbye"/));
  assert.ok(has("error", /Broken link.*Missing passage/));
  assert.ok(has("warning", /Unknown command @wave/));
}

// CRLF + BOM, the four link forms, escapes, no entry, dead end, empty passage
{
  const src = "﻿:: StoryTitle\r\nT\r\n\r\n:: Start [start]\r\nHi there\r\n\r\nSecond para\r\n[[a->B]]\r\n[[B<-b]]\r\n[[c|B]]\r\n[[B]]\r\n\r\n:: B\r\nText\r\n  @shop  \r\n@end\r\n\r\n:: Odd \\[name\\] \\{x\\}! [t1 t2] {\"position\":\"1,1\"}\r\nhello\r\n";
  const { dialogue: d, problems } = parseTwee(src, "t");
  assert.equal(d.title, "T");
  assert.deepEqual(d.entries, ["Start"]);
  assert.equal(d.passages.Start.text, "Hi there\n\nSecond para");
  assert.deepEqual(d.passages.Start.choices.map(c => c.label), ["a", "b", "c", "B"]);
  assert.ok(d.passages.Start.choices.every(c => c.to === "B"));
  assert.deepEqual(d.passages.B.commands, [{ kind: "shop" }, { kind: "end" }]);
  assert.equal(startDialogue(d, "B").openedShop, "");
  assert.deepEqual(d.passages["Odd [name] {x}!"].tags, ["t1", "t2"]);
  assert.deepEqual(problems.map(p => p.passage), ["Odd [name] {x}!"]); // unreachable only

  const none = parseTwee(":: A\nhi\n", "n").problems;
  assert.deepEqual(none.map(p => [p.severity, p.passage]), [["error", undefined], ["warning", "A"]]);
  const dead = parseTwee(":: Start\nhi\n\n:: E [start]\n\n", "n").problems.map(p => p.message);
  assert.ok(dead.some(m => /Dead end/.test(m)) && dead.some(m => /Empty passage/.test(m)));
}

console.log("dialogue ok");
