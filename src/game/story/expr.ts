// Expression language of the story engine (see concept/story-example/README.md). Pure code, never throws on bad input:
// parseExpr returns a typed error so the checker can report it.
//   == != < <= > >= && || ! ( )   numbers  "strings"  true/false   variables (x, campaign.x, file.x)
//   queries: has(item) quest(id) party(id) chapter() visited(passage)

export type Value = number | string | boolean;

export interface VarRef { scope?: string; name: string }

export type BinOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";
export const QUERIES = { has: 1, quest: 1, party: 1, chapter: 0, visited: 1 } as const;
export type QueryName = keyof typeof QUERIES;

export type Expr =
  | { t: "lit"; v: Value }
  | { t: "var"; ref: VarRef }
  | { t: "call"; fn: QueryName; args: Expr[] }
  | { t: "not"; e: Expr }
  | { t: "bin"; op: BinOp; l: Expr; r: Expr };

export interface ExprError { message: string; pos: number }
export type ParseResult = { ok: true; expr: Expr } | { ok: false; error: ExprError };

type Tok =
  | { k: "num"; v: number; pos: number }
  | { k: "str"; v: string; pos: number }
  | { k: "id"; v: string; pos: number }
  | { k: "op"; v: string; pos: number }
  | { k: "end"; pos: number };

class ParseFail extends Error {
  constructor(public pos: number, message: string) { super(message); }
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i))!;
      out.push({ k: "num", v: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '"') {
      let s = "";
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j];
      }
      if (j >= src.length) throw new ParseFail(i, "Unterminated string");
      out.push({ k: "str", v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)?/.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0], pos: i });
      i += m[0].length;
      if (src[i] === "." ) throw new ParseFail(i, "Only one `.` is allowed in a name (scope.name)");
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { out.push({ k: "op", v: two, pos: i }); i += 2; continue; }
    if (["<", ">", "!", "(", ")", ","].includes(c)) { out.push({ k: "op", v: c, pos: i }); i++; continue; }
    if (c === "-" && /[0-9]/.test(src[i + 1] ?? "")) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i + 1))!;
      out.push({ k: "num", v: -Number(m[0]), pos: i });
      i += 1 + m[0].length;
      continue;
    }
    if (c === "=") throw new ParseFail(i, "Use `==` to compare");
    if (c === "&" || c === "|") throw new ParseFail(i, `Use \`${c}${c}\``);
    throw new ParseFail(i, `Unexpected character "${c}"`);
  }
  out.push({ k: "end", pos: src.length });
  return out;
}

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}
  private get cur(): Tok { return this.toks[this.i]; }
  private isOp(v: string): boolean { return this.cur.k === "op" && this.cur.v === v; }
  private eat(v: string): void {
    if (!this.isOp(v)) throw new ParseFail(this.cur.pos, `Expected "${v}"`);
    this.i++;
  }
  parseAll(): Expr {
    const e = this.or();
    if (this.cur.k !== "end") throw new ParseFail(this.cur.pos, "Unexpected input after the expression");
    return e;
  }
  private or(): Expr {
    let l = this.and();
    while (this.isOp("||")) { this.i++; l = { t: "bin", op: "||", l, r: this.and() }; }
    return l;
  }
  private and(): Expr {
    let l = this.cmp();
    while (this.isOp("&&")) { this.i++; l = { t: "bin", op: "&&", l, r: this.cmp() }; }
    return l;
  }
  private cmp(): Expr {
    let l = this.unary();
    for (;;) {
      const t = this.cur;
      if (t.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) {
        this.i++;
        l = { t: "bin", op: t.v as BinOp, l, r: this.unary() };
      } else return l;
    }
  }
  private unary(): Expr {
    if (this.isOp("!")) { this.i++; return { t: "not", e: this.unary() }; }
    return this.primary();
  }
  private primary(): Expr {
    const t = this.cur;
    if (t.k === "num" || t.k === "str") { this.i++; return { t: "lit", v: t.v }; }
    if (t.k === "op" && t.v === "(") {
      this.i++;
      const e = this.or();
      this.eat(")");
      return e;
    }
    if (t.k === "id") {
      this.i++;
      if (this.isOp("(")) return this.call(t);
      if (t.v === "true") return { t: "lit", v: true };
      if (t.v === "false") return { t: "lit", v: false };
      const dot = t.v.indexOf(".");
      const ref: VarRef = dot < 0 ? { name: t.v } : { scope: t.v.slice(0, dot), name: t.v.slice(dot + 1) };
      return { t: "var", ref };
    }
    if (t.k === "end") throw new ParseFail(t.pos, "Unexpected end of the expression");
    throw new ParseFail(t.pos, `Unexpected "${t.k === "op" ? t.v : ""}"`);
  }
  private call(name: Tok & { k: "id" }): Expr {
    if (!(name.v in QUERIES)) throw new ParseFail(name.pos, `Unknown function "${name.v}"`);
    const fn = name.v as QueryName;
    this.eat("(");
    const args: Expr[] = [];
    if (!this.isOp(")")) {
      for (;;) {
        args.push(this.arg());
        if (this.isOp(",")) { this.i++; continue; }
        break;
      }
    }
    this.eat(")");
    if (args.length !== QUERIES[fn]) throw new ParseFail(name.pos, `${fn}() takes ${QUERIES[fn]} argument(s)`);
    return { t: "call", fn, args };
  }
  /** a bare name directly in a call (`has(frost_ore)`) is the text itself, not a variable */
  private arg(): Expr {
    const t = this.cur;
    const next = this.toks[this.i + 1];
    if (t.k === "id" && next.k === "op" && (next.v === "," || next.v === ")") && t.v !== "true" && t.v !== "false" && !t.v.includes(".")) {
      this.i++;
      return { t: "lit", v: t.v };
    }
    return this.or();
  }
}

export function parseExpr(src: string): ParseResult {
  try {
    if (!src.trim()) return { ok: false, error: { message: "Empty expression", pos: 0 } };
    return { ok: true, expr: new Parser(tokenize(src)).parseAll() };
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: { message: e.message, pos: e.pos } };
    throw e;
  }
}

/** What an expression may ask the game. `getVar` answers undefined for a variable that does not exist. */
export interface ExprContext {
  getVar(ref: VarRef): Value | undefined;
  has(item: string): number;
  quest(id: string): string;
  party(id: string): boolean;
  chapter(): string;
  visited(passage: string): boolean;
}

export const EMPTY_CONTEXT: ExprContext = {
  getVar: () => undefined,
  has: () => 0,
  quest: () => "none",
  party: () => false,
  chapter: () => "",
  visited: () => false,
};

export const truthy = (v: Value | undefined): boolean => v !== undefined && v !== false && v !== 0 && v !== "";

/** Never throws. A missing variable is `false`; `<` etc. on mixed types is false. */
export function evalExpr(e: Expr, ctx: ExprContext): Value {
  switch (e.t) {
    case "lit": return e.v;
    case "var": return ctx.getVar(e.ref) ?? false;
    case "not": return !truthy(evalExpr(e.e, ctx));
    case "call": {
      const a = e.args.map(x => String(evalExpr(x, ctx)));
      switch (e.fn) {
        case "has": return ctx.has(a[0]);
        case "quest": return ctx.quest(a[0]);
        case "party": return ctx.party(a[0]);
        case "visited": return ctx.visited(a[0]);
        case "chapter": return ctx.chapter();
      }
      return false;
    }
    case "bin": {
      if (e.op === "&&") return truthy(evalExpr(e.l, ctx)) && truthy(evalExpr(e.r, ctx));
      if (e.op === "||") return truthy(evalExpr(e.l, ctx)) || truthy(evalExpr(e.r, ctx));
      const l = evalExpr(e.l, ctx);
      const r = evalExpr(e.r, ctx);
      if (e.op === "==") return l === r;
      if (e.op === "!=") return l !== r;
      const comparable = (typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string");
      if (!comparable) return false;
      switch (e.op) {
        case "<": return l < r;
        case "<=": return l <= r;
        case ">": return l > r;
        default: return l >= r;
      }
    }
  }
}

export const evalBool = (e: Expr, ctx: ExprContext): boolean => truthy(evalExpr(e, ctx));

/** Variables and query calls an expression mentions (for the checker). `arg` is set when the argument is a literal. */
export function collectRefs(e: Expr, out: { vars: VarRef[]; calls: { fn: QueryName; arg?: string }[] } = { vars: [], calls: [] }) {
  switch (e.t) {
    case "var": out.vars.push(e.ref); break;
    case "not": collectRefs(e.e, out); break;
    case "bin": collectRefs(e.l, out); collectRefs(e.r, out); break;
    case "call": {
      const first = e.args[0];
      out.calls.push({ fn: e.fn, arg: first && first.t === "lit" ? String(first.v) : undefined });
      for (const a of e.args) collectRefs(a, out);
      break;
    }
    case "lit": break;
  }
  return out;
}
