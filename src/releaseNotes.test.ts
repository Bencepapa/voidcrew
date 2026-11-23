import { CURRENT_RELEASE, RELEASES, pendingReleases, releasesSince, type Release } from "./releaseNotes";

function assert(cond: unknown, msg: string) { if (!cond) throw new Error("FAIL: " + msg); }

const sample: Release[] = [
  { version: 3, date: "2026-12-01", items: [{ title: "c", text: "c" }] },
  { version: 2, date: "2026-11-25", items: [{ title: "b", text: "b" }] },
  { version: 1, date: "2026-11-23", items: [{ title: "a", text: "a" }] },
];

assert(releasesSince(3, sample).length === 0, "up to date shows nothing");
assert(releasesSince(1, sample).map(r => r.version).join() === "3,2", "newer ones, newest first");
assert(releasesSince(0, sample).length === 3, "from zero shows all");
assert(pendingReleases(undefined, false, sample).length === 0, "brand-new user sees nothing");
assert(pendingReleases(undefined, true, sample).length === 3, "returning user without a marker sees all");
assert(pendingReleases(2, true, sample).map(r => r.version).join() === "3", "stored 2 sees only 3");

// the real data: strictly decreasing versions, every item has a title and text
for (let i = 0; i < RELEASES.length; i++) {
  const r = RELEASES[i];
  assert(r.items.length > 0, `release ${r.version} has items`);
  for (const it of r.items) assert(it.title.trim() && it.text.trim(), `release ${r.version} item is filled in`);
  if (i > 0) assert(RELEASES[i - 1].version > r.version, "newest first, versions strictly decreasing");
}
assert(CURRENT_RELEASE === RELEASES[0].version, "current = the top entry");

console.log("releaseNotes ok");
