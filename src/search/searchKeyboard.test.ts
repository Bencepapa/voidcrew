import assert from "node:assert/strict";
import { isSearchShortcut } from "./searchKeyboard";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean; code: string }> = {}) =>
  ({ key: k, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, ...mods });

for (const k of ["p", "k", "P", " "]) assert.ok(isSearchShortcut(key(k)), k);
assert.ok(isSearchShortcut(key("Unidentified", { code: "Space" })));
assert.ok(isSearchShortcut(key("F", { shiftKey: true })));
assert.ok(!isSearchShortcut(key("p", { shiftKey: true })));
assert.ok(!isSearchShortcut(key("f")));
assert.ok(!isSearchShortcut(key("k", { ctrlKey: false })));
assert.ok(!isSearchShortcut(key("k", { altKey: true })));
assert.ok(!isSearchShortcut(key("p", { metaKey: true })));
