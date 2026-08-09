const [portText = "9335", browserId, expectedInitialTheme] = process.argv.slice(2);
const port = Number(portText);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9._-]{1,200}$/.test(browserId || "")) {
  throw new Error("Usage: node live-catalog-smoke.mjs <port> <browser-id>");
}

const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
const browserUrl = new URL(version.webSocketDebuggerUrl);
if (browserUrl.hostname !== "127.0.0.1" || Number(browserUrl.port) !== port ||
    browserUrl.pathname !== `/devtools/browser/${browserId}`) {
  throw new Error("CDP browser identity mismatch");
}
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === "page" && item.url?.startsWith("app://") &&
  new URL(item.webSocketDebuggerUrl).pathname === `/devtools/page/${item.id}`);
if (!target) throw new Error("No Codex page target found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const initialThemeId = await evaluate("window.__CODEX_DREAM_SKIN_STATE__?.themeId");
  if (expectedInitialTheme && initialThemeId !== expectedInitialTheme) {
    throw new Error(`External theme selection was not applied: ${initialThemeId}`);
  }
  const catalog = await evaluate(`(() => {
    document.querySelector('.ds2007-toolbar [data-action="skin-menu"], .ds2007-native-skin-nav')?.click();
    const menu = document.querySelector('.ds2007-skin-menu');
    return {
      count: window.__CODEX_ONE_CLICK_SKIN__?.themes?.length || 0,
      open: Boolean(menu && !menu.hidden),
      options: [...(menu?.querySelectorAll('[data-skin-theme]') || [])].map((node) => node.dataset.skinTheme),
    };
  })()`);
  if (!catalog.open || catalog.count < 6 || catalog.options.length !== catalog.count) {
    throw new Error(`Theme menu catalog failed: ${JSON.stringify(catalog)}`);
  }

  const clickedSakura = await evaluate(`(() => {
    const option = document.querySelector('[data-skin-theme="preset-sakura-dawn"]');
    option?.click();
    return Boolean(option);
  })()`);
  if (!clickedSakura) throw new Error("Sakura menu option was not clickable");
  await wait(700);
  const sakuraId = await evaluate("window.__CODEX_DREAM_SKIN_STATE__?.themeId");
  if (sakuraId !== "preset-sakura-dawn") throw new Error(`Theme did not switch to Sakura: ${sakuraId}`);

  const nativeView = await evaluate(`(() => {
    document.querySelector('.ds2007-toolbar [data-action="skin-menu"], .ds2007-native-skin-nav')?.click();
    document.querySelector('[data-skin-view="native"]')?.click();
    return document.documentElement.getAttribute('data-ds2007-view');
  })()`);
  if (nativeView !== "native") throw new Error(`Native view did not activate: ${nativeView}`);
  await wait(250);

  const restored = await evaluate(`(() => {
    document.querySelector('.ds2007-native-skin-nav')?.click();
    const option = document.querySelector('[data-skin-theme="preset-codex-1907-deep"]');
    option?.click();
    return Boolean(option);
  })()`);
  if (!restored) throw new Error("QQ2007 option was unavailable from native view");
  await wait(700);
  const finalState = await evaluate(`({
    themeId: window.__CODEX_DREAM_SKIN_STATE__?.themeId,
    view: document.documentElement.getAttribute('data-ds2007-view'),
    composer: Boolean(document.querySelector('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [class*="RichTextInput"]')),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  })`);
  if (finalState.themeId !== "preset-codex-1907-deep" || finalState.view !== "deep" ||
      !finalState.composer || finalState.overflowX) {
    throw new Error(`Final interactive state failed: ${JSON.stringify(finalState)}`);
  }
  console.log(JSON.stringify({ pass: true, initialThemeId, catalog, sakuraId, nativeView, finalState }, null, 2));
} finally {
  socket.close();
}
