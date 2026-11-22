// Run: npx tsx src/game/story/expr.test.ts
import assert from "node:assert/strict";
import { collectRefs, evalExpr, parseExpr, type ExprContext, type Value } from "./expr";

const vars: Record<string, Value> = { "met": false, "heard_rumor": true, "campaign.heroism": 2, "campaign.tyrant_fate": "killed", "npc-kovacs.met": true };
const ctx: ExprContext = {
  getVar: r => vars[r.scope ? `${r.scope}.${r.name}` : r.name],
  has: item => ({ frost_ore: 3, runic_sword: 1 }[item as "frost_ore"] ?? 0),
  quest: id => (id === "sword" ? "ready" : "none"),
  party: id => id === "mira",
  chapter: () => "chapter-1-zsarnok",
  visited: p => p === "Intro",
};
const ev = (src: string): Value => {
  const r = parseExpr(src);
  assert.ok(r.ok, `${src}: ${r.ok ? "" : r.error.message}`);
  return evalExpr(r.expr, ctx);
};
const bad = (src: string, re: RegExp) => {
  const r = parseExpr(src);
  assert.ok(!r.ok && re.test(r.error.message), `${src} should fail with ${re}`);
};

// literals and comparisons
assert.equal(ev("1 == 1"), true);
assert.equal(ev('"a" != "b"'), true);
assert.equal(ev("2 < 3 && 3 <= 3"), true);
assert.equal(ev("2 > 3 || 3 >= 4"), false);
assert.equal(ev("-1 < 0"), true);
assert.equal(ev("1.5 > 1"), true);
assert.equal(ev("true"), true);
assert.equal(ev('"x" < 3'), false); // mixed types never order
assert.equal(ev('"x" == 3'), false);

// logic, precedence, parentheses
assert.equal(ev("true || false && false"), true);
assert.equal(ev("(true || false) && false"), false);
assert.equal(ev("!false && !met"), true);
assert.equal(ev("!(1 == 1)"), false);
assert.equal(ev("!!heard_rumor"), true);

// variables: own, campaign., file.
assert.equal(ev("!met"), true);
assert.equal(ev("heard_rumor"), true);
assert.equal(ev("campaign.heroism >= 2"), true);
assert.equal(ev('campaign.tyrant_fate == "killed"'), true);
assert.equal(ev("npc-kovacs.met"), true);
assert.equal(ev("nothing_here"), false); // a missing variable is false
assert.equal(ev("!nothing_here"), true);

// queries
assert.equal(ev('has("frost_ore") >= 3'), true);
assert.equal(ev("has(frost_ore) == 3"), true); // bare name = the text
assert.equal(ev('has("x")'), 0);
assert.equal(ev('quest("sword") == "ready"'), true);
assert.equal(ev('party("mira") && !party("rook")'), true);
assert.equal(ev('chapter() == "chapter-1-zsarnok"'), true);
assert.equal(ev('visited("Intro")'), true);
assert.equal(ev("visited(Other)"), false);

// errors are typed, never thrown
bad("", /Empty/);
bad("1 +", /Unexpected/);
bad("a = 1", /==/);
bad("a & b", /&&/);
bad('"abc', /Unterminated/);
bad("(1 == 1", /Expected "\)"/);
bad("1 == 1 2", /after the expression/);
bad("foo(1)", /Unknown function/);
bad("has()", /argument/);
bad("chapter(1)", /argument/);
bad("a.b.c", /one `\.`/);
bad("a @ b", /Unexpected character/);
bad("== 1", /Unexpected/);
{
  const r = parseExpr('x == "a" $');
  assert.ok(!r.ok && r.error.pos === 9);
}

// references for the checker
{
  const r = parseExpr('(heard_rumor || campaign.heroism > 1) && has("a") && quest(q) == "done" && chapter() == "x"');
  assert.ok(r.ok);
  const refs = collectRefs(r.expr);
  assert.deepEqual(refs.vars, [{ name: "heard_rumor" }, { scope: "campaign", name: "heroism" }]);
  assert.deepEqual(refs.calls, [{ fn: "has", arg: "a" }, { fn: "quest", arg: "q" }, { fn: "chapter", arg: undefined }]);
}

console.log("expr ok");
