import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer as createPortProbe } from "node:net";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ignoredConsoleErrors = [
  // Chromium can lack a usable audio device on headless Windows.
  /^The AudioContext encountered an error from the audio device or the WebAudio renderer\. \(/,
];
const maps = [
  { world: "fantasy", id: "tesztsztori" },
  { world: "scifi", id: "deck1-medical" }, // lights
  { world: "scifi", id: "deck2-engineering" }, // smoke emitters
];
const base = "/voidcrew/";
const timeout = 60_000;
const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("./.smoke-out/", import.meta.url);
const chromiumArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

async function freePort(host) {
  const probe = createPortProbe();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, host, resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startBrowser() {
  const failures = [];
  for (const headless of [true, false]) {
    for (const channel of ["msedge", "chrome"]) {
      const mode = `${channel} ${headless ? "headless" : "headed"}`;
      let browser;
      try {
        browser = await chromium.launch({ channel, headless, args: chromiumArgs, timeout: 15_000 });
        const probe = await browser.newPage();
        const supported = await probe.evaluate(() => {
          const gl = document.createElement("canvas").getContext("webgl2");
          return Boolean(gl && !gl.isContextLost());
        });
        await probe.close();
        assert(supported, "WebGL2 context unavailable");
        console.log(`Browser: ${mode}`);
        return browser;
      } catch (error) {
        const failure = `${mode}: ${error.message}`;
        failures.push(failure);
        console.warn(failure);
        await browser?.close();
      }
    }
  }
  throw new Error(`No installed browser could initialize WebGL2:\n${failures.join("\n")}`);
}

async function saveShot(page, name) {
  await mkdir(output, { recursive: true });
  const path = fileURLToPath(new URL(`${name}.png`, output));
  await page.screenshot({ path, timeout: 20_000 });
  console.log(`Screenshot: ${path}`);
}

async function hasRenderedPixels(page, clip, timeLeft) {
  // Hide overlays during the canvas screenshot so HUD text cannot make a
  // blank canvas pass.
  const png = await page.screenshot({
    clip,
    timeout: Math.ceil(timeLeft),
    style: "* { visibility: hidden !important; } canvas[data-smoke-webgl] { visibility: visible !important; }",
  });
  const rgb = await sharp(png).resize(64, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
  for (let channel = 0; channel < 3; channel++) {
    let min = 255;
    let max = 0;
    for (let index = channel; index < rgb.length; index += 3) {
      min = Math.min(min, rgb[index]);
      max = Math.max(max, rgb[index]);
    }
    if (max - min >= 8) return true;
  }
  return false;
}

async function smokeMap(context, url, name, { interact, shots }) {
  const start = performance.now();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const entry = `${message.text()} (${message.location().url})`;
      if (!ignoredConsoleErrors.some((pattern) => pattern.test(entry))) errors.push(`console.error: ${entry}`);
    }
  });
  const checkErrors = () => assert.equal(errors.length, 0, errors.join("\n"));
  let check = "navigation";
  console.log(`Opening ${url}`);
  try {
    const response = await page.goto(url.href, { waitUntil: "commit", timeout });
    assert(response?.ok(), `HTTP ${response?.status()}`);
    check = "scene ready";
    await page.waitForFunction(() => window.__voidcrewBuild?.readyAt > 0, undefined, { timeout: 90_000 });
    checkErrors();

    check = "WebGL canvas size and context";
    const canvas = page.locator("canvas[data-smoke-webgl]");
    await canvas.waitFor({ state: "visible", timeout });
    const clip = await canvas.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const gl = element.getContext(element.dataset.smokeWebgl);
      if (width >= 128 && height >= 128 && element.width >= 128 && element.height >= 128
        && gl && !gl.isContextLost()) return { x, y, width, height };
      return null;
    }, undefined, { timeout });
    assert(clip, "Expected a live WebGL canvas at least 128×128");

    check = "non-uniform canvas pixels";
    const deadline = performance.now() + timeout;
    while (true) {
      checkErrors();
      const timeLeft = deadline - performance.now();
      assert(timeLeft > 0, "Canvas remained black or uniform");
      if (await hasRenderedPixels(page, clip, timeLeft)) break;
      await delay(250);
    }

    if (interact) {
      check = "W interaction";
      await page.keyboard.press("w");
      await delay(1_000);
      checkErrors();
    }
    check = "Hibakeresés (Debug panel)";
    // The compact layout keeps the panel in the menu.
    await page.getByRole("button", { name: "Menü megnyitása", exact: true })
      .dispatchEvent("click", undefined, { timeout });
    // The header includes the Play toggle's text in the same element.
    await page.getByText(/^Hibakeresés/).waitFor({ state: "visible", timeout });
    check = "requested map in the Debug panel";
    await page.getByRole("button", { name: `Pálya letöltése (${name}.json)`, exact: true })
      .waitFor({ state: "attached", timeout });
    check = "browser errors";
    checkErrors();
    if (shots) {
      check = "screenshot";
      await saveShot(page, name);
      checkErrors();
    }
    return { Map: name, Result: "PASS", Seconds: ((performance.now() - start) / 1_000).toFixed(2) };
  } catch (error) {
    console.error(`${url} — ${check} failed: ${error.message}`);
    if (errors.length) console.error(errors.join("\n"));
    await saveShot(page, name).catch((shotError) => console.error(`Screenshot failed: ${shotError.message}`));
    return { Map: name, Result: "FAIL", Seconds: ((performance.now() - start) / 1_000).toFixed(2) };
  } finally {
    await page.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: { url: { type: "string" }, only: { type: "string" }, shots: { type: "boolean" } },
  });
  const selected = maps.filter(({ id }) => id.includes(values.only ?? ""));
  assert(selected.length, `No map matches --only ${values.only}`);
  let server;
  let browser;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    process.exitCode = 1;
    void browser?.close().catch(console.error);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    let origin = values.url;
    if (origin === undefined) {
      const { createServer } = await import("vite");
      const host = "127.0.0.1";
      // Keep dependency caches out of the shared node_modules junction.
      server = await createServer({
        root,
        configLoader: "runner",
        cacheDir: ".vite-asset-tree/smoke/node_modules/.vite",
        server: { host, port: await freePort(host), strictPort: true },
      });
      await server.listen();
      origin = server.resolvedUrls.local[0];
      const ready = await fetch(new URL(base, origin), { signal: AbortSignal.timeout(timeout) });
      assert(ready.ok, `Vite readiness check returned HTTP ${ready.status}`);
      await ready.body?.cancel();
    }
    assert(!interrupted, "Interrupted");
    browser = await startBrowser();
    assert(!interrupted, "Interrupted");
    const context = await browser.newContext({ locale: "hu-HU", viewport: { width: 640, height: 480 } });
    // The optional Google Fonts stylesheet can block startup on offline hosts.
    // Use the app's fallback fonts to keep the viewport check local.
    await context.route("https://fonts.googleapis.com/css2?**", (route) =>
      route.fulfill({ contentType: "text/css", body: "" }),
    );
    await context.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const context = getContext.call(this, type, ...args);
        if (context && (type === "webgl2" || type === "webgl")) this.dataset.smokeWebgl = type;
        return context;
      };
    });
    const results = [];
    for (const [index, { world, id }] of selected.entries()) {
      if (interrupted) break;
      const url = new URL(base, origin);
      url.search = new URLSearchParams({ world, map: id, play: "off", shared: "none" });
      const result = await smokeMap(context, url, id, { interact: index === 0, shots: values.shots });
      results.push(result);
      if (result.Result === "FAIL") process.exitCode = 1;
    }
    console.table(results);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    for (const cleanup of await Promise.allSettled([browser?.close(), server?.close()])) {
      if (cleanup.status === "rejected") {
        console.error(cleanup.reason);
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
