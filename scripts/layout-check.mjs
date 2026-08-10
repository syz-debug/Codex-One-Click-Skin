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
  const box = (node) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return null;
    return {
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height,
    };
  };
  const visible = (selector, scope = document) =>
    [...scope.querySelectorAll(selector)].map((node) => ({ node, box: box(node) })).filter((entry) => entry.box);
  const intersects = (a, b) => Boolean(a && b &&
    a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
  const edgeDelta = (a, b) => a && b ? Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right)) : null;

  const homeNode = document.querySelector('.dream-skin-home');
  const mainNode = document.querySelector('main.main-surface, main[class*="MainContentSurface"]');
  const threadScrollNode = document.querySelector('.thread-scroll-container');
  const threadContentNode = threadScrollNode?.querySelector('[data-mcp-app-portal-target="true"]') || null;
  const sidebarResizeHandleNode = document.querySelector(
    'aside.app-shell-left-panel > [class*="cursor-col-resize"]:has(> .sidebar-resize-handle-line)',
  );
  const rightResizeHandleNode = [...document.querySelectorAll(
    'main [role="separator"][class*="cursor-col-resize"]:has(> .sidebar-resize-handle-line)',
  )].find((node) => !node.closest('aside.app-shell-left-panel')) || null;
  const composerNode = visible('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [class*="RichTextInput"]')
    .map((entry) => entry.node).find((node) => node.matches('.composer-surface-chrome, [class*="ComposerLayoutRoot"]')) || null;
  const utilityNode = homeNode?.querySelector(
    '[data-composer-home-utility-bar-position="above"][data-composer-placement="home"], .dream-skin-home-utility',
  ) || null;
  const suggestionsNode = homeNode?.querySelector('.group\\\\/home-suggestions') || null;
  const cardEntries = suggestionsNode ? visible('button', suggestionsNode) : [];
  const attachmentEntries = composerNode ? visible('.composer-attachment-surface[role="button"]', composerNode) : [];
  const messageNavigationEntries = visible('[data-thread-user-message-navigation-item-id]');
  const messageNavigationNode = messageNavigationEntries[0]?.node.closest('nav') || null;
  const globalToolbarButtonEntries = visible(
    '#codex-dream-skin-chrome .ds2007-toolbar > button:not(.ds2007-open-location-proxy)',
  );
  const activityToggleNode = document.querySelector(
    'aside.app-shell-left-panel:not(.ds2007-sidebar-peek) button[aria-pressed="true"]',
  );
  const activityRowEntries = activityToggleNode
    ? visible('aside.app-shell-left-panel:not(.ds2007-sidebar-peek) [data-app-action-sidebar-thread-row]')
    : [];
  const sidebarModeButtonNode = [...document.querySelectorAll(
    'aside.app-shell-left-panel:not(.ds2007-sidebar-peek) button',
  )].find((node) => node.textContent.trim() === 'Codex') || null;
  const nativeTabNodes = [...document.querySelectorAll('[role="tab"]')]
    .filter((node) => !node.closest('#codex-dream-skin-chrome'));
  const nativeTabNode = nativeTabNodes.find((node) => node.getAttribute('aria-selected') === 'true') ||
    nativeTabNodes[0] || null;
  const nativeTabToolbarNode = nativeTabNode?.closest('.h-toolbar') || null;
  const nativeTabScrollerNode = nativeTabToolbarNode?.querySelector(':scope > div:has([role="tablist"])') || null;
  const nativeCollapseButtonNode = nativeTabNode
    ? document.querySelector('[data-ds2007-native-sidebar-toggle="true"]') || document.querySelector(
      'main > header.pointer-events-none.fixed[class*="h-toolbar"] > div:last-child button:last-of-type',
    )
    : null;
  const nativeTabShellNode = nativeTabNode?.closest('.group\\\\/tab') || nativeTabNode?.parentElement || null;
  const nativeTabActionNodes = nativeTabToolbarNode
    ? [...nativeTabToolbarNode.querySelectorAll('button:not([role="tab"])')]
      .filter((button) => !button.hasAttribute('data-app-shell-tab-close-button'))
    : [];
  const nativeImageCompactToolbarNode = nativeTabNode
    ? document.querySelector(
      'main aside:not(.app-shell-left-panel):has([role="tab"]) div[class*="bg-token-editor-background/95"]:has(> button)',
    )
    : null;
  const nativeImageOpenToolbarNode = nativeTabNode
    ? document.querySelector(
      'main aside:not(.app-shell-left-panel):has([role="tab"]) .absolute.top-2.right-2 ' +
      'div.inline-flex:has(button[aria-label="打开选项菜单"], button[aria-label="Open options menu"])',
    )
    : null;
  const nativeImageZoomButtonNode = nativeTabNode
    ? document.querySelector(
      'main aside:not(.app-shell-left-panel):has([role="tab"]) ' +
      '.absolute.top-2.right-2:has(> button) > button',
    )
    : null;

  const title = box(document.querySelector('.ds2007-titlebar'));
  const toolbar = box(document.querySelector('.ds2007-toolbar'));
  const root = box(document.querySelector('.ds2007-app-root'));
  const status = box(document.querySelector('.ds2007-statusbar'));
  const sidebar = box(document.querySelector('aside.app-shell-left-panel'));
  const main = box(mainNode);
  const mainStyle = mainNode ? getComputedStyle(mainNode) : null;
  const home = box(homeNode);
  const suggestions = box(suggestionsNode);
  const cards = cardEntries.map((entry) => ({
    ...entry.box,
    text: entry.node.innerText.trim(),
    clipped: entry.node.scrollHeight > entry.node.clientHeight + 1 || entry.node.scrollWidth > entry.node.clientWidth + 1,
  }));
  const composer = box(composerNode);
  const utility = box(utilityNode);
  const nativeHeader = box(document.querySelector('header.pointer-events-none.fixed[class*="h-toolbar"]'));
  const nativeHeaderContextNode = document.querySelector(
    'header.pointer-events-none.fixed[class*="h-toolbar"] > div[class*="flex-1"]',
  );
  const nativeHeaderContext = box(nativeHeaderContextNode);
  const nativeHeaderSlotNodes = [...document.querySelectorAll('[data-test-id="header-shell-slot"]')];
  const nativeHeaderSlots = nativeHeaderSlotNodes.map((node) => box(node)).filter(Boolean);
  const friends = box(document.querySelector('.ds2007-friends, .ds2007-friends-tab'));
  const attachments = attachmentEntries.map((entry) => entry.box);
  const threadScroll = box(threadScrollNode);
  const threadContent = box(threadContentNode);
  const sidebarResizeHandle = box(sidebarResizeHandleNode);
  const rightResizeHandle = box(rightResizeHandleNode);
  const messageNavigation = box(messageNavigationNode);
  const messageNavigationButtons = messageNavigationEntries.map((entry) => entry.box);
  const globalToolbarButtons = globalToolbarButtonEntries.map((entry) => entry.box);
  const activityRows = activityRowEntries.map((entry) => ({
    ...entry.box,
    clipped: entry.node.scrollHeight > entry.node.clientHeight + 1,
  }));
  const nativeTab = box(nativeTabNode);
  const nativeTabToolbar = box(nativeTabToolbarNode);
  const nativeCollapseButton = box(nativeCollapseButtonNode);
  const nativeTabShell = box(nativeTabShellNode);
  const nativeTabActions = nativeTabActionNodes.map((node) => box(node)).filter(Boolean);
  const nativeImageCompactToolbar = box(nativeImageCompactToolbarNode);
  const nativeImageOpenToolbar = box(nativeImageOpenToolbarNode);
  const nativeImageZoomButton = box(nativeImageZoomButtonNode);
  const nativeTabMainChild = nativeTabNode && mainNode
    ? [...mainNode.children].find((node) => node.contains(nativeTabNode)) || null
    : null;
  const nativeTabPaintNodes = nativeTabNode && mainNode ? [
    document.querySelector(
      '.ds2007-app-root > div:has(main:is(.main-surface, [class*="MainContentSurface"]) [role="tab"])',
    ),
    document.querySelector(
      '.ds2007-app-root > div:has(main:is(.main-surface, [class*="MainContentSurface"]) [role="tab"]) ' +
      '> div:has(> main:is(.main-surface, [class*="MainContentSurface"]))',
    ),
    mainNode,
    nativeTabMainChild,
  ].filter(Boolean) : [];
  const violations = [];
  const skinMode = document.documentElement.getAttribute('data-dream-skin-mode') || 'classic';

  if (skinMode === 'qq2007') {
    for (const [name, value] of Object.entries({ title, toolbar, root, status })) {
      if (!value) violations.push(name + ':missing');
    }
    if (globalToolbarButtons.length !== 5) violations.push('global-toolbar:visible-count-' + globalToolbarButtons.length);
    globalToolbarButtons.forEach((button, index) => {
      if (Math.abs(button.width - 78) > 1) violations.push('global-toolbar-button-' + index + ':width-mismatch');
      if (index > 0 && Math.abs(button.left - globalToolbarButtons[index - 1].right - 1) > 1) {
        violations.push('global-toolbar-button-' + index + ':position-shift');
      }
    });
    if (sidebarModeButtonNode) {
      const modeStyle = getComputedStyle(sidebarModeButtonNode);
      const modeAfter = getComputedStyle(sidebarModeButtonNode, '::after');
      if (modeAfter.content !== 'none' && modeAfter.content !== 'normal' && modeAfter.content !== '""') {
        violations.push('sidebar-mode:decorative-dot-visible');
      }
      const modeRadius = parseFloat(modeStyle.borderTopLeftRadius);
      if (modeRadius < 10 || modeRadius > 14) violations.push('sidebar-mode:hover-shape-mismatch');
    }
  }
  if (!composer) violations.push('composer:missing');
  if (friends) violations.push('friends:visible');
  if (title && toolbar && title.bottom > toolbar.top + 1) violations.push('title-toolbar:overlap');
  if (toolbar && root && toolbar.bottom > root.top + 1) violations.push('toolbar-root:overlap');
  if (root && status && root.bottom > status.top + 1) violations.push('root-status:overlap');
  if (composer && status && composer.bottom > status.top + 1) violations.push('composer-status:overlap');
  if (nativeHeader && toolbar && nativeHeader.top < toolbar.bottom - 1) violations.push('native-header-toolbar:overlap');
  if (skinMode === 'qq2007' && nativeHeader && main) {
    if (Math.abs(nativeHeader.left - main.left) > 1) violations.push('native-header-main:left-mismatch');
    if (Math.abs(nativeHeader.top - main.top) > 1) violations.push('native-header-main:top-mismatch');
    const edgeSlotsAligned = sidebar
      ? nativeHeaderSlots.length === 1 && Math.abs(nativeHeaderSlots[0].right - main.right) <= 1
      : nativeHeaderSlots.length === 2 &&
        Math.abs(nativeHeaderSlots[0].left - main.left) <= 1 &&
        Math.abs(nativeHeaderSlots[1].right - main.right) <= 1;
    if (!edgeSlotsAligned) {
      violations.push('native-header:edge-slots-misaligned');
    }
    const nativeToolbarStyle = nativeTabToolbarNode ? getComputedStyle(nativeTabToolbarNode) : null;
    if (nativeHeaderSlotNodes.some((node) => {
      if (getComputedStyle(node).backgroundImage !== 'none') return false;
      const transparentForNativeTabs = node.querySelector('[data-ds2007-native-sidebar-toggle="true"]') &&
        nativeToolbarStyle?.backgroundImage !== 'none';
      return !transparentForNativeTabs;
    })) {
      violations.push('native-header:edge-slots-unthemed');
    }
    if (parseFloat(mainStyle?.borderTopLeftRadius || '0') > 1) violations.push('main:rounded-top-left-corner');
  }

  if (skinMode === 'qq2007' && nativeTabNode) {
    if (!nativeTab) violations.push('native-tab:missing');
    if (nativeTab && (nativeTab.left < main.left - 1 || nativeTab.right > main.right + 1 ||
        nativeTab.top < main.top - 1 || nativeTab.bottom > main.bottom + 1)) {
      violations.push('native-tab:out-of-main');
    }
    nativeTabPaintNodes.forEach((node, index) => {
      const style = getComputedStyle(node);
      if (style.isolation !== 'auto' || style.contain !== 'none') {
        violations.push('native-tab-paint-shell-' + index + ':clipped');
      }
    });
    const nativeTabHit = nativeTab && document.elementFromPoint(
      nativeTab.left + nativeTab.width / 2,
      nativeTab.top + nativeTab.height / 2,
    );
    if (!nativeTabHit || !nativeTabNode.contains(nativeTabHit)) violations.push('native-tab:not-clickable');
    if (!nativeTabToolbarNode.hasAttribute('data-ds2007-native-tab-toolbar')) {
      violations.push('native-tab-toolbar:not-synchronized');
    }
    if (nativeTabToolbar && nativeHeader && nativeTabToolbar.top < nativeHeader.top - 1) {
      violations.push('native-tab-toolbar:above-header');
    }

    if (!nativeTabToolbar || !nativeCollapseButton) {
      violations.push('native-collapse:missing');
    } else {
      if (nativeCollapseButton.left < nativeTabToolbar.left - 1 ||
          nativeCollapseButton.right > nativeTabToolbar.right + 1 ||
          nativeCollapseButton.top < nativeTabToolbar.top - 1 ||
          nativeCollapseButton.bottom > nativeTabToolbar.bottom + 1 ||
          nativeCollapseButton.right > innerWidth + 1) {
        violations.push('native-collapse:out-of-toolbar');
      }
      const collapseHit = document.elementFromPoint(
        nativeCollapseButton.left + nativeCollapseButton.width / 2,
        nativeCollapseButton.top + nativeCollapseButton.height / 2,
      );
      if (!collapseHit || !nativeCollapseButtonNode.contains(collapseHit)) {
        violations.push('native-collapse:not-clickable');
      }
      if (!nativeCollapseButtonNode.hasAttribute('data-ds2007-native-sidebar-toggle')) {
        violations.push('native-collapse:not-synchronized');
      }
      if (nativeTabActions.length < 2) violations.push('native-tab-actions:missing');
      nativeTabActionNodes.forEach((node, index) => {
        const action = box(node);
        if (!action) return;
        const hit = document.elementFromPoint(action.left + action.width / 2, action.top + action.height / 2);
        if (!hit || !node.contains(hit)) violations.push('native-tab-action-' + index + ':not-clickable');
      });
      const stickyAction = nativeTabActions[0] || null;
      if (nativeTabShell && stickyAction && nativeTabShell.right > stickyAction.left + 1) {
        violations.push('native-tab:selected-under-action');
      }
      const scrollerStyle = nativeTabScrollerNode ? getComputedStyle(nativeTabScrollerNode) : null;
      if (!scrollerStyle || scrollerStyle.overflowX !== 'auto' || scrollerStyle.minWidth !== '0px') {
        violations.push('native-tab-scroller:not-bounded');
      }
      const tabToolbarStyle = getComputedStyle(nativeTabToolbarNode);
      const tabShellStyle = nativeTabShellNode ? getComputedStyle(nativeTabShellNode) : null;
      const collapseStyle = getComputedStyle(nativeCollapseButtonNode);
      if (tabToolbarStyle.backgroundImage === 'none' || parseFloat(tabToolbarStyle.borderBottomWidth) < 0.5) {
        violations.push('native-tab-toolbar:not-themed');
      }
      if (!tabShellStyle || parseFloat(tabShellStyle.borderTopLeftRadius) > 2.1 ||
          (nativeTabNode.getAttribute('aria-selected') === 'true' && tabShellStyle.backgroundImage === 'none')) {
        violations.push('native-tab:not-themed');
      }
      const collapseRadius = parseFloat(collapseStyle.borderTopLeftRadius);
      const collapseActive = nativeCollapseButtonNode.getAttribute('aria-pressed') === 'true';
      if (collapseRadius < 10 || collapseRadius > 14 ||
          (collapseActive && collapseStyle.backgroundColor === 'rgba(0, 0, 0, 0)')) {
        violations.push('native-collapse:not-themed');
      }
      for (const [name, node] of [
        ['native-image-compact-toolbar', nativeImageCompactToolbarNode],
        ['native-image-open-toolbar', nativeImageOpenToolbarNode],
        ['native-image-zoom-button', nativeImageZoomButtonNode],
      ]) {
        if (!box(node)) continue;
        const style = getComputedStyle(node);
        const radius = parseFloat(style.borderTopLeftRadius);
        if (radius < 3 || radius > 5 || style.backgroundImage === 'none' ||
            parseFloat(style.borderTopWidth) < 0.5) violations.push(name + ':not-themed');
      }
      const imageToolBoxes = [nativeImageCompactToolbar, nativeImageZoomButton, nativeImageOpenToolbar]
        .filter(Boolean);
      if (imageToolBoxes.length > 1 && imageToolBoxes.some((entry) =>
        Math.abs(entry.top - imageToolBoxes[0].top) > 1 ||
        Math.abs(entry.bottom - imageToolBoxes[0].bottom) > 1 ||
        Math.abs(entry.height - 28) > 1)) {
        violations.push('native-image-toolbar:vertical-mismatch');
      }
    }
  }

  for (const [name, value] of Object.entries({ title, toolbar, root, status, composer, utility, suggestions })) {
    if (value && (value.left < -1 || value.right > innerWidth + 1 || value.top < -1 || value.bottom > innerHeight + 1)) {
      violations.push(name + ':out-of-bounds');
    }
  }

  if (home) {
    if (!suggestions) violations.push('home-suggestions:missing');
    if (cards.length < 1 || cards.length > 4) violations.push('home-cards:visible-' + cards.length);
    if (innerWidth >= 960 && cards.length < 2) violations.push('home-cards:wide-visible-' + cards.length);
    cards.forEach((card, index) => {
      if (!card.text) violations.push('home-card-' + index + ':empty-label');
      if (card.clipped) violations.push('home-card-' + index + ':content-clipped');
      if (card.left < home.left - 1 || card.right > home.right + 1) violations.push('home-card-' + index + ':horizontal-overflow');
      if (intersects(card, utility) || intersects(card, composer)) violations.push('home-card-' + index + ':composer-overlap');
    });
    if (!utility) violations.push('home-utility:missing');
    if (suggestions && suggestions.width > 738) violations.push('home-suggestions:too-wide');
    const suggestionDelta = edgeDelta(suggestions, composer);
    if (suggestionDelta !== null && suggestionDelta > 1) {
      violations.push('home-suggestions-composer:edge-mismatch');
    }
    if (attachments.length && suggestions) {
      cards.forEach((card, index) => {
        if (Math.abs(card.left - suggestions.left) > 1 || Math.abs(card.right - suggestions.right) > 1) {
          violations.push('home-attachment-card-' + index + ':edge-mismatch');
        }
        if (card.height < 26 || card.height > 44) {
          violations.push('home-attachment-card-' + index + ':unexpected-height');
        }
        if (index > 0 && card.top < cards[index - 1].bottom - 1) {
          violations.push('home-attachment-card-' + index + ':row-overlap');
        }
      });
    }
    const delta = edgeDelta(utility, composer);
    if (delta !== null && delta > 1) violations.push('home-utility-composer:edge-mismatch');
    if (utility && composer && Math.abs(utility.bottom - composer.top) > 1) violations.push('home-utility-composer:vertical-gap');
  } else if (composer && main) {
    const taskContent = nativeTab && threadScroll ? threadScroll : main;
    const allowedWidth = Math.min(760, Math.max(0, taskContent.width - 32));
    if (composer.width > allowedWidth + 2) violations.push('task-composer:too-wide');
    const mainCenter = (taskContent.left + taskContent.right) / 2;
    const composerCenter = (composer.left + composer.right) / 2;
    if (Math.abs(mainCenter - composerCenter) > 2) violations.push('task-composer:not-centered');
  }

  if (!home && skinMode === 'qq2007' && threadScroll && threadContent) {
    const threadContentOffset = threadContent.left - threadScroll.left;
    if (threadContentOffset < 48) violations.push('thread-content:navigation-gutter-too-small');
  }

  if (skinMode === 'qq2007' && activityToggleNode) {
    activityRows.forEach((row, index) => {
      if (row.height < 50) violations.push('activity-row-' + index + ':too-short');
      if (row.clipped) violations.push('activity-row-' + index + ':content-clipped');
      if (index > 0 && row.top < activityRows[index - 1].bottom - 1) {
        violations.push('activity-row-' + index + ':overlap');
      }
    });
  }

  if (skinMode === 'qq2007' && sidebarResizeHandleNode) {
    const resizeStyle = getComputedStyle(sidebarResizeHandleNode);
    if (resizeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' || resizeStyle.backgroundImage !== 'none') {
      violations.push('sidebar-resize-handle:opaque');
    }
  }

  if (skinMode === 'qq2007' && rightResizeHandleNode) {
    const resizeStyle = getComputedStyle(rightResizeHandleNode);
    if (resizeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' || resizeStyle.backgroundImage !== 'none') {
      violations.push('right-resize-handle:opaque');
    }
    if (!rightResizeHandle || rightResizeHandle.width > 16.5 ||
        resizeStyle.pointerEvents === 'none' || resizeStyle.cursor !== 'col-resize') {
      violations.push('right-resize-handle:not-interactive');
    }
  }

  if (!home && composerNode) {
    const stickyComposerNode = composerNode.closest('.sticky');
    const stickyStyle = stickyComposerNode ? getComputedStyle(stickyComposerNode) : null;
    const composerStyle = getComputedStyle(composerNode);
    if (!stickyStyle || stickyStyle.bottom !== '0px' || stickyStyle.overflowAnchor !== 'none' ||
        stickyStyle.transform !== 'none' || stickyStyle.transitionDuration !== '0s' ||
        composerStyle.transform !== 'none' || composerStyle.transitionDuration !== '0s') {
      violations.push('task-composer:unstable-anchor');
    }
  }

  if (!home && messageNavigation) {
    if (!main) {
      violations.push('message-navigation:main-missing');
    } else {
      if (messageNavigation.left < main.left + 20 || messageNavigation.right > main.right - 1) {
        violations.push('message-navigation:outside-main-safe-area');
      }
      if (friends && intersects(messageNavigation, friends)) {
        violations.push('message-navigation:friends-overlap');
      }
    }
    if (sidebar && messageNavigation.left <= sidebar.right + 8) {
      violations.push('message-navigation:sidebar-overlap');
    }
    const hitEntry = messageNavigationEntries[Math.floor(messageNavigationEntries.length / 2)];
    if (hitEntry) {
      const hit = document.elementFromPoint(
        hitEntry.box.left + hitEntry.box.width / 2,
        hitEntry.box.top + hitEntry.box.height / 2,
      );
      if (!hit || !hitEntry.node.contains(hit)) violations.push('message-navigation:not-clickable');
    }
  }

  attachments.forEach((attachment, index) => {
    if (!composer || attachment.left < composer.left - 1 || attachment.right > composer.right + 1 ||
        attachment.top < composer.top - 1 || attachment.bottom > composer.bottom + 1) {
      violations.push('attachment-' + index + ':out-of-composer');
    }
  });
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
    violations.push('document:horizontal-overflow');
  }

  return {
    route: home ? 'home' : 'task', skinMode,
    viewport: { width: innerWidth, height: innerHeight },
    title, toolbar, root, status, sidebar, main, home, suggestions, cards, utility, composer,
    attachments, nativeHeader, nativeHeaderContext, nativeHeaderSlots,
    nativeTab, nativeTabToolbar, nativeCollapseButton, nativeTabShell,
    nativeImageCompactToolbar, nativeImageOpenToolbar, nativeImageZoomButton, friends,
    threadScroll, threadContent, sidebarResizeHandle, rightResizeHandle,
    messageNavigation, messageNavigationButtons, globalToolbarButtons,
    activityView: Boolean(activityToggleNode), activityRows, violations,
  };
})()`;

const sizes = [
  { width: 1438, height: 600 },
  { width: 1282, height: 720 },
  { width: 960, height: 720 },
  { width: 720, height: 800 },
];
const results = [];
const evaluateLayout = async () => {
  const evaluation = await command("Runtime.evaluate", { expression, returnByValue: true });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text || "Layout evaluation failed");
  return evaluation.result.value;
};
try {
  for (const size of sizes) {
    await command("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 1, mobile: false });
    await new Promise((resolve) => setTimeout(resolve, 700));
    let result = await evaluateLayout();
    if (result.violations.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await evaluateLayout();
    }
    results.push(result);
  }

  const narrowResult = results.at(-1);
  if (narrowResult?.skinMode === "qq2007" && !narrowResult.sidebar) {
    const triggerEvaluation = await command("Runtime.evaluate", {
      expression: `(() => {
        const node = document.querySelector('button[data-app-shell-sidebar-trigger="true"]');
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true,
    });
    const trigger = triggerEvaluation.result.value;
    const peekViolations = [];
    if (!trigger) {
      peekViolations.push("sidebar-peek:trigger-missing");
    } else {
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 500, y: 400, buttons: 0 });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await command("Input.dispatchMouseEvent", {
        type: "mouseMoved", x: trigger.x, y: trigger.y, buttons: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 450));
      const peekEvaluation = await command("Runtime.evaluate", {
        expression: `(() => {
          const box = (node) => {
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
              width: rect.width, height: rect.height };
          };
          const aside = document.querySelector('aside[data-testid="app-shell-floating-left-panel"]');
          const host = aside?.parentElement || null;
          const nativeHeader = document.querySelector('[data-pip-obstacle="app-shell-header"]');
          const status = document.querySelector('.ds2007-statusbar');
          const trigger = document.querySelector('button[data-app-shell-sidebar-trigger="true"]');
          const triggerBox = box(trigger);
          const hit = triggerBox && document.elementFromPoint(
            triggerBox.left + triggerBox.width / 2,
            triggerBox.top + triggerBox.height / 2,
          );
          return {
            aside: box(aside), host: box(host), nativeHeader: box(nativeHeader), status: box(status),
            markedAside: Boolean(aside?.classList.contains('ds2007-sidebar-peek')),
            markedHost: host?.dataset.ds2007SidebarPeekHost === 'true',
            themed: Boolean(aside && getComputedStyle(aside).backgroundImage !== 'none'),
            headerHeight: aside?.firstElementChild?.getBoundingClientRect().height || null,
            triggerClickable: Boolean(trigger && hit && trigger.contains(hit)),
          };
        })()`,
        returnByValue: true,
      });
      const peek = peekEvaluation.result.value;
      if (!peek?.aside || !peek.host) peekViolations.push("sidebar-peek:missing");
      if (peek?.aside && (!peek.markedAside || !peek.markedHost || !peek.themed)) {
        peekViolations.push("sidebar-peek:not-themed");
      }
      if (peek?.aside && peek.nativeHeader && peek.aside.top < peek.nativeHeader.bottom - 1) {
        peekViolations.push("sidebar-peek:header-overlap");
      }
      if (peek?.aside && peek.status && peek.aside.bottom > peek.status.top + 1) {
        peekViolations.push("sidebar-peek:status-overlap");
      }
      if (peek?.headerHeight !== null && Math.abs(peek.headerHeight - 46) > 1) {
        peekViolations.push("sidebar-peek:header-stretched");
      }
      if (peek?.aside && !peek.triggerClickable) peekViolations.push("sidebar-peek:trigger-obscured");
      results.push({ route: "sidebar-peek", skinMode: "qq2007", ...peek, violations: peekViolations });
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 500, y: 400, buttons: 0 });
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const closedEvaluation = await command("Runtime.evaluate", {
        expression: `!document.querySelector('aside[data-testid="app-shell-floating-left-panel"]')`,
        returnByValue: true,
      });
      if (!closedEvaluation.result.value) peekViolations.push("sidebar-peek:not-dismissed");
    }
    if (!results.some((result) => result.route === "sidebar-peek")) {
      results.push({ route: "sidebar-peek", skinMode: "qq2007", violations: peekViolations });
    }
  }

  if (narrowResult?.skinMode === "qq2007") {
    const readToolbarToggleState = async () => {
      const evaluation = await command("Runtime.evaluate", {
        expression: `(() => {
          const box = (node) => {
            const rect = node.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          };
          const trigger = document.querySelector('button[data-app-shell-sidebar-trigger="true"]');
          return {
            sidebarVisible: document.documentElement.dataset.ds2007SidebarVisible === 'true',
            triggerPresent: Boolean(trigger),
            buttons: [...document.querySelectorAll(
              '#codex-dream-skin-chrome .ds2007-toolbar > button:not(.ds2007-open-location-proxy)',
            )].filter((node) => {
              const style = getComputedStyle(node);
              return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
            }).map(box),
          };
        })()`,
        returnByValue: true,
      });
      return evaluation.result.value;
    };
    const beforeToggle = await readToolbarToggleState();
    const toggleViolations = [];
    if (!beforeToggle.triggerPresent) {
      toggleViolations.push("sidebar-toggle:trigger-missing");
    } else {
      await command("Runtime.evaluate", {
        expression: `document.querySelector('button[data-app-shell-sidebar-trigger="true"]')?.click()`,
        returnByValue: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const afterToggle = await readToolbarToggleState();
      if (afterToggle.sidebarVisible === beforeToggle.sidebarVisible) {
        toggleViolations.push("sidebar-toggle:state-unchanged");
      }
      if (beforeToggle.buttons.length !== 5 || afterToggle.buttons.length !== 5) {
        toggleViolations.push("sidebar-toggle:toolbar-button-count-changed");
      }
      beforeToggle.buttons.forEach((button, index) => {
        const after = afterToggle.buttons[index];
        if (!after || Math.max(
          Math.abs(button.left - after.left), Math.abs(button.top - after.top),
          Math.abs(button.width - after.width), Math.abs(button.height - after.height),
        ) > 1) toggleViolations.push("sidebar-toggle:toolbar-button-" + index + "-shifted");
      });
      await command("Runtime.evaluate", {
        expression: `document.querySelector('button[data-app-shell-sidebar-trigger="true"]')?.click()`,
        returnByValue: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    results.push({
      route: "sidebar-toggle", skinMode: "qq2007",
      before: beforeToggle, violations: toggleViolations,
    });
  }
} finally {
  await command("Emulation.clearDeviceMetricsOverride").catch(() => {});
  socket.close();
}

const pass = results.every((result) => result.violations.length === 0);
console.log(JSON.stringify({ pass, results }, null, 2));
if (!pass) process.exitCode = 1;
