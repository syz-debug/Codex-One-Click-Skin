const port = Number(process.argv[2] || 9335);
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((candidate) =>
  candidate.type === "page" && candidate.url?.startsWith("app://") && !candidate.url.includes("initialRoute="),
);
if (!target?.webSocketDebuggerUrl) throw new Error("No Codex renderer target found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("CDP connection failed")), { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const expression = `(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0) return null;
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  };
  const title = rect('.ds2007-titlebar');
  const toolbar = rect('.ds2007-toolbar');
  const root = rect('.ds2007-app-root');
  const status = rect('.ds2007-statusbar');
  const composer = rect('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [class*="RichTextInput"]');
  const nativeHeader = rect('header.pointer-events-none.fixed[class*="h-toolbar"]');
  const friends = rect('.ds2007-friends, .ds2007-friends-tab');
  const violations = [];
  for (const [name, box] of Object.entries({ title, toolbar, root, status, composer })) {
    if (!box) violations.push(name + ':missing');
  }
  if (friends) violations.push('friends:visible');
  if (title && toolbar && title.bottom > toolbar.top + 1) violations.push('title-toolbar:overlap');
  if (toolbar && root && toolbar.bottom > root.top + 1) violations.push('toolbar-root:overlap');
  if (root && status && root.bottom > status.top + 1) violations.push('root-status:overlap');
  if (composer && status && composer.bottom > status.top + 1) violations.push('composer-status:overlap');
  if (nativeHeader && toolbar && nativeHeader.top < toolbar.bottom - 1) violations.push('native-header-toolbar:overlap');
  for (const [name, box] of Object.entries({ title, toolbar, root, status, composer })) {
    if (box && (box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1)) {
      violations.push(name + ':out-of-bounds');
    }
  }
  return { viewport: { width: innerWidth, height: innerHeight }, title, toolbar, root, status, composer, nativeHeader, friends, violations };
})()`;

const sizes = [
  { width: 1282, height: 720 },
  { width: 960, height: 720 },
  { width: 720, height: 800 },
];
const results = [];
try {
  for (const size of sizes) {
    await command("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 1, mobile: false });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const evaluation = await command("Runtime.evaluate", { expression, returnByValue: true });
    results.push(evaluation.result.value);
  }
} finally {
  await command("Emulation.clearDeviceMetricsOverride").catch(() => {});
  socket.close();
}

const pass = results.every((result) => result.violations.length === 0);
console.log(JSON.stringify({ pass, results }, null, 2));
if (!pass) process.exitCode = 1;
