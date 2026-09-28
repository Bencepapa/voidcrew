// Writing a map file (src/maps/<id>.json) back after editing, laid out as
// it was, so a diff shows only what changed: each object keeps its key
// order (a JS object would put numeric-looking keys such as legend "1".."4"
// first) and each value stays on one line or opens up as it did. New
// values: on one line if it fits in WIDTH characters; a list of several
// objects opens up, one per line.

const WIDTH = 120;

// how the file had each value, by path ("" for the root, ".layers.floor",
// ".props[2]"): its keys in order (objects), and whether it was opened up
export type JsonLayout = Map<string, { keys?: string[]; open: boolean }>;

// reads the layout out of a file's text (valid JSON)
export function scanLayout(text: string): JsonLayout {
  const layout: JsonLayout = new Map();
  let i = 0;
  const space = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const string = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (path: string) => {
    space();
    const c = text[i];
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      i++;
      const open = /^[ \t]*\r?\n/.test(text.slice(i, i + 40));
      const keys: string[] = [];
      space();
      let index = 0;
      while (text[i] !== close) {
        if (c === "{") {
          const key = string();
          keys.push(key);
          space();
          i++; // the colon
          value(`${path}.${key}`);
        } else {
          value(`${path}[${index++}]`);
        }
        space();
        if (text[i] === ",") i++;
        space();
      }
      i++;
      layout.set(path, c === "{" ? { keys, open } : { open });
      return;
    }
    if (c === '"') string();
    else while (i < text.length && /[^,\]}\s]/.test(text[i])) i++;
  };
  value("");
  return layout;
}

export function formatMapJson(value: unknown, layout: JsonLayout): string {
  return format(value, "", "", 0, layout) + "\n";
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

// an object's keys: in the file's order, then any new ones
function keysOf(record: Record<string, unknown>, path: string, layout: JsonLayout): string[] {
  const order = layout.get(path)?.keys ?? [];
  return [
    ...order.filter((k) => record[k] !== undefined),
    ...Object.keys(record).filter((k) => !order.includes(k) && record[k] !== undefined),
  ];
}

// a value on one line: { "a": 1 }, [1, 2]
function inline(value: unknown, path: string, layout: JsonLayout): string {
  if (Array.isArray(value)) return `[${value.map((v, i) => inline(v, `${path}[${i}]`, layout)).join(", ")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  const keys = keysOf(value, path, layout);
  if (!keys.length) return "{}";
  return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${inline(value[k], `${path}.${k}`, layout)}`).join(", ")} }`;
}

// `indent`: the line's; `lead`: how much comes before the value on it
function format(value: unknown, path: string, indent: string, lead: number, layout: JsonLayout): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const flat = inline(value, path, layout);
  const known = layout.get(path);
  const severalObjects = Array.isArray(value) && value.length > 1 && value.every(isObject);
  const open = known ? known.open : severalObjects || indent.length + lead + flat.length > WIDTH;
  if (!open || flat === "[]" || flat === "{}") return flat;
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    return `[\n${value.map((v, i) => inner + format(v, `${path}[${i}]`, inner, 0, layout)).join(",\n")}\n${indent}]`;
  }
  const record = value as Record<string, unknown>;
  const lines = keysOf(record, path, layout).map((k) => {
    const key = `${JSON.stringify(k)}: `;
    return inner + key + format(record[k], `${path}.${k}`, inner, key.length, layout);
  });
  return `{\n${lines.join(",\n")}\n${indent}}`;
}
