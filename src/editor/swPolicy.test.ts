// Run: npx tsx src/editor/swPolicy.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  IMMUTABLE_PATH,
  IMMUTABLE_PATH_SOURCE,
  SW_CACHE_NAME,
  SW_CACHE_PREFIX,
  isCacheableResponse,
  isImmutableSharedUrl,
  resolveServiceWorker,
  shouldServeFromCache,
  swParamChoice,
  swScriptUrl,
  swStoredChoice,
} from "./swPolicy";

const STORE = "https://abcdefgh.supabase.co";
const BUCKET = `${STORE}/storage/v1/object/public/void-textures`;
const uuid = "0b8c1f6e-1111-4222-8333-444455556666";

// ---- the URL decision ----------------------------------------------------------------------------
for (const file of ["diffuse.png", "normal.png", "depth.png", "surface.png", "emissive.png", "diffuse.webp", "meta.json"]) {
  assert.ok(isImmutableSharedUrl(`${BUCKET}/fantasy/${uuid}/r3/${file}`, STORE), file);
}
assert.ok(isImmutableSharedUrl(`${BUCKET}/fantasy/prop/${uuid}/r12/meta.json`, STORE), "a kind folder");
assert.ok(isImmutableSharedUrl(`${BUCKET}/common/dialogue/void-fantasy/r4/meta.json`, STORE), "common content");
assert.ok(isImmutableSharedUrl(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png`), "no configured origin: any *.supabase.co");
assert.ok(isImmutableSharedUrl(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png`, `${STORE}/`), "origin given as a URL with a slash");

// not immutable store files
const no = (url: string, why: string, origin: string | undefined = STORE) => assert.equal(isImmutableSharedUrl(url, origin), false, why);
no(`${STORE}/storage/v1/object/list/void-textures`, "storage list endpoint");
no(`${STORE}/storage/v1/object/list/void-textures/fantasy/${uuid}/r3/diffuse.png`, "list endpoint with a revision-looking path");
no(`${STORE}/rest/v1/void_map_heads?world=eq.fantasy`, "rest api");
no(`${STORE}/rest/v1/void_maps/r3/meta.json`, "rest api, revision-looking path");
no(`${STORE}/auth/v1/token`, "auth");
no(`${STORE}/storage/v1/object/void-textures/fantasy/${uuid}/r3/diffuse.png`, "upload (non-public) path");
no(`${STORE}/storage/v1/object/authenticated/void-textures/fantasy/${uuid}/r3/diffuse.png`, "authenticated path");
no(`${STORE}/storage/v1/object/public/other-bucket/fantasy/${uuid}/r3/diffuse.png`, "another bucket");
no(`${BUCKET}/fantasy/${uuid}-name.png`, "legacy flat file");
no(`${BUCKET}/fantasy/${uuid}/meta.json`, "head file, no revision folder");
no(`${BUCKET}/fantasy/${uuid}/r0/meta.json`, "r0 is not a revision");
no(`${BUCKET}/fantasy/${uuid}/rx/meta.json`, "r<non-digits>");
no(`${BUCKET}/fantasy/${uuid}/r3/sub/meta.json`, "only a file directly in the folder");
no(`${BUCKET}/fantasy/${uuid}/r3/`, "the folder itself");
no(`${BUCKET}/fantasy/${uuid}/r3`, "revision folder without file");
no(`${BUCKET}/r3/meta.json`, "no parent folder");
no(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png?v=2`, "query string");
no(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png?download=1`, "download query");
no(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png#x`, "hash");
no(`https://evil.example.com/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`, "other origin");
no(`https://other.supabase.co/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`, "another project when the origin is configured");
no(`https://abcdefgh.supabase.co.evil.example/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`, "suffix-lookalike host", undefined);
no(`https://example.com/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`, "no origin configured, not supabase", undefined);
no(`http://localhost:3000/voidcrew/textures/wall/diffuse.png`, "same-origin bundled file");
no(`ws://abcdefgh.supabase.co/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`, "not http(s)");
no("not a url", "garbage");
no(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png`, "garbage origin configured", "::::");

// ---- the request decision (method, Range) --------------------------------------------------------
const get = (url: string, extra: { method?: string; range?: string | null } = {}) => ({ method: "GET", url, ...extra });
const file = `${BUCKET}/fantasy/${uuid}/r3/diffuse.png`;
assert.ok(shouldServeFromCache(get(file), STORE));
assert.equal(shouldServeFromCache(get(file, { method: "POST" }), STORE), false, "non-GET");
assert.equal(shouldServeFromCache(get(file, { method: "HEAD" }), STORE), false, "HEAD");
assert.equal(shouldServeFromCache(get(file, { range: "bytes=0-99" }), STORE), false, "Range");
assert.equal(shouldServeFromCache(get(file, { range: null }), STORE), true, "no Range header");
assert.equal(shouldServeFromCache(get(`${STORE}/storage/v1/object/list/void-textures`, { method: "POST" }), STORE), false);

// ---- which responses are stored ------------------------------------------------------------------
assert.ok(isCacheableResponse({ status: 200, type: "cors" }));
assert.ok(isCacheableResponse({ status: 200, type: "basic" }));
assert.equal(isCacheableResponse({ status: 200, type: "opaque" }), false, "opaque");
assert.equal(isCacheableResponse({ status: 206, type: "cors" }), false, "partial");
assert.equal(isCacheableResponse({ status: 404, type: "cors" }), false);
assert.equal(isCacheableResponse({ status: 304, type: "cors" }), false);
assert.equal(isCacheableResponse({ status: 0, type: "error" }), false);

// ---- registration decision -----------------------------------------------------------------------
const env = { configured: true, secure: true, supported: true, param: null, stored: null } as const;
assert.equal(resolveServiceWorker(env), true);
assert.equal(resolveServiceWorker({ ...env, configured: false }), false, "packaged build: no store configured");
assert.equal(resolveServiceWorker({ ...env, secure: false }), false, "plain http");
assert.equal(resolveServiceWorker({ ...env, supported: false }), false);
assert.equal(resolveServiceWorker({ ...env, param: "off" }), false, "?sw=off");
assert.equal(resolveServiceWorker({ ...env, stored: "off" }), false, "stored switch off");
assert.equal(resolveServiceWorker({ ...env, param: "on", stored: "off" }), false, "off wins");
assert.equal(resolveServiceWorker({ ...env, param: "on" }), true);
assert.equal(swParamChoice("?sw=off&x=1"), "off");
assert.equal(swParamChoice("?sw=on"), "on");
assert.equal(swParamChoice("?sw=maybe"), null);
assert.equal(swParamChoice(""), null);
assert.equal(swStoredChoice("off"), "off");
assert.equal(swStoredChoice("on"), "on");
assert.equal(swStoredChoice(null), null);
assert.equal(swScriptUrl("/voidcrew/", STORE), "/voidcrew/sw.js?base=https%3A%2F%2Fabcdefgh.supabase.co");

// ---- public/sw.js repeats the policy (it cannot import it) ---------------------------------------
const swText = fs.readFileSync(path.resolve(import.meta.dirname, "../../public/sw.js"), "utf8");
const literal = /const IMMUTABLE_PATH = \/(.*)\/;/.exec(swText);
assert.ok(literal, "sw.js declares IMMUTABLE_PATH as a regex literal");
assert.equal(literal[1], IMMUTABLE_PATH_SOURCE, "sw.js and swPolicy.ts have the same path regex");
assert.equal(new RegExp(literal[1]).source, IMMUTABLE_PATH.source);
assert.ok(swText.includes(`const CACHE_NAME = "${SW_CACHE_NAME}";`), "same cache name");
assert.ok(swText.includes(`const CACHE_PREFIX = "${SW_CACHE_PREFIX}";`), "same cache prefix");
assert.ok(SW_CACHE_NAME.startsWith(SW_CACHE_PREFIX));
assert.doesNotMatch(swText, /^\s*(import|export)\s/m, "sw.js is plain script: no imports");

// ---- run the real worker script against fakes ----------------------------------------------------
type Listener = (event: any) => void;
function loadWorker(href: string) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const fetchCalls: { url: string; init?: any }[] = [];
  const behavior = { fetch: (_url: string, _init?: any): Promise<any> => Promise.reject(new Error("no network")) };
  let claimed = false;
  let skipped = false;
  const makeCache = (map: Map<string, Response>) => ({
    match: async (url: string) => map.get(typeof url === "string" ? url : (url as any).url),
    put: async (url: string, response: Response) => {
      const key = typeof url === "string" ? url : (url as any).url;
      map.delete(key); // (re-putting moves it to the end)
      map.set(key, response);
    },
    keys: async () => [...map.keys()].map(url => ({ url })),
    delete: async (req: any) => map.delete(typeof req === "string" ? req : req.url),
  });
  const context = vm.createContext({
    URL,
    Promise,
    console,
    self: {
      location: { href },
      addEventListener: (type: string, fn: Listener) => void listeners.set(type, fn),
      skipWaiting: async () => void (skipped = true),
      clients: { claim: async () => void (claimed = true) },
    },
    caches: {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return makeCache(stores.get(name)!);
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: (input: any, init?: any) => {
      fetchCalls.push({ url: typeof input === "string" ? input : input.url, init });
      return behavior.fetch(typeof input === "string" ? input : input.url, init);
    },
  });
  vm.runInContext(swText, context, { filename: "sw.js" });

  // fires a fetch event; resolves with what the worker answered (undefined: it did not respond, the browser goes on)
  async function fire(request: Request) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<any> | undefined;
    listeners.get("fetch")!({
      request,
      respondWith: (p: Promise<any>) => void (responded = p),
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
    });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return { handled: !!responded, response };
  }
  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits);
  }
  return { fire, lifecycle, stores, fetchCalls, behavior, state: () => ({ claimed, skipped }), listeners };
}

const ok = (body = "x", extra: ResponseInit = {}) => new Response(body, { status: 200, ...extra });
const request = (url: string, init?: RequestInit) => new Request(url, init);
const WORKER = `https://app.example/voidcrew/sw.js?base=${encodeURIComponent(STORE)}`;

{
  // a miss goes to the network (cors, no credentials) and is stored; the next one never leaves the cache
  const w = loadWorker(WORKER);
  assert.deepEqual([...w.listeners.keys()].sort(), ["activate", "fetch", "install"]);
  w.behavior.fetch = async () => ok("png-bytes");
  const first = await w.fire(request(file, { mode: "no-cors" }));
  assert.ok(first.handled);
  assert.equal(await first.response.text(), "png-bytes");
  assert.equal(w.fetchCalls.length, 1);
  assert.deepEqual({ ...w.fetchCalls[0].init }, { mode: "cors", credentials: "omit" }, "re-fetched with CORS, not opaque");
  assert.equal(w.fetchCalls[0].url, file);
  assert.equal(w.stores.get(SW_CACHE_NAME)!.size, 1, "stored");

  w.behavior.fetch = async () => assert.fail("a cached file must not touch the network");
  const second = await w.fire(request(file));
  assert.ok(second.handled);
  assert.equal(await second.response.text(), "png-bytes");
  assert.equal(w.fetchCalls.length, 1);
}

{
  // everything else is left alone: no respondWith, no fetch
  const w = loadWorker(WORKER);
  w.behavior.fetch = async () => assert.fail("must not be called");
  const untouched: Request[] = [
    request(`${STORE}/storage/v1/object/list/void-textures`, { method: "POST", body: "{}" }),
    request(`${STORE}/rest/v1/void_map_heads?world=eq.fantasy`),
    request(`${STORE}/auth/v1/token?grant_type=password`, { method: "POST", body: "{}" }),
    request(`${BUCKET}/fantasy/${uuid}-legacy.png`),
    request(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png`, { method: "POST", body: "x" }),
    request(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png`, { headers: { Range: "bytes=0-9" } }),
    request(`${BUCKET}/fantasy/${uuid}/r3/diffuse.png?v=4`),
    request(`https://other.supabase.co/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`),
    request("https://app.example/voidcrew/index.html"),
    request("https://app.example/voidcrew/@vite/client"),
    request(`https://app.example/voidcrew/textures/wall/r3/diffuse.png`),
  ];
  for (const r of untouched) {
    const result = await w.fire(r);
    assert.equal(result.handled, false, `${r.method} ${r.url} is passed through`);
  }
  assert.equal(w.fetchCalls.length, 0);
  assert.equal(w.stores.size, 0, "nothing stored, nothing opened");
}

{
  // without ?base= any *.supabase.co store counts
  const w = loadWorker("https://app.example/voidcrew/sw.js");
  w.behavior.fetch = async () => ok();
  assert.ok((await w.fire(request(file))).handled);
  assert.equal((await w.fire(request(`https://example.com/storage/v1/object/public/void-textures/fantasy/${uuid}/r3/diffuse.png`))).handled, false);
}

{
  // only complete successful responses are stored; the page still gets whatever came
  const w = loadWorker(WORKER);
  w.behavior.fetch = async () => new Response("missing", { status: 404 });
  const notFound = await w.fire(request(file));
  assert.ok(notFound.handled);
  assert.equal(notFound.response.status, 404);
  assert.equal(w.stores.get(SW_CACHE_NAME)!.size, 0, "404 not stored");

  w.behavior.fetch = async () => new Response("part", { status: 206, headers: { "Content-Range": "bytes 0-3/10" } });
  assert.equal((await w.fire(request(file))).response.status, 206);
  assert.equal(w.stores.get(SW_CACHE_NAME)!.size, 0, "206 not stored");

  const opaque = { status: 200, type: "opaque", clone() { return this; } };
  w.behavior.fetch = async () => opaque;
  assert.equal((await w.fire(request(file))).response, opaque);
  assert.equal(w.stores.get(SW_CACHE_NAME)!.size, 0, "opaque not stored");
}

{
  // a failed CORS re-fetch falls back to the page's own request, uncached; a failing network fails like it would have
  const w = loadWorker(WORKER);
  let n = 0;
  w.behavior.fetch = async (_url, init) => {
    n++;
    if (init?.mode === "cors") throw new TypeError("cors failed");
    return ok("plain");
  };
  const r = await w.fire(request(file));
  assert.ok(r.handled);
  assert.equal(await r.response.text(), "plain");
  assert.equal(n, 2, "cors attempt, then the plain request");
  assert.equal(w.stores.get(SW_CACHE_NAME)!.size, 0);

  w.behavior.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(async () => (await w.fire(request(file))).response, TypeError);
}

{
  // a broken Cache Storage never breaks loading
  const w = loadWorker(WORKER);
  (w as any).stores.set = () => { throw new Error("quota"); };
  w.behavior.fetch = async () => ok("still works");
  const r = await w.fire(request(file));
  assert.equal(await r.response.text(), "still works");
}

{
  // the cap: oldest first
  const w = loadWorker(WORKER);
  w.behavior.fetch = async () => ok();
  for (let i = 0; i < 603; i++) await w.fire(request(`${BUCKET}/fantasy/${uuid}/r1/f${i}.png`));
  const cache = w.stores.get(SW_CACHE_NAME)!;
  assert.equal(cache.size, 600);
  assert.equal(cache.has(`${BUCKET}/fantasy/${uuid}/r1/f0.png`), false, "oldest dropped");
  assert.equal(cache.has(`${BUCKET}/fantasy/${uuid}/r1/f2.png`), false);
  assert.equal(cache.has(`${BUCKET}/fantasy/${uuid}/r1/f3.png`), true);
  assert.equal(cache.has(`${BUCKET}/fantasy/${uuid}/r1/f602.png`), true, "newest kept");
}

{
  // install takes over at once; activate drops older shared caches (and only those)
  const w = loadWorker(WORKER);
  await w.lifecycle("install");
  assert.equal(w.state().skipped, true);
  for (const name of ["void-shared-v0", SW_CACHE_NAME, "void-shared-old", "someone-elses"]) w.stores.set(name, new Map());
  await w.lifecycle("activate");
  assert.deepEqual([...w.stores.keys()].sort(), [SW_CACHE_NAME, "someone-elses"].sort());
  assert.equal(w.state().claimed, true);
}

console.log("swPolicy tests passed");
