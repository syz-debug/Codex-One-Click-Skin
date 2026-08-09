import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(windowsRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(windowsRoot, "assets", "dream-skin.css"), "utf8");

assert.doesNotMatch(template, /dataset\.qq2007Composer(?:Region|Control)\s*=/,
  "renderer must not remap native composer branches");
assert.doesNotMatch(css, /\[data-qq2007-composer-region="footer"\]/,
  "CSS must not replace the native composer footer layout");
assert.doesNotMatch(css, /button\[aria-label="(?:添加文件等内容|Add files and more)"\]::after/,
  "CSS must not replace the native attachment button with a fake label");
assert.match(css, /\[class\*="ComposerLayoutAttachments"\]/,
  "QQ2007 composer styling must retain the native attachment tray");
for (const variable of [
  "--codex-base-surface",
  "--color-token-dropdown-background",
  "--color-token-menu-background",
  "--color-token-main-surface-primary",
  "--color-token-editor-background",
  "--vscode-menu-background",
  "--vscode-editor-background",
]) {
  assert.match(css, new RegExp(`${variable}:\\s*(?:#ffffff|rgba\\(255, 255, 255)`),
    `QQ2007 portal palette must override ${variable}`);
}
assert.doesNotMatch(template, /三段式输入框/,
  "skin menu must describe the native interactive composer");
assert.match(template, /data-nav="新对话"/,
  "QQ2007 toolbar must proxy the native New conversation action");
assert.doesNotMatch(template, /data-nav="(?:新建任务|站点|聊天)"/,
  "QQ2007 toolbar must not expose unsupported or obsolete navigation actions");
for (const label of ["新对话", "拉取请求", "已安排", "插件"]) {
  assert.match(template, new RegExp(`data-nav="${label}"`),
    `QQ2007 toolbar must expose the native ${label} action`);
}
const toolbarOrder = ["新对话", "拉取请求", "已安排", "插件"]
  .map((label) => template.indexOf(`data-nav="${label}"`));
assert.deepEqual(toolbarOrder, [...toolbarOrder].sort((a, b) => a - b),
  "QQ2007 toolbar actions must follow the native navigation order");
const payload = template
  .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(".fixture { color: blue; }"))
  .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
  .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify({
    schemaVersion: 1,
    id: "fixture",
    appearance: "light",
    colors: {},
  }))
  .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
  .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify("fixture-revision"));

function createFixture({ shellPresent, staleSkin = false }) {
  const nodes = new Map();
  const rootClasses = new Set(staleSkin ? ["codex-dream-skin"] : []);
  const rootStyles = new Map(staleSkin ? [["--dream-skin-art", "url(\"blob:stale\")"]] : []);
  const rootAttributes = new Map();
  const revokedUrls = [];
  let hasShell = shellPresent;

  const makeClassList = (classes = new Set()) => ({
    add(value) { classes.add(value); },
    remove(value) { classes.delete(value); },
    contains(value) { return classes.has(value); },
    toggle(value, enabled) {
      if (enabled) classes.add(value);
      else classes.delete(value);
    },
  });

  const root = {
    className: "",
    classList: makeClassList(rootClasses),
    style: {
      setProperty(key, value) { rootStyles.set(key, value); },
      removeProperty(key) { rootStyles.delete(key); },
      getPropertyValue(key) { return rootStyles.get(key) ?? ""; },
    },
    getAttribute(name) { return rootAttributes.get(name) ?? null; },
    setAttribute(name, value) { rootAttributes.set(name, String(value)); },
    removeAttribute(name) { rootAttributes.delete(name); },
    appendChild(node) {
      node.parentElement = root;
      nodes.set(node.id, node);
    },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      nodes.set(node.id, node);
    },
  };
  const shellMain = {
    classList: makeClassList(),
    closest() { return null; },
    getBoundingClientRect() {
      return { left: 290, top: 36, width: 990, height: 784 };
    },
  };
  const staleHome = { classList: makeClassList(new Set(["dream-home"])) };
  const staleShell = { classList: makeClassList(new Set(["dream-home-shell"])) };

  const createElement = () => {
    const attributes = new Map();
    return ({
    id: "",
    dataset: {},
    style: {
      setProperty() {},
      removeProperty() {},
      getPropertyValue() { return ""; },
    },
    classList: makeClassList(),
    parentElement: null,
    textContent: "",
    innerHTML: "",
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() { nodes.delete(this.id); },
  });
  };
  if (staleSkin) {
    const style = createElement();
    style.id = "codex-dream-skin-style";
    nodes.set(style.id, style);
    const chrome = createElement();
    chrome.id = "codex-dream-skin-chrome";
    nodes.set(chrome.id, chrome);
  }

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface") return hasShell ? shellMain : null;
      if (selector === "aside.app-shell-left-panel") return hasShell ? {} : null;
      return null;
    },
    querySelectorAll(selector) {
      if (!staleSkin) return [];
      if (selector === ".dream-home") return [staleHome];
      if (selector === ".dream-home-shell") return [staleShell];
      return [];
    },
  };
  const context = {
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
      },
      matchMedia() {
        return { matches: false, addEventListener() {}, removeEventListener() {} };
      },
    },
    document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    URL: {
      createObjectURL() { return "blob:fixture"; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {},
  };

  return {
    context,
    nodes,
    rootClasses,
    rootStyles,
    revokedUrls,
    setShellPresent(value) { hasShell = value; },
  };
}

const main = createFixture({ shellPresent: true });
const mainResult = vm.runInNewContext(payload, main.context);
assert.equal(mainResult.installed, true);
assert.equal(main.rootClasses.has("codex-dream-skin"), true);
assert.equal(main.rootStyles.get("--dream-skin-art"), 'url("blob:fixture")');
assert.equal(main.nodes.has("codex-dream-skin-style"), true);
assert.equal(main.nodes.has("codex-dream-skin-chrome"), true);
assert.equal(main.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(main.rootClasses.has("codex-dream-skin"), false);
assert.equal(main.nodes.has("codex-dream-skin-style"), false);
assert.equal(main.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(main.revokedUrls, ["blob:fixture"]);

const auxiliary = createFixture({ shellPresent: false, staleSkin: true });
const auxiliaryResult = vm.runInNewContext(payload, auxiliary.context);
assert.equal(auxiliaryResult.installed, true);
assert.equal(auxiliary.rootClasses.has("codex-dream-skin"), true);
assert.equal(auxiliary.rootStyles.has("--dream-skin-art"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-style"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-chrome"), true);

auxiliary.setShellPresent(true);
auxiliary.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(auxiliary.rootClasses.has("codex-dream-skin"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-style"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-chrome"), true);

console.log("PASS: renderer installs, cleans up, and survives late shell availability.");
