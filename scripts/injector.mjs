import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const bundledPresetsRoot = path.join(root, "presets");
const SKIN_VERSION = "1.7.18";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const BROWSER_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const THEME_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_ART_BYTES = 16 * 1024 * 1024;
const MAX_DECORATION_BYTES = 8 * 1024 * 1024;
const MAX_CATALOG_BYTES = 48 * 1024 * 1024;

class CdpIdentityMismatchError extends Error {}

function parseArgs(argv) {
  const options = {
    port: 9335,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    browserId: null,
    themeDir: null,
    libraryDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--browser-id") options.browserId = argv[++i];
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--library-dir") options.libraryDir = path.resolve(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--self-test") options.mode = "self-test";
    else if (arg === "--check-payload") options.mode = "check-payload";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.browserId !== null && !BROWSER_ID_PATTERN.test(options.browserId)) {
    throw new Error(`Invalid browser ID: ${options.browserId}`);
  }
  if (["watch", "once", "check-payload"].includes(options.mode) && !options.themeDir) {
    throw new Error(`--theme-dir is required in ${options.mode} mode`);
  }
  if (["watch", "once", "verify", "remove"].includes(options.mode) && !options.browserId) {
    throw new Error(`--browser-id is required in ${options.mode} mode`);
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/(?:page|browser)\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port ||
      url.username || url.password || url.search || url.hash || !pathIsValid) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback endpoint shape");
  }
  return url.href;
}

function browserIdFromVersion(version, port) {
  const url = validatedDebuggerUrl(version, port);
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/devtools\/browser\/([A-Za-z0-9._-]{1,200})$/);
  if (!match || parsed.search || parsed.hash || !BROWSER_ID_PATTERN.test(match[1])) {
    throw new Error("Rejected an invalid CDP browser identity URL");
  }
  return match[1];
}

function isValidCdpPageTarget(item, port) {
  if (item?.type !== "page" || !item.url?.startsWith("app://") || typeof item.id !== "string" ||
      !BROWSER_ID_PATTERN.test(item.id) || !item.webSocketDebuggerUrl) return false;
  try {
    const debuggerUrl = new URL(validatedDebuggerUrl(item, port));
    return debuggerUrl.pathname === `/devtools/page/${item.id}`;
  } catch {
    return false;
  }
}

class CdpSession {
  constructor(target, port) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.defaultContextId = null;
    this.closed = false;
  }

  async open({ page = true } = {}) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("error", () => this.close());
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    if (page) {
      await this.send("Runtime.enable");
      await this.send("Page.enable");
    }
    return this;
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.executionContextCreated" && message.params?.context?.auxData?.isDefault) {
      this.defaultContextId = message.params.context.id;
    } else if (message.method === "Runtime.executionContextsCleared") {
      this.defaultContextId = null;
    } else if (message.method === "Runtime.executionContextDestroyed" &&
      message.params?.executionContextId === this.defaultContextId) {
      this.defaultContextId = null;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
      ...(this.defaultContextId === null ? {} : { contextId: this.defaultContextId }),
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

class BrowserIdentityAnchor {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.closed = false;
    this.ws.addEventListener("close", () => { this.closed = true; });
    this.ws.addEventListener("error", () => {
      this.closed = true;
      try { this.ws.close(); } catch {}
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.close();
        reject(new Error("CDP browser identity WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP browser identity WebSocket open failed"));
      }, { once: true });
      this.ws.addEventListener("close", () => {
        clearTimeout(timeout);
        reject(new Error("CDP browser identity WebSocket closed during startup"));
      }, { once: true });
    });
    if (this.closed) throw new Error("CDP browser identity WebSocket is already closed");
    return this;
  }

  close() {
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function fetchCdpJson(port, resource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${resource}`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function listAppTargets(port, expectedBrowserId = null) {
  const targets = await fetchCdpJson(port, "/json/list");
  if (!Array.isArray(targets)) throw new Error("CDP target list is not an array");
  if (expectedBrowserId) {
    const version = await fetchCdpJson(port, "/json/version");
    const actualBrowserId = browserIdFromVersion(version, port);
    if (actualBrowserId !== expectedBrowserId) {
      throw new CdpIdentityMismatchError(
        `CDP browser identity changed from ${expectedBrowserId} to ${actualBrowserId}`,
      );
    }
  }
  return targets.filter((item) => isValidCdpPageTarget(item, port));
}

async function connectBrowserIdentityAnchor(port, expectedBrowserId) {
  const version = await fetchCdpJson(port, "/json/version");
  const actualBrowserId = browserIdFromVersion(version, port);
  if (actualBrowserId !== expectedBrowserId) {
    throw new CdpIdentityMismatchError(
      `CDP browser identity changed from ${expectedBrowserId} to ${actualBrowserId}`,
    );
  }
  return new BrowserIdentityAnchor(validatedDebuggerUrl(version, port)).open();
}

function assertSafeAssetName(value, label) {
  if (typeof value !== "string" || !value || path.basename(value) !== value ||
      value.includes("\0") || value === "." || value === "..") {
    throw new Error(`${label} must be a plain filename`);
  }
}

function imageMime(bytes, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (ext !== ".png") throw new Error(`Image extension does not match PNG content: ${filename}`);
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    if (![".jpg", ".jpeg"].includes(ext)) throw new Error(`Image extension does not match JPEG content: ${filename}`);
    return "image/jpeg";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    if (ext !== ".webp") throw new Error(`Image extension does not match WebP content: ${filename}`);
    return "image/webp";
  }
  throw new Error(`Unsupported or invalid image: ${filename}`);
}

async function readThemePack(themeDir) {
  const manifestPath = path.join(themeDir, "theme.json");
  const theme = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (!theme || typeof theme !== "object" || Array.isArray(theme) || theme.schemaVersion !== 1 ||
      !THEME_ID_PATTERN.test(theme.id) || typeof theme.name !== "string" || !theme.name.trim()) {
    throw new Error(`Invalid theme manifest: ${manifestPath}`);
  }
  assertSafeAssetName(theme.image, "theme.image");
  const art = await fs.readFile(path.join(themeDir, theme.image));
  if (!art.length || art.length > MAX_ART_BYTES) {
    throw new Error(`Theme image must be between 1 byte and ${MAX_ART_BYTES} bytes: ${theme.id}`);
  }
  const artMime = imageMime(art, theme.image);
  const decorationData = {};
  for (const key of ["assistant", "qqShow"]) {
    const filename = theme.decorations?.[key];
    if (!filename) continue;
    assertSafeAssetName(filename, `theme.decorations.${key}`);
    const bytes = await fs.readFile(path.join(themeDir, filename));
    if (!bytes.length || bytes.length > MAX_DECORATION_BYTES) {
      throw new Error(`Decoration is empty or too large: ${filename}`);
    }
    decorationData[key] = { bytes, mime: imageMime(bytes, filename) };
  }
  return { themeDir, theme, art, artMime, decorationData };
}

async function discoverThemePacks(activeThemeDir, libraryDir) {
  const candidates = new Map();
  const addRoot = async (directory) => {
    if (!directory) return;
    let entries = [];
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && THEME_ID_PATTERN.test(entry.name)) {
        candidates.set(path.resolve(directory, entry.name).toLowerCase(), path.resolve(directory, entry.name));
      }
    }
  };
  await addRoot(bundledPresetsRoot);
  await addRoot(libraryDir);
  candidates.set(path.resolve(activeThemeDir).toLowerCase(), path.resolve(activeThemeDir));

  const packs = [];
  let totalBytes = 0;
  for (const directory of candidates.values()) {
    let pack;
    try { pack = await readThemePack(directory); } catch (error) {
      if (path.resolve(directory) === path.resolve(activeThemeDir)) throw error;
      console.error(`[one-click-skin] skipped invalid theme at ${directory}: ${error.message}`);
      continue;
    }
    const packBytes = pack.art.length + Object.values(pack.decorationData)
      .reduce((sum, item) => sum + item.bytes.length, 0);
    if (totalBytes + packBytes > MAX_CATALOG_BYTES && path.resolve(directory) !== path.resolve(activeThemeDir)) continue;
    totalBytes += packBytes;
    packs.push(pack);
  }
  const active = packs.find((pack) => path.resolve(pack.themeDir) === path.resolve(activeThemeDir));
  if (!active) throw new Error("The active theme was not loaded into the catalog");
  const byId = new Map();
  for (const pack of packs) {
    if (byId.has(pack.theme.id)) throw new Error(`Duplicate theme id: ${pack.theme.id}`);
    byId.set(pack.theme.id, pack);
  }
  return { packs, active };
}

async function loadPayload(themeDir = options.themeDir, libraryDir = options.libraryDir) {
  const [cssTemplate, template, iconSprite, catalog] = await Promise.all([
    fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    fs.readFile(path.join(root, "assets", "qq2007-icons.png")),
    discoverThemePacks(themeDir, libraryDir),
  ]);
  const dataUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString("base64")}`;
  const css = cssTemplate.replaceAll("__DREAM_SKIN_ICON_SPRITE__", dataUrl("image/png", iconSprite));
  const styleRevision = createHash("sha256").update(css).digest("hex").slice(0, 20);
  const catalogMeta = catalog.packs.map(({ theme }) => ({ id: theme.id, name: theme.name }));
  const payloads = {};
  for (const pack of catalog.packs) {
    const theme = structuredClone(pack.theme);
    if (!Array.isArray(theme.explicitColorKeys)) {
      theme.explicitColorKeys = Object.keys(theme.colors || {});
    }
    theme.artKey = createHash("sha256").update(pack.art).digest("hex").slice(0, 20);
    theme.catalog = catalogMeta;
    theme.decorationData = Object.fromEntries(Object.entries(pack.decorationData)
      .map(([key, value]) => [key, dataUrl(value.mime, value.bytes)]));
    payloads[theme.id] = template
      .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(css))
      .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify(dataUrl(pack.artMime, pack.art)))
      .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(theme))
      .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify(SKIN_VERSION))
      .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(styleRevision));
  }
  const bundleId = `${process.pid}-${Date.now()}-${catalog.active.theme.id}`;
  return `(() => {
    const payloads = ${JSON.stringify(payloads)};
    const themes = ${JSON.stringify(catalogMeta)};
    const api = {
      themes,
      apply(id) {
        const payload = payloads[id];
        if (!payload) return false;
        try { window.localStorage?.setItem?.("codex-one-click-skin.active-theme", JSON.stringify(id)); } catch {}
        return (0, eval)(payload);
      },
    };
    window.__CODEX_ONE_CLICK_SKIN__ = api;
    let selected = ${JSON.stringify(catalog.active.theme.id)};
    try {
      const bundleKey = "codex-one-click-skin.bundle-id";
      const activeKey = "codex-one-click-skin.active-theme";
      const sameBundle = window.localStorage?.getItem?.(bundleKey) === ${JSON.stringify(bundleId)};
      const saved = JSON.parse(window.localStorage?.getItem?.(activeKey) || "null");
      if (sameBundle && typeof saved === "string" && payloads[saved]) selected = saved;
      else {
        window.localStorage?.setItem?.(bundleKey, ${JSON.stringify(bundleId)});
        window.localStorage?.setItem?.(activeKey, JSON.stringify(selected));
      }
    } catch {}
    return api.apply(selected);
  })()`;
}

async function probeSession(session) {
  return session.evaluate(`(() => {
    const markers = {
      shell: Boolean(document.querySelector('main.main-surface, [class*="MainContentSurface"]')),
      sidebar: Boolean(document.querySelector('aside.app-shell-left-panel')),
      composer: Boolean(document.querySelector('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [class*="RichTextInput"]')),
      main: Boolean(document.querySelector('[role="main"]')),
    };
    return {
      markers,
      codex: location.protocol === 'app:' && markers.shell && markers.sidebar && (markers.composer || markers.main),
    };
  })()`);
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

async function connectCodexTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port, options.browserId);
      const connected = [];
      for (const target of targets) {
        let session;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else session.close();
        } catch (error) {
          session?.close();
          lastError = error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      if (error instanceof CdpIdentityMismatchError) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-dream-skin');
    document.documentElement?.style.removeProperty('--dream-art');
    document.querySelectorAll('.dream-home').forEach((node) => node.classList.remove('dream-home'));
    document.querySelectorAll('.dream-home-shell').forEach((node) => node.classList.remove('dream-home-shell'));
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    return true;
  })()`);
}

async function verifyRemovedSession(session) {
  return session.evaluate(`(() =>
    !document.documentElement.classList.contains('codex-dream-skin') &&
    !document.documentElement.style.getPropertyValue('--dream-art') &&
    !document.querySelector('.dream-home') &&
    !document.querySelector('.dream-home-shell') &&
    !document.getElementById('codex-dream-skin-style') &&
    !document.getElementById('codex-dream-skin-chrome') &&
    !window.__CODEX_DREAM_SKIN_STATE__
  )()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.dream-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cards = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: window.__CODEX_DREAM_SKIN_STATE__?.version ?? null,
      expectedVersion: ${JSON.stringify(SKIN_VERSION)},
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      chromePointerEvents: getComputedStyle(document.getElementById('codex-dream-skin-chrome') || document.body).pointerEvents,
      homePresent: Boolean(home),
      suggestionsPresent: Boolean(suggestions),
      hero: box(home?.firstElementChild?.firstElementChild?.firstElementChild),
      cards,
      composer: box(document.querySelector('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [class*="RichTextInput"]')),
      sidebar: box(document.querySelector('aside.app-shell-left-panel')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    result.pass = result.installed && result.version === result.expectedVersion &&
      result.stylePresent && result.chromePresent &&
      result.chromePointerEvents === 'none' && Boolean(result.composer) && Boolean(result.sidebar) &&
      (!result.homePresent || (Boolean(result.hero) &&
        (!result.suggestionsPresent || (result.cards.length >= 2 && result.cards.length <= 4))));
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  let lastError;
  while (Date.now() < deadline) {
    try {
      lastResult = await verifySession(session);
      lastError = null;
      if (lastResult.pass) return lastResult;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!lastResult && lastError) throw lastError;
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runOneShot(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const payload = (options.mode === "once" || options.reload) ? await loadPayload() : null;
  const results = [];
  let screenshotCaptured = false;
  try {
    for (const { target, session, probe } of connected) {
      try {
        if (options.mode === "remove") await removeFromSession(session);
        else if (options.mode === "once") await applyToSession(session, payload);
        if (options.mode === "once") {
          await new Promise((resolve) => setTimeout(resolve, 850));
        }
        if (options.reload) {
          await session.send("Page.reload", { ignoreCache: true });
          await new Promise((resolve) => setTimeout(resolve, 1600));
          if (options.mode !== "remove") await applyToSession(session, payload);
        }
        const verified = options.mode === "remove"
          ? await verifyRemovedSession(session)
          : (options.reload || options.mode === "once" || options.mode === "verify")
            ? await waitForVerifiedSession(session, options.timeoutMs)
            : await verifySession(session);
        results.push({ targetId: target.id, markers: probe.markers, result: verified });
        if (options.screenshot && !screenshotCaptured) {
          await capture(session, options.screenshot);
          screenshotCaptured = true;
        }
      } finally {
        session.close();
      }
    }
  } finally {
    for (const { session } of connected) session.close();
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) =>
    options.mode === "remove" ? item.result !== true : !item.result?.pass);
  if (failed) process.exitCode = 2;
}

async function runWatch(options) {
  const identityAnchor = await connectBrowserIdentityAnchor(options.port, options.browserId);
  const sessions = new Map();
  const targetFailures = new Map();
  let stopping = false;
  let listFailures = 0;
  let lastListErrorLogAt = 0;
  const stop = () => { stopping = true; };
  const rejectTarget = (target, baseDelayMs, error = null) => {
    const previous = targetFailures.get(target.id) ?? { failures: 0, lastLogAt: 0 };
    const failures = previous.failures + 1;
    const delayMs = Math.min(30000, baseDelayMs * (2 ** Math.min(failures - 1, 4)));
    const now = Date.now();
    if (error && (failures === 1 || now - previous.lastLogAt >= 30000)) {
      console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}; retrying in ${delayMs}ms`);
      previous.lastLogAt = now;
    }
    targetFailures.set(target.id, { failures, lastLogAt: previous.lastLogAt, until: now + delayMs });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    const payload = await loadPayload();
    while (!stopping) {
      if (identityAnchor.closed) {
        console.error("[dream-skin] original CDP browser identity closed; watcher is stopping instead of reconnecting");
        process.exitCode = 3;
        break;
      }
      let targets = [];
      try {
        targets = await listAppTargets(options.port);
        listFailures = 0;
      } catch (error) {
        listFailures += 1;
        const retryMs = Math.min(10000, 1000 * (2 ** Math.min(listFailures - 1, 4)));
        if (listFailures === 1 || Date.now() - lastListErrorLogAt >= 30000) {
          console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}; retrying in ${retryMs}ms`);
          lastListErrorLogAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        continue;
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const id of targetFailures.keys()) {
        if (!activeIds.has(id)) targetFailures.delete(id);
      }
      for (const [id, session] of sessions) {
        if (!activeIds.has(id) || session.closed) {
          session.close();
          sessions.delete(id);
          targetFailures.delete(id);
        }
      }

      for (const target of targets) {
        if (identityAnchor.closed) break;
        if (sessions.has(target.id)) continue;
        if ((targetFailures.get(target.id)?.until ?? 0) > Date.now()) continue;
        let session;
        try {
          session = await connectTarget(target, options.port);
          if (identityAnchor.closed) throw new CdpIdentityMismatchError("Original CDP browser identity closed");
          const probe = await probeSession(session);
          if (!probe?.codex) {
            rejectTarget(target, 5000);
            session.close();
            continue;
          }
          let lastReinjectErrorLogAt = 0;
          session.on("Page.loadEventFired", () => {
            setTimeout(() => applyToSession(session, payload).catch((error) => {
              if (Date.now() - lastReinjectErrorLogAt >= 30000) {
                console.error(`[dream-skin] reinject failed for ${target.id}: ${error.message}`);
                lastReinjectErrorLogAt = Date.now();
              }
            }), 250);
          });
          if (identityAnchor.closed) throw new CdpIdentityMismatchError("Original CDP browser identity closed");
          await applyToSession(session, payload);
          sessions.set(target.id, session);
          targetFailures.delete(target.id);
          console.log(`[dream-skin] injected target ${target.id}`);
        } catch (error) {
          session?.close();
          if (identityAnchor.closed || error instanceof CdpIdentityMismatchError) break;
          rejectTarget(target, 2500, error);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } finally {
    identityAnchor.close();
    for (const session of sessions.values()) session.close();
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "self-test") {
  const valid = validatedDebuggerUrl({ webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/page/test` }, options.port);
  const browserId = browserIdFromVersion({
    webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/browser/test-browser`,
  }, options.port);
  const invalid = [
    "ws://example.com/devtools/page/test",
    `ws://127.0.0.1:${options.port + 1}/devtools/page/test`,
    `wss://127.0.0.1:${options.port}/devtools/page/test`,
    `ws://user@127.0.0.1:${options.port}/devtools/page/test`,
    `ws://127.0.0.1:${options.port}/unexpected/test`,
    `ws://127.0.0.1:${options.port}/devtools/page/test?query=1`,
  ];
  for (const value of invalid) {
    let rejected = false;
    try { validatedDebuggerUrl({ webSocketDebuggerUrl: value }, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`CDP URL validation accepted an unsafe URL: ${value}`);
  }
  const invalidBrowserUrls = [
    `ws://127.0.0.1:${options.port}/devtools/page/not-a-browser`,
    `ws://127.0.0.1:${options.port}/devtools/browser/bad%20id`,
    `ws://127.0.0.1:${options.port}/devtools/browser/test?query=1`,
  ];
  for (const value of invalidBrowserUrls) {
    let rejected = false;
    try { browserIdFromVersion({ webSocketDebuggerUrl: value }, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`Browser identity validation accepted an unsafe URL: ${value}`);
  }
  const validPageTarget = {
    id: "page-test",
    type: "page",
    url: "app://codex/",
    webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/page/page-test`,
  };
  const invalidPageTargets = [
    { ...validPageTarget, webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/browser/page-test` },
    { ...validPageTarget, id: "other-page" },
    { ...validPageTarget, id: 123 },
    { ...validPageTarget, type: "other" },
  ];
  if (!valid || browserId !== "test-browser" || !isValidCdpPageTarget(validPageTarget, options.port) ||
      invalidPageTargets.some((item) => isValidCdpPageTarget(item, options.port))) {
    throw new Error("CDP URL and target validation self-test failed");
  }
  console.log(JSON.stringify({ pass: true, version: SKIN_VERSION, test: "loopback-cdp-validation" }));
} else if (options.mode === "check-payload") {
  const payload = await loadPayload();
  if (/__DREAM_SKIN_[A-Z_]+__/.test(payload)) {
    throw new Error("Payload placeholders were not fully replaced");
  }
  console.log(JSON.stringify({ pass: true, version: SKIN_VERSION, payloadBytes: Buffer.byteLength(payload) }));
} else if (options.mode === "watch") await runWatch(options);
else await runOneShot(options);
