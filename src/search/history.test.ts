import assert from "node:assert/strict";
import { readSearchHistory, rememberSearch, saveSearchHistory, type SearchHistoryEntry } from "./history";

let history: SearchHistoryEntry[] = [];
for (let i = 0; i < 12; i++) history = rememberSearch(history, { query: `query ${i}`, targetId: "setting" });
assert.equal(history.length, 10);
assert.equal(history.at(-1)?.query, "query 2");

history = rememberSearch(history, { query: " Tető ", targetId: "roof" });
history = rememberSearch(history, { query: "query 8", targetId: "other" });
history = rememberSearch(history, { query: "TETO", targetId: "autoRoof" });
assert.deepEqual(history.slice(0, 2), [
  { query: "TETO", targetId: "autoRoof" }, { query: "query 8", targetId: "other" },
]);
assert.equal(history.filter(entry => entry.targetId === "roof").length, 0);
assert.deepEqual(rememberSearch(history, { query: " ", targetId: "roof" }), history);

let stored: string | null = null;
const storage = () => ({ getItem: () => stored, setItem: (_: string, value: string) => { stored = value; } });
saveSearchHistory(storage, history);
assert.deepEqual(readSearchHistory(storage), history);
saveSearchHistory(storage, []);
assert.deepEqual(readSearchHistory(storage), []);
stored = JSON.stringify([null, { query: "a" }, { query: " ", targetId: "b" }, history[0]]);
assert.deepEqual(readSearchHistory(storage), [history[0]]);
stored = "{";
assert.deepEqual(readSearchHistory(storage), []);
const blocked = () => { throw new Error("Storage blocked"); };
assert.deepEqual(readSearchHistory(blocked), []);
assert.doesNotThrow(() => saveSearchHistory(blocked, history));
