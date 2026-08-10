((cssText, artDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const SHELL_ATTR = "data-dream-shell";
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready",
    "data-dream-skin-mode",
    "data-ds1907-status",
    "data-ds2007-friends",
    "data-ds2007-native-right",
    "data-ds2007-native-right-label",
    "data-ds2007-native-right-layout",
    "data-ds2007-view",
    "data-ds2007-open-location-pending",
  ];
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __DREAM_SKIN_STYLE_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const PROFILE = THEME.profile && typeof THEME.profile === "object" ? THEME.profile : {};
  const THEME_CATALOG = Array.isArray(THEME.catalog)
    ? THEME.catalog.filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
    : [{ id: THEME.id || "custom", name: THEME.name || "当前皮肤" }];
  const DECORATION_DATA = THEME.decorationData && typeof THEME.decorationData === "object"
    ? THEME.decorationData : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_DREAM_SKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--ds-bg-rgb", "--ds-panel-rgb", "--ds-panel-2-rgb", "--ds-accent-rgb",
    "--ds-accent-alt-rgb", "--ds-secondary-rgb", "--ds-highlight-rgb",
    "--ds-text-rgb", "--ds-muted-rgb", "--ds-line-rgb",
    "--dream-art-focus-x", "--dream-art-focus-y", "--dream-art-position",
    "--dream-skin-focus-x", "--dream-skin-focus-y", "--dream-skin-art-position",
    "--dream-skin-name", "--dream-skin-tagline", "--dream-skin-project-prefix",
    "--dream-skin-project-label",
    "--ds1907-assistant-avatar",
    "--ds1907-sidebar-width",
  ];
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  let analysisTimer = null;
  let samplingNativeShell = false;
  let rootObserver = null;
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    textWrites: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  previous?.cancelFrameLayout?.();
  previous?.cancelNativeTabLayout?.();
  previous?.cancelOpenLocationSettle?.();
  previous?.disposeInteractions?.();
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }

  const cssString = (value) => JSON.stringify(String(value ?? ""));
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const setTextContent = (node, value) => {
    if (node && node.textContent !== value) {
      node.textContent = value;
      metrics.textWrites += 1;
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const number = Number.parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    // The skin itself declares color-scheme on :root.  Once installed,
    // reading getComputedStyle(root) directly would therefore keep `auto`
    // themes locked to the previous shell mode. Temporarily remove only our
    // own root class/attribute, sample the native computed scheme, then restore
    // synchronously. Mutation records created by this probe are drained below
    // so the root observer does not schedule a redundant ensure pass.
    try {
      const hadSkin = root.classList.contains("codex-dream-skin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove("codex-dream-skin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadSkin) root.classList.add("codex-dream-skin");
        if (savedShell !== null) root.setAttribute(SHELL_ATTR, savedShell);
        rootObserver?.takeRecords?.();
        samplingNativeShell = false;
      }
      if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
      if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
    } catch {
      samplingNativeShell = false;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}

    // Only use surface luminance before the skin owns those surfaces. Sampling
    // our own translucent layers would create route-dependent light/dark flips.
    if (!root.classList.contains("codex-dream-skin")) {
      const samples = [
        body,
        document.querySelector("main.main-surface"),
        document.querySelector("aside.app-shell-left-panel"),
      ].filter(Boolean);
      let votesLight = 0;
      let votesDark = 0;
      for (const el of samples) {
        try {
          const rgb = parseRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const L = luminance(rgb);
          if (L >= 0.55) votesLight += 1;
          else if (L <= 0.25) votesDark += 1;
        } catch {}
      }
      if (votesLight > votesDark) return "light";
      if (votesDark > votesLight) return "dark";
    }
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellMode();
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    const explicit = new Set(Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []);
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--ds-bg": pick("background"),
      "--ds-panel": pick("panel"),
      "--ds-panel-2": pick("panelAlt"),
      "--ds-green": accent,
      "--ds-lime": accentAlt,
      "--ds-cyan": pick("secondary"),
      "--ds-purple": pick("highlight"),
      "--ds-text": pick("text"),
      "--ds-muted": pick("muted"),
      "--ds-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    const rgbVariables = {
      "--ds-bg-rgb": variables["--ds-bg"],
      "--ds-panel-rgb": variables["--ds-panel"],
      "--ds-panel-2-rgb": variables["--ds-panel-2"],
      "--ds-accent-rgb": variables["--ds-green"],
      "--ds-accent-alt-rgb": variables["--ds-lime"],
      "--ds-secondary-rgb": variables["--ds-cyan"],
      "--ds-highlight-rgb": variables["--ds-purple"],
      "--ds-text-rgb": variables["--ds-text"],
      "--ds-muted-rgb": variables["--ds-muted"],
      "--ds-line-rgb": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--dream-skin-name", cssString(THEME.name || "Codex Dream Skin"));
    setStyleProperty(root, "--dream-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--dream-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--dream-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const applyArtMetadata = (root) => {
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    const wide = profile?.wide || false;
    const aspect = profile?.aspect || "unknown";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-ready", artAnalysis ? "true" : "false");
    setStyleProperty(root, "--dream-art-focus-x", focusXValue);
    setStyleProperty(root, "--dream-art-focus-y", focusYValue);
    setStyleProperty(root, "--dream-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--dream-skin-focus-x", focusXValue);
    setStyleProperty(root, "--dream-skin-focus-y", focusYValue);
    setStyleProperty(root, "--dream-skin-art-position", `${focusXValue} ${focusYValue}`);
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  let chromeParts = null;
  let codexPetSnapshot;
  let openLocationVisualSignature = null;
  const FRIENDS_KEY = "codex-dream-skin.qq2007.friends";
  const VIEW_KEY = "codex-dream-skin.qq2007.view";
  const VIEW_SCHEMA_KEY = "codex-dream-skin.qq2007.view-schema";
  const VIEW_SCHEMA_VERSION = 2;
  const CODEX_PET_SELECTOR = '[data-testid="codex-avatar"][data-avatar-asset-ref]';
  const NATIVE_RIGHT_PORTAL_SELECTOR = [
    '[data-slot="popover-content"]',
    '[data-slot="dialog-content"]',
    '[role="dialog"]',
  ].join(", ");
  const NATIVE_RIGHT_PANEL_SELECTOR = [
    "aside:not(.app-shell-left-panel):not(.ds2007-friends)",
    '[data-testid*="side-panel"]',
    '[data-testid*="review-panel"]',
  ].join(", ");
  const NATIVE_RIGHT_SIGNAL_SELECTOR = [
    '[data-slot="thread-summary-panel-section-actions"]',
    'button[aria-label="关闭审阅标签页"]',
    'button[aria-label="Close review tab"]',
  ].join(", ");
  const NATIVE_RIGHT_TOGGLE_SELECTOR = [
    'button[aria-label="切换摘要"]',
    'button[aria-label="Toggle summary"]',
    'button[aria-label="切换置顶摘要"]',
    'button[aria-label="Toggle pinned summary"]',
  ].join(", ");
  const NATIVE_TAB_PANEL_SELECTOR = 'aside:not(.app-shell-left-panel):not(.ds2007-friends):has([role="tab"])';
  const NATIVE_TAB_TOOLBAR_SELECTOR = '.h-toolbar:has([role="tablist"])';
  const interactionBindings = [];
  const bindInteraction = (target, type, handler, marker, options) => {
    if (!target?.addEventListener || target.dataset?.[marker]) return;
    if (target.dataset) target.dataset[marker] = "true";
    target.addEventListener(type, handler, options);
    interactionBindings.push(() => {
      target.removeEventListener?.(type, handler, options);
      if (target.dataset) delete target.dataset[marker];
    });
  };
  const disposeInteractions = () => {
    while (interactionBindings.length) interactionBindings.pop()?.();
    document.querySelectorAll?.(".ds2007-context-menu")?.forEach?.((node) => node.remove?.());
  };

  const readStoredJson = (key, fallback) => {
    try {
      const value = window.localStorage?.getItem?.(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStoredJson = (key, value) => {
    try { window.localStorage?.setItem?.(key, JSON.stringify(value)); } catch {}
  };
  const storedViewSchema = readStoredJson(VIEW_SCHEMA_KEY, 0);
  let skinView = storedViewSchema === VIEW_SCHEMA_VERSION && readStoredJson(VIEW_KEY, "deep") === "native"
    ? "native" : "deep";
  if (storedViewSchema !== VIEW_SCHEMA_VERSION) {
    writeStoredJson(VIEW_KEY, "deep");
    writeStoredJson(VIEW_SCHEMA_KEY, VIEW_SCHEMA_VERSION);
  }

  const syncSkinMenuSelection = () => {
    const chrome = document.getElementById(CHROME_ID);
    for (const option of chrome?.querySelectorAll?.("[data-skin-view], [data-skin-theme]") || []) {
      const selected = option.hasAttribute("data-skin-theme")
        ? skinView === "deep" && option.getAttribute("data-skin-theme") === THEME.id
        : option.getAttribute("data-skin-view") === skinView;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-checked", String(selected));
    }
  };

  const setSkinMenuOpen = (open) => {
    const chrome = document.getElementById(CHROME_ID);
    const menu = chrome?.querySelector?.(".ds2007-skin-menu");
    const trigger = skinView === "native"
      ? document.querySelector?.(".ds2007-native-skin-nav")
      : chrome?.querySelector?.('[data-action="skin-menu"]');
    if (!menu || !trigger) return;
    const nextOpen = Boolean(open);
    menu.hidden = !nextOpen;
    trigger.setAttribute("aria-expanded", String(nextOpen));
    trigger.setAttribute("data-state", nextOpen ? "open" : "closed");
    if (nextOpen) {
      syncSkinMenuSelection();
      const rect = trigger.getBoundingClientRect?.();
      const menuWidth = 268;
      const left = Math.max(8, Math.min((rect?.left || 8), window.innerWidth - menuWidth - 8));
      const menuHeight = Math.min(menu.scrollHeight || 170, 520, Math.max(170, window.innerHeight - 16));
      const top = Math.max(8, Math.min((rect?.bottom || 84) + 3, window.innerHeight - menuHeight - 8));
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      menu.querySelector?.('[data-skin-view].is-selected, [data-skin-theme].is-selected')?.focus?.();
    }
  };

  const bindSkinMenuContents = (menu) => {
    const root = document.documentElement;
    bindInteraction(menu, "click", (event) => {
      const close = event.target?.closest?.('[data-action="skin-menu-close"]');
      const option = event.target?.closest?.("[data-skin-view], [data-skin-theme]");
      if (!close && !option) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      setSkinMenuOpen(false);
      if (option?.hasAttribute?.("data-skin-theme")) {
        const themeId = option.getAttribute("data-skin-theme");
        writeStoredJson(VIEW_KEY, "deep");
        writeStoredJson(VIEW_SCHEMA_KEY, VIEW_SCHEMA_VERSION);
        if (themeId === THEME.id) setSkinView("deep");
        else window.__CODEX_ONE_CLICK_SKIN__?.apply?.(themeId);
      } else if (option) {
        setSkinView(option.getAttribute("data-skin-view"));
      }
    }, "skinMenuBound");
    bindInteraction(root, "click", (event) => {
      if (event.target?.closest?.('.ds2007-skin-menu, [data-action="skin-menu"]')) return;
      setSkinMenuOpen(false);
    }, "skinMenuDismissBound", true);
    bindInteraction(root, "keyup", (event) => {
      if (event.key !== "Escape") return;
      setSkinMenuOpen(false);
      const trigger = skinView === "native"
        ? document.querySelector?.(".ds2007-native-skin-nav")
        : chromeParts?.skinMenuTrigger;
      trigger?.focus?.();
    }, "skinMenuEscapeBound", true);
  };

  const ensureNativeSkinNavigation = () => {
    const root = document.documentElement;
    const menubar = document.querySelector?.('[role="menubar"][aria-label="应用程序菜单"], [role="menubar"]');
    if (!menubar) {
      root?.setAttribute?.("data-ds2007-native-nav", "missing");
      return null;
    }
    let button = document.querySelector?.(".ds2007-native-skin-nav");
    if (button && button.parentElement !== menubar) {
      button.remove?.();
      button = null;
    }
    if (!button) {
      const source = menubar.querySelector?.('#application-menu-trigger-help-menu') ||
        [...(menubar.querySelectorAll?.(':scope > button[role="menuitem"]') || [])]
          .find((candidate) => candidate.id !== "application-menu-content-anchor");
      button = document.createElement("button");
      button.type = "button";
      button.className = source?.className || "no-drag rounded-md border border-transparent px-2.5 py-1 text-base font-normal leading-none outline-none";
      button.classList.add("ds2007-native-skin-nav");
      button.textContent = "换肤";
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", "换肤");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("data-action", "skin-menu");
      button.setAttribute("data-state", "closed");
      button.setAttribute("data-orientation", "horizontal");
      button.tabIndex = 0;
      const anchor = menubar.querySelector?.("#application-menu-content-anchor");
      menubar.insertBefore(button, anchor || null);
    }
    bindInteraction(button, "pointerdown", (event) => {
      event.stopPropagation?.();
    }, "nativeSkinNavPointerBound", true);
    bindInteraction(button, "click", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      setSkinMenuOpen(button.getAttribute("aria-expanded") !== "true");
    }, "nativeSkinNavBound");
    bindSkinMenuContents(document.getElementById(CHROME_ID)?.querySelector?.(".ds2007-skin-menu"));
    syncSkinMenuSelection();
    root?.setAttribute?.("data-ds2007-native-nav", "ready");
    return button;
  };

  const normalizedLabel = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  const nativeSummaryToggles = () =>
    [...(document.querySelectorAll?.(NATIVE_RIGHT_TOGGLE_SELECTOR) || [])];
  let openLocationSettleTimer = null;
  const cancelOpenLocationSettle = () => {
    if (openLocationSettleTimer !== null) clearTimeout(openLocationSettleTimer);
    openLocationSettleTimer = null;
  };
  const scheduleOpenLocationSettle = () => {
    if (openLocationSettleTimer !== null) return;
    openLocationSettleTimer = setTimeout(() => {
      openLocationSettleTimer = null;
      ensure({ root: false, route: true, layout: false });
    }, 320);
  };
  const summaryToggleByState = (labels, pressed) => labels
    .map((label) => nativeSummaryToggles().find((candidate) =>
      candidate.getAttribute?.("aria-label") === label &&
      candidate.getAttribute?.("aria-pressed") === pressed))
    .find(Boolean);
  const setNativeRightVisible = (visible) => {
    const pinLabels = ["切换置顶摘要", "Toggle pinned summary"];
    const summaryLabels = ["切换摘要", "Toggle summary"];
    if (visible) {
      const summary = summaryToggleByState(summaryLabels, "false");
      const fallback = summaryToggleByState(pinLabels, "false");
      const toggle = summary || fallback;
      if (!toggle) return false;
      toggle.click?.();
      scheduleEnsure({ route: true, layout: false });
      return true;
    }
    const toggles = [
      summaryToggleByState(pinLabels, "true"),
      summaryToggleByState(summaryLabels, "true"),
    ].filter(Boolean);
    const close = visible ? null : document.querySelector?.(
      'button[aria-label="关闭审阅标签页"], button[aria-label="Close review tab"]',
    );
    if (!toggles.length && !close) return false;
    for (const toggle of toggles) toggle.click?.();
    close?.click?.();
    scheduleEnsure({ route: true, layout: false });
    return true;
  };
  const bindNativeRightToggleGuards = (root) => {
    for (const toggle of nativeSummaryToggles()) {
      bindInteraction(toggle, "click", () => {
        const opening = toggle.getAttribute?.("aria-pressed") !== "true";
        setAttribute(root, "data-ds2007-native-right", opening ? "open" : "closed");
        setAttribute(root, "data-ds2007-native-right-layout", opening ? "pending" : "none");
        scheduleEnsure({ route: true, layout: false });
      }, "ds2007NativeRightGuardBound", true);
    }
  };
  const readCodexPetSnapshot = () => {
    if (codexPetSnapshot !== undefined) return codexPetSnapshot;
    const source = document.querySelector?.(CODEX_PET_SELECTOR);
    const backgroundImage = source ? getComputedStyle(source).backgroundImage : "";
    codexPetSnapshot = source && backgroundImage && backgroundImage !== "none"
      ? { assetRef: source.getAttribute?.("data-avatar-asset-ref") || "codex", backgroundImage }
      : null;
    return codexPetSnapshot;
  };
  const isVisiblyOpen = (node, shellMain) => {
    const box = node?.getBoundingClientRect?.();
    const shellBox = shellMain?.getBoundingClientRect?.();
    if (!box || !shellBox || box.width <= 0 || box.height <= 0 ||
      box.right <= shellBox.left || box.left >= innerWidth ||
      box.bottom <= shellBox.top || box.top >= shellBox.bottom) return false;
    let current = node;
    while (current && current !== shellMain.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
      if (current === shellMain) break;
      current = current.parentElement;
    }
    return true;
  };
  const persistentNativeRightOwner = (candidate, shellMain) => {
    if (candidate.matches?.(NATIVE_RIGHT_PANEL_SELECTOR)) return candidate;
    let current = candidate.parentElement;
    while (current && current !== shellMain) {
      const box = current.getBoundingClientRect?.();
      if (box?.width >= 220 && box?.height >= 240) return current;
      current = current.parentElement;
    }
    return null;
  };
  const nativeRightLabel = (owner) => {
    if (!owner) return "环境信息";
    const signature = [
      owner.getAttribute?.("data-testid") || "",
      owner.getAttribute?.("aria-label") || "",
      String(owner.className || ""),
      normalizedLabel(owner),
    ].join(" ");
    if (/(环境|environment)/i.test(signature)) return "环境信息";
    if (/(审查|review|diff|变更)/i.test(signature)) return "代码审查";
    if (/(文件|file)/i.test(signature)) return "文件详情";
    return "Codex 信息";
  };
  const readNativeRightState = (shellMain) => {
    const summaryToggles = nativeSummaryToggles();
    const pinnedSummaryOpen = summaryToggles.some((toggle) =>
      /^(切换置顶摘要|Toggle pinned summary)$/.test(toggle.getAttribute?.("aria-label") || "") &&
      toggle.getAttribute?.("aria-pressed") === "true");
    const summaryExplicitlyClosed = summaryToggles.length > 0 &&
      summaryToggles.every((toggle) => toggle.getAttribute?.("aria-pressed") !== "true");
    return [
      ...(document.querySelectorAll?.(NATIVE_RIGHT_PANEL_SELECTOR) || []),
      ...(document.querySelectorAll?.(NATIVE_RIGHT_SIGNAL_SELECTOR) || []),
    ].map((candidate) => {
      if (candidate.closest?.(`#${CHROME_ID}`)) return false;
      if (summaryExplicitlyClosed &&
        candidate.matches?.('[data-slot="thread-summary-panel-section-actions"]')) return false;
      const structural = candidate.matches?.(NATIVE_RIGHT_PANEL_SELECTOR);
      const owner = persistentNativeRightOwner(candidate, shellMain);
      const box = owner?.getBoundingClientRect?.();
      return owner && isVisiblyOpen(candidate, shellMain) && isVisiblyOpen(owner, shellMain) &&
        box.width >= 220 && box.height >= 240
        ? { owner, layout: structural ? "structural" : pinnedSummaryOpen ? "pinned" : "floating" }
        : null;
    }).find(Boolean) || null;
  };
  const markNativeRightDock = (root, nativeRightState) => {
    const portal = nativeRightState?.owner?.closest?.('[data-slot="popover-content"]');
    const pinnedOwner = !portal && nativeRightState?.layout === "pinned"
      ? nativeRightState.owner : null;
    const dock = portal || pinnedOwner;
    for (const candidate of document.querySelectorAll?.("[data-ds2007-native-dock]") || []) {
      if (candidate !== dock) candidate.removeAttribute?.("data-ds2007-native-dock");
    }
    if (!dock) return;
    setAttribute(dock, "data-ds2007-native-dock", portal ? "true" : "pinned");
  };
  const clearNativeRightDock = (root) => {
    for (const candidate of document.querySelectorAll?.("[data-ds2007-native-dock]") || []) {
      candidate.removeAttribute?.("data-ds2007-native-dock");
    }
    setAttribute(root, "data-ds2007-native-right", "closed");
    setAttribute(root, "data-ds2007-native-right-layout", "none");
  };
  const SIDEBAR_SECTIONS = new Map([
    ["置顶", "pinned"],
    ["项目", "projects"],
    ["展开显示", "expanded"],
    ["任务", "tasks"],
    ["最近", "recents"],
  ]);

  const clearSidebarMarker = (node) => {
    node?.classList?.remove("ds2007-toolbar-duplicate", "ds2007-project-entry", "ds2007-pinned-source", "ds2007-section-label");
    node?.removeAttribute?.("data-ds2007-project");
    node?.removeAttribute?.("data-ds2007-group");
    node?.removeAttribute?.("data-ds2007-section");
    node?.removeAttribute?.("data-ds2007-global-nav-source");
    node?.removeAttribute?.("data-ds2007-collapse-bound");
    node?.removeAttribute?.("data-ds2007-context-bound");
    node?.removeAttribute?.("data-qq2007-styled");
    node?.removeAttribute?.("data-qq2007-section");
    node?.removeAttribute?.("data-qq2007-toolbar-duplicate");
  };

  const styleSidebarSubtree = (node) => {
    if (!node || node.nodeType !== 1) return;
    const sidebar = node.matches?.("aside.app-shell-left-panel")
      ? node
      : node.closest?.("aside.app-shell-left-panel");
    if (!sidebar) return;
    const candidates = [];
    if (node.matches?.('button[class*="group/section-toggle"]')) candidates.push(node);
    candidates.push(...(node.querySelectorAll?.('button[class*="group/section-toggle"]') || []));
    for (const candidate of candidates) {
      const label = normalizedLabel(candidate);
      const section = SIDEBAR_SECTIONS.get(label);
      if (!section) continue;
      if (!candidate.dataset?.qq2007Styled) {
        candidate.dataset.qq2007Styled = "section";
        candidate.dataset.qq2007Section = section;
      }
      const panel = candidate.closest?.("[data-app-action-sidebar-section]");
      if (panel) {
        panel.dataset.qq2007Styled = "panel";
        panel.dataset.qq2007Section = section;
      }
    }
    if (node === sidebar) sidebar.dataset.qq2007Styled = "sidebar";
  };

  const clearComposerMarker = (node) => {
    if (node?.dataset?.qq2007SyntheticComposerClass === "true") {
      node.classList?.remove?.("composer-surface-chrome");
      node.removeAttribute?.("data-qq2007-synthetic-composer-class");
    }
    node?.removeAttribute?.("data-qq2007-styled");
    node?.removeAttribute?.("data-qq2007-composer-region");
    node?.removeAttribute?.("data-qq2007-composer-control");
  };
  const styleComposerSubtree = (node) => {
    if (!node || node.nodeType !== 1) return;
    const composerSelector = '.composer-surface-chrome, [class*="ComposerLayoutRoot"]';
    const composers = new Set();
    const closest = node.matches?.(composerSelector)
      ? node
      : node.closest?.(composerSelector);
    if (closest) composers.add(closest);
    for (const composer of node.querySelectorAll?.(composerSelector) || []) composers.add(composer);
    for (const composer of composers) {
      if (!composer.classList?.contains?.("composer-surface-chrome")) {
        composer.classList?.add?.("composer-surface-chrome");
        composer.dataset.qq2007SyntheticComposerClass = "true";
      }
      // Older revisions marked native branches for a synthetic three-row layout.
      // Remove those markers and let Codex own attachment, editor, and footer flow.
      for (const candidate of composer.querySelectorAll?.(
        "[data-qq2007-composer-region], [data-qq2007-composer-control]",
      ) || []) clearComposerMarker(candidate);
    }
  };

  const findPrimaryNavDestination = (sidebar, label) => {
    if (!sidebar) return null;
    return [...(sidebar.querySelectorAll?.('button, a, [role="button"]') || [])]
      .find((candidate) => normalizedLabel(candidate) === label) || null;
  };
  const PRIMARY_NAV_LABELS = ["新对话", "拉取请求", "已安排", "插件"];
  const markPrimaryNavSources = (sidebar, subtree = sidebar) => {
    if (!sidebar || !subtree) return;
    const candidates = [];
    if (subtree.matches?.('button, a, [role="button"]')) candidates.push(subtree);
    candidates.push(...(subtree.querySelectorAll?.('button, a, [role="button"]') || []));
    for (const destination of candidates) {
      const label = normalizedLabel(destination);
      if (!PRIMARY_NAV_LABELS.includes(label)) continue;
      if (destination.dataset) destination.dataset.ds2007GlobalNavSource = label;
    }
  };
  const SIDEBAR_PEEK_HOST_SELECTOR =
    '[data-pip-obstacle="app-shell-floating-left-panel"]:has(> aside[data-testid="app-shell-floating-left-panel"])';
  const markSidebarPeekSurface = (subtree = document) => {
    const hosts = new Set();
    if (subtree.matches?.(SIDEBAR_PEEK_HOST_SELECTOR)) hosts.add(subtree);
    const closestHost = subtree.closest?.(SIDEBAR_PEEK_HOST_SELECTOR);
    if (closestHost) hosts.add(closestHost);
    for (const host of subtree.querySelectorAll?.(SIDEBAR_PEEK_HOST_SELECTOR) || []) hosts.add(host);
    let firstSidebar = null;
    for (const host of hosts) {
      const sidebar = host.querySelector?.(":scope > aside");
      if (!sidebar) continue;
      firstSidebar ||= sidebar;
      host.dataset.ds2007SidebarPeekHost = "true";
      const nativeHeader = document.querySelector?.('[data-pip-obstacle="app-shell-header"]');
      const nativeHeaderBottom = nativeHeader?.getBoundingClientRect?.().bottom;
      if (Number.isFinite(nativeHeaderBottom) && nativeHeaderBottom > 0) {
        setStyleProperty(host, "--ds2007-sidebar-peek-top", `${Math.ceil(nativeHeaderBottom)}px`);
      }
      sidebar.classList.add("app-shell-left-panel", "ds2007-sidebar-peek");
      sidebar.dataset.ds2007SyntheticSidebarClass = "true";
      styleSidebarSubtree(sidebar);
      markPrimaryNavSources(sidebar);
    }
    return firstSidebar;
  };
  const syncPrimaryNavToolbar = (sidebar, toolbar) => {
    for (const trigger of toolbar?.querySelectorAll?.("button[data-nav]") || []) {
      trigger.hidden = false;
      trigger.removeAttribute?.("aria-disabled");
    }
  };

  let primaryNavRequestId = 0;
  const activatePrimaryNav = (label) => {
    const requestId = ++primaryNavRequestId;
    const deadline = now() + 4000;
    let sidebarRequested = false;
    let activityCloseRequested = false;
    let sidebarReadyAt = 0;
    let activityReadyAt = 0;
    const attempt = () => {
      if (requestId !== primaryNavRequestId || window[DISABLED_KEY]) return;
      const sidebar = document.querySelector("aside.app-shell-left-panel:not(.ds2007-sidebar-peek)");
      const activityToggle = sidebar?.querySelector?.('button[aria-pressed="true"]');
      const timestamp = now();
      if (sidebar && timestamp < sidebarReadyAt) {
        // Let Codex finish restoring the persistent sidebar state first.
      } else if (activityToggle && !activityCloseRequested) {
        activityCloseRequested = true;
        activityReadyAt = timestamp + 500;
        activityToggle.click?.();
      } else if (timestamp >= activityReadyAt) {
        const destination = findPrimaryNavDestination(sidebar, label);
        if (destination) {
          destination.click?.();
          return;
        }
      }
      if (!sidebar && !sidebarRequested) {
        sidebarRequested = true;
        sidebarReadyAt = timestamp + 500;
        document.querySelector?.('button[data-app-shell-sidebar-trigger="true"]')?.click?.();
      }
      if (now() < deadline) setTimeout(attempt, 100);
    };
    attempt();
  };

  const cleanupLegacySidebarArtifacts = (sidebar) => {
    document.querySelectorAll?.(".ds2007-pinned-panel, .ds2007-context-menu")
      ?.forEach?.((node) => node.remove?.());
    for (const node of sidebar?.querySelectorAll?.(
      ".ds2007-toolbar-duplicate, .ds2007-project-entry, .ds2007-pinned-source, .ds2007-section-label, [data-qq2007-styled], [data-qq2007-toolbar-duplicate], [data-ds2007-context-bound], [data-ds2007-collapse-bound], [data-ds2007-global-nav-source]",
    ) || []) {
      clearSidebarMarker(node);
    }
    clearSidebarMarker(sidebar);
    for (const group of SIDEBAR_SECTIONS.values()) {
      document.documentElement?.removeAttribute(`data-ds2007-collapse-${group}`);
    }
    try {
      window.localStorage?.removeItem?.("codex-dream-skin.qq2007.pinned-projects");
      window.localStorage?.removeItem?.("codex-dream-skin.qq2007.collapsed-groups");
    } catch {}
  };

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      style.dataset.dreamSkinVersion = VERSION;
      (document.head || root).appendChild(style);
    } else if (style.dataset.dreamSkinStyleRevision !== STYLE_REVISION) {
      style.textContent = cssText;
    }
    style.dataset.dreamSkinVersion = VERSION;
    style.dataset.dreamSkinStyleRevision = STYLE_REVISION;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setStyleProperty(root, "--dream-skin-art", `url("${artUrl}")`);
    if (DECORATION_DATA.assistant) {
      setStyleProperty(root, "--ds1907-assistant-avatar", `url("${DECORATION_DATA.assistant}")`);
    }
    applyTheme(root, shell);
    applyArtMetadata(root);
    setAttribute(root, "data-dream-skin-mode", THEME.mode === "deep" ? "qq2007" : "classic");
    setAttribute(root, "data-ds1907-status", PROFILE.status || "online");
    root.classList.add("codex-dream-skin");
    const chrome = document.getElementById(CHROME_ID);
    if (chrome && chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
    return shell;
  };

  let frameLayoutTimer = null;
  let nativeTabLayoutFrame = null;
  const cancelFrameLayout = () => {
    if (frameLayoutTimer !== null) clearTimeout(frameLayoutTimer);
    frameLayoutTimer = null;
  };
  const cancelNativeTabLayout = () => {
    if (nativeTabLayoutFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(nativeTabLayoutFrame);
    }
    nativeTabLayoutFrame = null;
  };
  const syncFrameLayout = (shellMain, chrome) => {
    metrics.layoutReads += 1;
    const nativeHeader = shellMain?.querySelector?.(":scope > header.app-header-tint");
    const viewportWidth = Number(window.innerWidth) || 1280;
    let safeLeft = 82;
    let safeRight = 12;
    const protectedNodes = nativeHeader?.querySelectorAll?.(
      'button, a, [role="button"], span.min-w-0.truncate',
    ) || [];
    for (const node of protectedNodes) {
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const midpoint = rect.left + rect.width / 2;
      if (midpoint < viewportWidth / 2) safeLeft = Math.max(safeLeft, Math.ceil(rect.right) + 8);
      else safeRight = Math.max(safeRight, Math.ceil(viewportWidth - rect.left) + 8);
    }
    setStyleProperty(chrome, "--ds2007-title-safe-left", `${safeLeft}px`);
    setStyleProperty(chrome, "--ds2007-title-safe-right", `${safeRight}px`);
  };
  const syncSidebarVisibility = (root = document.documentElement) => {
    const sidebar = document.querySelector("aside.app-shell-left-panel:not(.ds2007-sidebar-peek)");
    const rect = sidebar?.getBoundingClientRect?.();
    const style = sidebar && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(sidebar) : null;
    const visible = Boolean(sidebar && rect && rect.width > 32 && rect.height > 0 && rect.right > 0 &&
      (!style || (style.display !== "none" && style.visibility !== "hidden")));
    setAttribute(root, "data-ds2007-sidebar-visible", visible ? "true" : "false");
  };
  const syncNativeTabChrome = (shellMain) => {
    const panels = [...(shellMain?.querySelectorAll?.(NATIVE_TAB_PANEL_SELECTOR) || [])];
    const activePanel = panels.find((panel) => {
      const rect = panel.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0;
    }) || null;
    for (const panel of document.querySelectorAll?.('[data-ds2007-native-tabs="true"]') || []) {
      if (panel !== activePanel) panel.removeAttribute?.("data-ds2007-native-tabs");
    }
    for (const toolbar of document.querySelectorAll?.('[data-ds2007-native-tab-toolbar="true"]') || []) {
      if (toolbar !== activePanel?.querySelector?.(NATIVE_TAB_TOOLBAR_SELECTOR)) {
        toolbar.removeAttribute?.("data-ds2007-native-tab-toolbar");
      }
    }
    if (!activePanel) {
      cancelNativeTabLayout();
      return false;
    }

    setAttribute(activePanel, "data-ds2007-native-tabs", "true");
    const toolbar = activePanel.querySelector?.(NATIVE_TAB_TOOLBAR_SELECTOR);
    if (toolbar) setAttribute(toolbar, "data-ds2007-native-tab-toolbar", "true");

    const nativeHeader = shellMain?.querySelector?.(':scope > header.pointer-events-none.fixed[class*="h-toolbar"]');
    const sidebarTogglePattern = /^(?:\u663e\u793a|\u9690\u85cf|\u663e\u793a\s*\/\s*\u9690\u85cf)(?:\u4fa7\u8fb9\u680f|\u8fb9\u680f)$|^(?:show|hide|show\s*\/\s*hide) sidebar$/i;
    const sidebarToggles = [...(nativeHeader?.querySelectorAll?.("button[aria-label]") || [])]
      .filter((button) => sidebarTogglePattern.test(button.getAttribute?.("aria-label") || ""));
    const visibleToggle = sidebarToggles
      .map((button) => ({ button, rect: button.getBoundingClientRect?.() }))
      .filter(({ rect }) => rect && rect.width > 0 && rect.height > 0 && rect.right > 0)
      .sort((left, right) => right.rect.right - left.rect.right)[0]?.button || sidebarToggles.at(-1) || null;
    for (const button of document.querySelectorAll?.('[data-ds2007-native-sidebar-toggle="true"]') || []) {
      if (button !== visibleToggle) button.removeAttribute?.("data-ds2007-native-sidebar-toggle");
    }
    if (visibleToggle) setAttribute(visibleToggle, "data-ds2007-native-sidebar-toggle", "true");

    if (!toolbar || nativeTabLayoutFrame !== null || typeof requestAnimationFrame !== "function") return true;
    nativeTabLayoutFrame = requestAnimationFrame(() => {
      nativeTabLayoutFrame = null;
      if (!toolbar.isConnected) return;
      const scroller = toolbar.querySelector?.(':scope > div:has([role="tablist"])');
      const selectedTab = toolbar.querySelector?.('[role="tab"][aria-selected="true"]');
      const selectedShell = selectedTab?.closest?.('.group\\/tab') || selectedTab;
      if (!scroller || !selectedShell) return;
      const scrollerRect = scroller.getBoundingClientRect?.();
      const selectedRect = selectedShell.getBoundingClientRect?.();
      const stickyAction = [...(scroller.querySelectorAll?.('button:not([role="tab"])') || [])]
        .find((button) => !button.hasAttribute?.("data-app-shell-tab-close-button"));
      const actionRect = stickyAction?.getBoundingClientRect?.();
      if (!scrollerRect || !selectedRect) return;
      const safeLeft = scrollerRect.left + 2;
      const safeRight = Math.min(scrollerRect.right, actionRect?.left || scrollerRect.right) - 4;
      if (selectedRect.right > safeRight + 1) {
        scroller.scrollLeft += selectedRect.right - safeRight;
      } else if (selectedRect.left < safeLeft - 1) {
        scroller.scrollLeft -= safeLeft - selectedRect.left;
      }
    });
    return true;
  };
  const scheduleFrameLayout = () => {
    if (frameLayoutTimer !== null) return;
    frameLayoutTimer = setTimeout(() => {
      frameLayoutTimer = null;
      const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
      const chrome = document.getElementById(CHROME_ID);
      syncSidebarVisibility();
      if (shellMain && chrome) syncFrameLayout(shellMain, chrome);
    }, 64);
  };

  const clearOpenLocationSource = (button) => {
    if (!button) return;
    delete button.dataset.ds2007OpenLocationSource;
    for (const name of [
      "--ds2007-open-location-x", "--ds2007-open-location-y",
      "--ds2007-open-location-width", "--ds2007-open-location-height",
    ]) button.style.removeProperty(name);
  };

  const syncOpenLocationProxy = (nativeButton, proxy) => {
    if (!proxy) return;
    const visible = Boolean(nativeButton);
    proxy.hidden = !visible;
    if (!visible) {
      for (const source of document.querySelectorAll?.('[data-ds2007-open-location-source="true"]') || []) {
        clearOpenLocationSource(source);
      }
      return;
    }

    const nativeMenuButton = nativeButton.parentElement?.querySelector?.('button[aria-label="次要操作"], button[aria-label="Secondary action"]');
    const sourceHost = nativeMenuButton ? nativeButton.parentElement : nativeButton;
    for (const source of document.querySelectorAll?.('[data-ds2007-open-location-source="true"]') || []) {
      if (source !== sourceHost) clearOpenLocationSource(source);
    }
    sourceHost.dataset.ds2007OpenLocationSource = "true";
    document.documentElement?.removeAttribute?.("data-ds2007-open-location-pending");
    const rect = proxy.getBoundingClientRect?.();
    const sourceRect = sourceHost.getBoundingClientRect?.();
    if (rect && sourceRect && rect.width > 0 && sourceRect.width > 0) {
      const currentDx = Number.parseFloat(
        sourceHost.style.getPropertyValue("--ds2007-open-location-dx"),
      ) || 0;
      const currentDy = Number.parseFloat(
        sourceHost.style.getPropertyValue("--ds2007-open-location-dy"),
      ) || 0;
      setStyleProperty(
        sourceHost,
        "--ds2007-open-location-dx",
        `${Math.round(rect.right - sourceRect.right + currentDx)}px`,
      );
      setStyleProperty(
        sourceHost,
        "--ds2007-open-location-dy",
        `${Math.round(rect.top - sourceRect.top + currentDy)}px`,
      );
    }
    const nativeIcon = nativeButton.querySelector?.("img, svg");
    const nativeChevron = nativeMenuButton?.querySelector?.("svg");
    const iconHost = proxy.querySelector?.(".ds2007-open-location-icon");
    const chevronHost = proxy.querySelector?.(".ds2007-open-location-chevron");
    const visualSignature = `${nativeIcon?.outerHTML || ""}\n${nativeChevron?.outerHTML || ""}`;
    if (iconHost && chevronHost && (
      openLocationVisualSignature !== visualSignature ||
      (nativeIcon && !iconHost.firstElementChild) ||
      (nativeChevron && !chevronHost.firstElementChild) ||
      (!nativeIcon && iconHost.firstElementChild) ||
      (!nativeChevron && chevronHost.textContent !== "⌄")
    )) {
      if (nativeIcon) iconHost.replaceChildren?.(nativeIcon.cloneNode(true));
      else iconHost.replaceChildren?.();
      if (nativeChevron) chevronHost.replaceChildren?.(nativeChevron.cloneNode(true));
      else chevronHost.textContent = "⌄";
      openLocationVisualSignature = visualSignature;
    }

  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    markSidebarPeekSurface(document);
    syncSidebarVisibility(root);
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home')) {
      if (candidate !== home) candidate.classList.remove("dream-skin-home");
    }
    if (home) home.classList.add("dream-skin-home");
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll([
        '[data-composer-home-utility-bar-position="above"][data-composer-placement="home"]',
        '[class*="_homeUtilityBar_"]',
        '[class*="_HomeUtilityBar_"]',
      ].join(", "))
      : []);
    for (const candidate of document.querySelectorAll(".dream-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("dream-skin-home-utility");
    }
    for (const candidate of homeUtilityBars) candidate.classList.add("dream-skin-home-utility");

    if (!shellMain || !document.body) return;
    syncNativeTabChrome(shellMain);
    shellMain.classList.toggle("dream-skin-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    if (chrome && chrome.dataset.ds2007Revision !== "26") {
      chrome.remove();
      chrome = null;
      chromeParts = null;
    }
    let created = false;
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.innerHTML = `
        <header class="ds2007-titlebar"><span class="ds2007-title-drag-surface"><span class="ds2007-icon ds2007-icon--mascot ds2007-title-icon" aria-hidden="true"></span><b class="ds2007-window-title">Codex 2026</b></span></header>
        <nav class="ds2007-toolbar" aria-label="Codex 2007 全局工具栏">
          <button data-nav="新对话"><i class="ds2007-icon ds2007-icon--new-conversation" aria-hidden="true"></i><span>新对话</span></button>
          <button data-nav="拉取请求"><i class="ds2007-icon ds2007-icon--pull-request" aria-hidden="true"></i><span>拉取请求</span></button>
          <button data-nav="已安排"><i class="ds2007-icon ds2007-icon--scheduled" aria-hidden="true"></i><span>已安排</span></button>
          <button data-nav="插件"><i class="ds2007-icon ds2007-icon--plugins" aria-hidden="true"></i><span>插件</span></button>
          <button class="ds2007-skin-trigger" type="button" data-action="skin-menu" aria-haspopup="menu" aria-expanded="false"><i class="ds2007-icon ds2007-icon--skin" aria-hidden="true"></i><span>换肤</span></button>
          <button class="ds2007-open-location-proxy" type="button" hidden aria-label="打开位置"><span class="ds2007-open-location-icon" aria-hidden="true"></span><span>打开位置</span><span class="ds2007-open-location-chevron" aria-hidden="true"></span></button>
        </nav>
        <section class="ds2007-skin-menu" role="menu" aria-label="选择皮肤" hidden>
          <header><b>选择皮肤</b><button type="button" data-action="skin-menu-close" aria-label="关闭换肤菜单">×</button></header>
          ${THEME_CATALOG.map((item) => `<button type="button" role="menuitemradio" data-skin-theme="${escapeHtml(item.id)}" aria-checked="${item.id === THEME.id ? "true" : "false"}"><i class="ds2007-skin-swatch ds2007-skin-swatch--qq" aria-hidden="true"></i><span><b>${escapeHtml(item.name)}</b><small>保留 Codex 原生交互能力</small></span><em aria-hidden="true">✓</em></button>`).join("")}
          <button type="button" role="menuitemradio" data-skin-view="native" aria-checked="false"><i class="ds2007-skin-swatch ds2007-skin-swatch--native" aria-hidden="true"></i><span><b>Codex 原生</b><small>恢复官方外观，可随时返回</small></span><em aria-hidden="true">✓</em></button>
        </section>
        <aside class="ds2007-friends" aria-label="Codex 好友">
          <header class="ds2007-right-tabs" role="tablist" aria-label="右侧面板">
            <button class="ds2007-right-tab" data-action="native-panel" role="tab"><span class="ds2007-native-tab-label">环境信息</span></button>
            <button class="ds2007-right-tab is-active" data-action="friend-expand" role="tab" aria-selected="true">Codex 好友</button>
            <span class="ds2007-right-tabs-spacer"></span><button data-action="friend-collapse" aria-label="收起好友栏">—</button><button data-action="friend-close" aria-label="关闭好友栏">×</button>
          </header>
          <div class="ds2007-friends-scroll">
            <section class="ds2007-assistant-card"><div class="ds2007-pet-media"></div><div class="ds2007-friend-profile"><p><i></i><b>Codex小蓝</b><em>LV07</em></p><small>代码有问题？找我！<br>我是你的智能伙伴Codex</small></div></section>
            <nav class="ds2007-quick-actions"><span><i class="ds2007-icon ds2007-icon--mail" aria-hidden="true"></i><b>消息</b></span><span><i class="ds2007-icon ds2007-icon--star" aria-hidden="true"></i><b>收藏</b></span><span><i class="ds2007-icon ds2007-icon--groups" aria-hidden="true"></i><b>群组</b></span><span><i class="ds2007-icon ds2007-icon--folder" aria-hidden="true"></i><b>文件</b></span></nav>
            <section class="ds2007-friend-list"><header>▾ 我的好友 (1/1)</header><div><span class="ds2007-mini-avatar"></span><span><b>Codex小蓝</b><small>● 在线 · 随时为你服务</small></span></div><header>▸ 智能伙伴 (0/0)</header><header>▸ 离线好友 (0/0)</header></section>
            <section class="ds2007-qqshow-card"><header><b>QQ 秀</b><span>主题可替换</span></header><div class="ds2007-qqshow-media"></div></section>
          </div>
          <label class="ds2007-friend-search"><span class="ds2007-icon ds2007-icon--search" aria-hidden="true"></span><input placeholder="查找好友…" readonly></label>
        </aside>
        <nav class="ds2007-friends-tab" aria-label="右侧面板标签">
          <button data-action="native-panel" aria-label="打开环境信息"><b class="ds2007-native-rail-label">环境</b></button>
          <button data-action="friend-expand" aria-label="展开好友栏"><b>好友</b></button>
        </nav>
        <footer class="ds2007-statusbar"><span class="ds2007-icon ds2007-icon--online" aria-hidden="true"></span><b></b><span class="ds2007-status-current"></span><span class="ds2007-profile-signature"></span><span class="ds2007-security"><i class="ds2007-icon ds2007-icon--security" aria-hidden="true"></i>安全</span></footer>
        <button class="ds2007-native-skin-toggle" type="button" data-action="skin-restore" aria-label="返回当前皮肤"><i class="ds2007-icon ds2007-icon--skin" aria-hidden="true"></i><span>返回皮肤</span></button>
        <div class="dream-skin-brand"><span class="dream-skin-portal-mark">◉</span><span><b></b><small></small></span></div>
        <div class="dream-skin-status"><i></i><span></span></div><div class="dream-skin-quote"></div>
        <div class="dream-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="dream-skin-orbit"></div>`;
      document.body.appendChild(chrome);
      chrome.dataset.ds2007Revision = "26";
      created = true;
      chromeParts = null;
    }
    if (!chromeParts || chromeParts.chrome !== chrome) {
      chromeParts = {
        chrome,
        name: chrome.querySelector(".dream-skin-brand b"),
        subtitle: chrome.querySelector(".dream-skin-brand small"),
        status: chrome.querySelector(".dream-skin-status span"),
        quote: chrome.querySelector(".dream-skin-quote"),
        petMedia: chrome.querySelector(".ds2007-pet-media"),
        qqShowMedia: chrome.querySelector(".ds2007-qqshow-media"),
        windowTitle: chrome.querySelector(".ds2007-window-title"),
        statusCurrent: chrome.querySelector(".ds2007-status-current"),
        statusbarName: chrome.querySelector(".ds2007-statusbar b"),
        profileSignature: chrome.querySelector(".ds2007-profile-signature"),
        toolbar: chrome.querySelector(".ds2007-toolbar"),
        skinMenu: chrome.querySelector(".ds2007-skin-menu"),
        skinMenuTrigger: chrome.querySelector('[data-action="skin-menu"]'),
        openLocationProxy: chrome.querySelector(".ds2007-open-location-proxy"),
        nativeTab: chrome.querySelector('.ds2007-right-tab[data-action="native-panel"]'),
        friendTab: chrome.querySelector('.ds2007-right-tab[data-action="friend-expand"]'),
        nativeTabLabel: chrome.querySelector(".ds2007-native-tab-label"),
        nativeRailLabel: chrome.querySelector(".ds2007-native-rail-label"),
        nativeSkinToggle: chrome.querySelector(".ds2007-native-skin-toggle"),
      };
    }
    setTextContent(chromeParts.name, THEME.name || "Codex Dream Skin");
    setTextContent(chromeParts.subtitle, THEME.brandSubtitle || "CODEX DREAM SKIN");
    setTextContent(chromeParts.status, THEME.statusText || "DREAM SKIN ONLINE");
    setTextContent(chromeParts.quote, THEME.quote || "MAKE SOMETHING WONDERFUL");
    setTextContent(chromeParts.statusbarName, `${PROFILE.nickname || "张奈斯"} ${PROFILE.level || "LV07"}`);
    setTextContent(chromeParts.profileSignature, PROFILE.signature || "别迷恋姐，姐只是个传说。");
    const nativeReturnLabel = chromeParts.nativeSkinToggle?.querySelector?.("span");
    setTextContent(nativeReturnLabel, `返回 ${THEME.name || "皮肤"}`);
    chromeParts.nativeSkinToggle?.setAttribute?.("aria-label", `返回 ${THEME.name || "当前皮肤"}`);
    const statusLabel = PROFILE.status === "busy" ? "忙碌" : PROFILE.status === "offline" ? "离线" : "在线";
    setTextContent(chromeParts.statusCurrent, `● ${statusLabel}`);
    const petSnapshot = readCodexPetSnapshot();
    if (chromeParts.petMedia && petSnapshot) {
      if (chromeParts.petMedia.dataset.petSource !== "codex" ||
        chromeParts.petMedia.dataset.petAssetRef !== petSnapshot.assetRef) {
        chromeParts.petMedia.replaceChildren?.();
        chromeParts.petMedia.style.backgroundImage = petSnapshot.backgroundImage;
        chromeParts.petMedia.dataset.petSource = "codex";
        chromeParts.petMedia.dataset.petAssetRef = petSnapshot.assetRef;
      }
    } else if (chromeParts.petMedia?.appendChild && DECORATION_DATA.assistant) {
      const current = chromeParts.petMedia.querySelector?.(":scope > img");
      if (!current || current.src !== DECORATION_DATA.assistant) {
        const assistant = document.createElement("img");
        assistant.src = DECORATION_DATA.assistant;
        assistant.alt = "";
        chromeParts.petMedia.replaceChildren?.(assistant);
      }
      chromeParts.petMedia.style.backgroundImage = "";
      chromeParts.petMedia.dataset.petSource = "fallback";
      delete chromeParts.petMedia.dataset.petAssetRef;
    }
    if (chromeParts.qqShowMedia?.appendChild && DECORATION_DATA.qqShow) {
      const current = chromeParts.qqShowMedia.querySelector?.(":scope > img");
      if (!current || current.src !== DECORATION_DATA.qqShow) {
        const qqShow = document.createElement("img");
        qqShow.src = DECORATION_DATA.qqShow;
        qqShow.alt = "QQ 秀";
        chromeParts.qqShowMedia.replaceChildren?.(qqShow);
      }
      chromeParts.qqShowMedia.dataset.qqShowSource = "theme";
    }
    const sidebar = document.querySelector("aside.app-shell-left-panel:not(.ds2007-sidebar-peek)");
    bindInteraction(chromeParts.toolbar, "click", (event) => {
      const trigger = event.target?.closest?.('button[data-nav], button[data-action="skin-menu"]');
      if (!trigger) return;
      if (trigger.getAttribute("data-action") === "skin-menu") {
        event.preventDefault?.();
        event.stopPropagation?.();
        setSkinMenuOpen(trigger.getAttribute("aria-expanded") !== "true");
        return;
      }
      const nav = trigger.getAttribute("data-nav");
      activatePrimaryNav(nav);
    }, "bridgeBound");
    bindSkinMenuContents(chromeParts.skinMenu);
    syncSkinMenuSelection();
    bindInteraction(chromeParts.openLocationProxy, "click", (event) => {
      const source = document.querySelector?.('[data-ds2007-open-location-source="true"]');
      const nativeMenu = source?.querySelector?.('button[aria-label="次要操作"], button[aria-label="Secondary action"]');
      const nativePrimary = source?.matches?.("button")
        ? source
        : [...(source?.querySelectorAll?.("button") || [])].find((button) => button !== nativeMenu);
      const target = event.target?.closest?.(".ds2007-open-location-chevron")
        ? nativeMenu
        : nativePrimary;
      if (!target) return;
      const rect = target.getBoundingClientRect?.();
      const pointer = {
        bubbles: true,
        cancelable: true,
        clientX: rect ? rect.left + rect.width / 2 : 0,
        clientY: rect ? rect.top + rect.height / 2 : 0,
      };
      target.dispatchEvent?.(new PointerEvent("pointerdown", pointer));
      target.dispatchEvent?.(new MouseEvent("mousedown", pointer));
      target.dispatchEvent?.(new MouseEvent("mouseup", pointer));
      target.click?.();
    }, "openLocationProxyBound");
    bindNativeSkinRestore(chromeParts.nativeSkinToggle);
    if (sidebar) {
      if (created) cleanupLegacySidebarArtifacts(sidebar);
      styleSidebarSubtree(sidebar);
      bindInteraction(sidebar, "click", (event) => {
        if (!event.target?.closest?.('[data-app-action-sidebar-thread-row]')) return;
        clearNativeRightDock(root);
        if (chromeParts.openLocationProxy) chromeParts.openLocationProxy.hidden = true;
        setAttribute(root, "data-ds2007-open-location-pending", "true");
        scheduleOpenLocationSettle();
      }, "ds2007OpenLocationPending", true);
    }
    markPrimaryNavSources(sidebar);
    syncPrimaryNavToolbar(sidebar, chromeParts.toolbar);
    styleComposerSubtree(document.querySelector('.composer-surface-chrome, [class*="ComposerLayoutRoot"]'));
    if (created) {
      for (const message of document.querySelectorAll?.(".ds1907-message") || []) {
        message.classList.remove("ds1907-message");
        message.removeAttribute?.("data-ds1907-time");
      }
    }
    bindNativeRightToggleGuards(root);
    for (const trigger of chrome.querySelectorAll?.(
      '.ds2007-right-tabs [data-action], .ds2007-friends-tab [data-action]',
    ) || []) {
      bindInteraction(trigger, "click", () => {
        const action = trigger.getAttribute?.("data-action");
        const currentNativeRightState = readNativeRightState(shellMain);
        setAttribute(root, "data-ds2007-native-right", currentNativeRightState ? "open" : "closed");
        setAttribute(root, "data-ds2007-native-right-layout", currentNativeRightState?.layout || "none");
        if (action === "native-panel") {
          if (!currentNativeRightState) setNativeRightVisible(true);
          return;
        }
        if (action === "friend-expand" && currentNativeRightState) {
          setNativeRightVisible(false);
        }
        const next = action === "friend-expand" ? "expanded"
          : action === "friend-close" ? "closed" : "collapsed";
        setAttribute(root, "data-ds2007-friends", next);
        writeStoredJson(FRIENDS_KEY, next);
      }, "ds2007FriendBound");
    }
    const projectControl = home?.querySelector?.('.group\\/project-selector > button');
    const nativeHeaderNode = shellMain.querySelector?.(":scope > header.app-header-tint");
    const nativeTaskTitle = [...(nativeHeaderNode?.querySelectorAll?.(
      '[data-thread-title="true"], span.min-w-0.truncate',
    ) || [])]
      .find((candidate) => normalizedLabel(candidate));
    const activeTaskTitle = sidebar?.querySelector?.(
      '[data-app-action-sidebar-thread-active="true"] [data-thread-title="true"]',
    ) || document.querySelector?.(
      'aside.app-shell-left-panel [data-app-action-sidebar-thread-active="true"]',
    );
    const taskName = normalizedLabel(nativeTaskTitle) || normalizedLabel(activeTaskTitle);
    const projectControlName = normalizedLabel(projectControl).replace(/^(选择项目|当前项目)[·：:\s]*/, "");
    const nativeProjectButton = [...(shellMain.querySelectorAll?.(":scope > header.app-header-tint button[aria-label]") || [])]
      .find((candidate) => /^(项目|Project)[：:]/i.test(candidate.getAttribute?.("aria-label") || ""));
    const nativeOpenLocationButton = !home && [...(nativeHeaderNode?.querySelectorAll?.("button") || [])]
      .find((candidate) => /(打开位置|Open (project )?location)/i.test(normalizedLabel(candidate)) ||
        /(打开位置|Open (project )?location)/i.test(candidate.getAttribute?.("aria-label") || ""));
    syncOpenLocationProxy(nativeOpenLocationButton, chromeParts.openLocationProxy);
    const nativeProjectName = (nativeProjectButton?.getAttribute?.("aria-label") || "")
      .replace(/^(项目|Project)[：:\s]*/i, "");
    const contextName = taskName
      || nativeProjectName
      || (projectControlName === "选择项目" ? "" : projectControlName)
      || "未选择项目";
    setTextContent(chromeParts.windowTitle, "Codex 2026");
    const conversationLabelHost = shellMain.querySelector?.(".app-shell-main-content-viewport") || shellMain;
    let conversationLabel = shellMain.querySelector?.(".ds2007-conversation-label");
    if (taskName) {
      if (!conversationLabel) {
        conversationLabel = document.createElement("span");
        conversationLabel.className = "ds2007-conversation-label";
        conversationLabel.setAttribute("aria-hidden", "true");
      }
      if (conversationLabel.parentElement !== conversationLabelHost) {
        conversationLabelHost.appendChild(conversationLabel);
      }
      setTextContent(conversationLabel, taskName);
    } else {
      conversationLabel?.remove?.();
    }
    const nativeRightState = readNativeRightState(shellMain);
    const nativeRightOpen = Boolean(nativeRightState);
    markNativeRightDock(root, nativeRightState);
    chromeParts.nativeTab?.classList?.toggle?.("is-active", nativeRightOpen);
    chromeParts.friendTab?.classList?.toggle?.("is-active", !nativeRightOpen);
    if (chromeParts.nativeTab) setAttribute(chromeParts.nativeTab, "aria-selected", nativeRightOpen ? "true" : "false");
    if (chromeParts.friendTab) setAttribute(chromeParts.friendTab, "aria-selected", nativeRightOpen ? "false" : "true");
    setAttribute(root, "data-ds2007-native-right", nativeRightOpen ? "open" : "closed");
    setAttribute(root, "data-ds2007-native-right-layout", nativeRightState?.layout || "none");
    const activeNativeLabel = nativeRightLabel(nativeRightState?.owner);
    const activeNativeRailLabel = activeNativeLabel === "代码审查" ? "审查"
      : activeNativeLabel === "文件详情" ? "文件" : "环境";
    setAttribute(root, "data-ds2007-native-right-label", activeNativeLabel);
    setTextContent(chromeParts.nativeTabLabel, activeNativeLabel);
    setTextContent(chromeParts.nativeRailLabel, activeNativeRailLabel);
    const nativeRailButton = chromeParts.nativeRailLabel?.closest?.("button");
    if (nativeRailButton) setAttribute(nativeRailButton, "aria-label", `打开${activeNativeLabel}`);
    if (!root.getAttribute("data-ds2007-friends")) {
      const storedFriends = readStoredJson(FRIENDS_KEY, "expanded");
      setAttribute(root, "data-ds2007-friends", ["collapsed", "closed"].includes(storedFriends) ? storedFriends : "expanded");
    }
    const appRoot = shellMain.closest?.("body > *");
    appRoot?.classList?.add("ds2007-app-root");
    if (layout || created) syncFrameLayout(shellMain, chrome);
    chrome.classList.toggle("dream-skin-home-shell", Boolean(home));
    if (chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
  };

  const clearSkinVisualState = () => {
    const root = document.documentElement;
    root?.classList.remove("codex-dream-skin");
    root?.removeAttribute(SHELL_ATTR);
    for (const name of ART_ATTRS) root?.removeAttribute(name);
    root?.style.removeProperty("--dream-skin-art");
    for (const name of THEME_VARIABLES) root?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-home-utility").forEach((node) => node.classList.remove("dream-skin-home-utility"));
    document.querySelectorAll(".ds2007-app-root").forEach((node) => node.classList.remove("ds2007-app-root"));
    document.querySelectorAll('[data-ds2007-native-tabs], [data-ds2007-native-tab-toolbar], [data-ds2007-native-sidebar-toggle]')
      .forEach((node) => {
        node.removeAttribute?.("data-ds2007-native-tabs");
        node.removeAttribute?.("data-ds2007-native-tab-toolbar");
        node.removeAttribute?.("data-ds2007-native-sidebar-toggle");
      });
    document.querySelectorAll('[data-ds2007-sidebar-peek-host="true"]')
      .forEach((node) => {
        node.removeAttribute("data-ds2007-sidebar-peek-host");
        node.style.removeProperty("--ds2007-sidebar-peek-top");
      });
    document.querySelectorAll('[data-ds2007-synthetic-sidebar-class="true"]').forEach((node) => {
      node.classList.remove("app-shell-left-panel", "ds2007-sidebar-peek");
      node.removeAttribute("data-ds2007-synthetic-sidebar-class");
    });
    document.querySelectorAll(".ds2007-conversation-label, .ds2007-pinned-panel, .ds2007-context-menu")
      .forEach((node) => node.remove());
    document.querySelectorAll('[data-ds2007-open-location-source="true"]')
      .forEach(clearOpenLocationSource);
    cancelFrameLayout();
    cancelNativeTabLayout();
    cancelOpenLocationSettle();
    document.querySelectorAll(".ds2007-toolbar-duplicate, .ds2007-project-entry, .ds2007-pinned-source, .ds2007-section-label, [data-qq2007-styled], [data-qq2007-toolbar-duplicate], [data-ds2007-context-bound], [data-ds2007-collapse-bound], [data-ds2007-global-nav-source]")
      .forEach(clearSidebarMarker);
    document.querySelectorAll("[data-qq2007-composer-region], [data-qq2007-composer-control]")
      .forEach(clearComposerMarker);
    for (const group of SIDEBAR_SECTIONS.values()) root?.removeAttribute(`data-ds2007-collapse-${group}`);
  };

  const setSkinView = (view, { persist = true } = {}) => {
    skinView = view === "native" ? "native" : "deep";
    if (persist) {
      writeStoredJson(VIEW_KEY, skinView);
      writeStoredJson(VIEW_SCHEMA_KEY, VIEW_SCHEMA_VERSION);
    }
    syncSkinMenuSelection();
    if (skinView === "native") {
      setSkinMenuOpen(false);
      clearSkinVisualState();
      setAttribute(document.documentElement, "data-ds2007-view", "native");
      ensureStyle(document.documentElement);
      ensureNativeSkinNavigation();
      return;
    }
    document.querySelectorAll?.(".ds2007-native-skin-nav")?.forEach?.((node) => node.remove?.());
    document.documentElement?.removeAttribute?.("data-ds2007-native-nav");
    ensure({ root: true, route: true, layout: true });
  };
  const bindNativeSkinRestore = (button = document.getElementById(CHROME_ID)
    ?.querySelector?.(".ds2007-native-skin-toggle")) => {
    bindInteraction(button, "pointerdown", (event) => {
      event.stopPropagation?.();
    }, "skinRestorePointerBound", true);
    bindInteraction(button, "click", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      setSkinView("deep");
    }, "skinRestoreBound");
  };

  const ensure = ({ root: rootPass = true, route = true, layout = true } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    const nativeChrome = document.getElementById(CHROME_ID);
    if (skinView === "native" && nativeChrome) {
      ensureStyle(root);
      nativeChrome.dataset.ds2007Revision = "26";
      ensureNativeSkinNavigation();
      setAttribute(root, "data-ds2007-view", "native");
      return;
    }
    if (skinView !== "native") {
      document.querySelectorAll?.(".ds2007-native-skin-nav")?.forEach?.((node) => node.remove?.());
      root.removeAttribute?.("data-ds2007-native-nav");
    }
    metrics.ensureCalls += 1;
    const shell = rootPass ? applyRootState(root) : null;
    if (route) syncRouteState(shell, { layout });
    if (skinView === "native") setSkinView("native", { persist: false });
    else setAttribute(root, "data-ds2007-view", "deep");
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    clearSkinVisualState();
    disposeInteractions();
    document.querySelectorAll?.(".ds2007-native-skin-nav")?.forEach?.((node) => node.remove?.());
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    delete window[DISABLED_KEY];
    delete window[ANALYSIS_CACHE_KEY];
    return true;
  };

  const scheduler = { timeout: null, frame: null, root: false, route: false, layout: false };
  const flushScheduledEnsure = () => {
    if (scheduler.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduler.frame);
    }
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.frame = null;
    scheduler.timeout = null;
    const pending = { root: scheduler.root, route: scheduler.route, layout: scheduler.layout };
    scheduler.root = false;
    scheduler.route = false;
    scheduler.layout = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, route = true, layout = false } = {}) => {
    scheduler.root ||= root;
    scheduler.route ||= route;
    scheduler.layout ||= layout;
    if (scheduler.timeout || scheduler.frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      scheduler.frame = requestAnimationFrame(flushScheduledEnsure);
      scheduler.timeout = setTimeout(flushScheduledEnsure, 96);
    } else {
      scheduler.timeout = setTimeout(flushScheduledEnsure, 64);
    }
  };
  bindInteraction(document, "transitionend", (event) => {
    const target = event.target;
    if (target?.closest?.(`${NATIVE_RIGHT_PANEL_SELECTOR}, ${NATIVE_RIGHT_SIGNAL_SELECTOR}`) ||
      target?.querySelector?.(NATIVE_RIGHT_PORTAL_SELECTOR)) {
      scheduleEnsure({ route: true, layout: false });
    }
  }, "nativeRightTransitionBound");
  const observer = new MutationObserver((records) => {
    if (skinView === "native") {
      const navPresent = Boolean(document.querySelector?.(".ds2007-native-skin-nav"));
      const menubarChanged = records.some((record) => [...(record.addedNodes || []), ...(record.removedNodes || [])]
        .some((node) => node?.nodeType === 1 && (
          node.matches?.('[role="menubar"], .ds2007-native-skin-nav') ||
          node.querySelector?.('[role="menubar"], .ds2007-native-skin-nav')
        )));
      if (!navPresent || menubarChanged) scheduleEnsure({ root: false, route: false, layout: false });
      return;
    }
    let routeChanged = false;
    let frameChanged = false;
    const routeSelector = `main.main-surface, [role="main"], aside.app-shell-left-panel, header.app-header-tint, ${NATIVE_RIGHT_PANEL_SELECTOR}, ${NATIVE_RIGHT_SIGNAL_SELECTOR}, ${NATIVE_RIGHT_TOGGLE_SELECTOR}, ${NATIVE_TAB_PANEL_SELECTOR}, ${NATIVE_TAB_TOOLBAR_SELECTOR}`;
    const routeContextSelector = 'main.main-surface > header.app-header-tint, .group\\/project-selector, ' +
      'aside.app-shell-left-panel [data-app-action-sidebar-thread-row]';
    for (const record of records) {
      if (record.type === "attributes" && record.target?.closest?.(routeContextSelector)) {
        routeChanged = true;
        frameChanged = true;
      }
      if (record.type === "attributes" && (
        record.target?.matches?.(NATIVE_RIGHT_TOGGLE_SELECTOR) ||
        record.target?.closest?.(NATIVE_RIGHT_SIGNAL_SELECTOR) ||
        record.target?.closest?.(NATIVE_RIGHT_PANEL_SELECTOR)
      )) routeChanged = true;
      if (record.type === "characterData" && record.target?.parentElement?.closest?.(routeContextSelector)) {
        routeChanged = true;
        frameChanged = true;
      }
      for (const node of record.addedNodes || []) {
        if (node?.nodeType !== 1) {
          if (record.target?.closest?.(routeContextSelector)) routeChanged = true;
          continue;
        }
        if (node.id === CHROME_ID || node.id === STYLE_ID || node.closest?.(`#${CHROME_ID}`)) continue;
        if (codexPetSnapshot === null &&
          (node.matches?.(CODEX_PET_SELECTOR) || node.querySelector?.(CODEX_PET_SELECTOR))) {
          codexPetSnapshot = undefined;
          routeChanged = true;
        }
        markSidebarPeekSurface(node);
        styleSidebarSubtree(node);
        styleComposerSubtree(node);
        const nativeTabMount = node.matches?.(NATIVE_TAB_PANEL_SELECTOR) ||
          node.matches?.(NATIVE_TAB_TOOLBAR_SELECTOR) ||
          node.closest?.(NATIVE_TAB_PANEL_SELECTOR) ||
          node.querySelector?.(NATIVE_TAB_PANEL_SELECTOR) ||
          node.querySelector?.(NATIVE_TAB_TOOLBAR_SELECTOR);
        if (nativeTabMount) {
          const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
          syncNativeTabChrome(shellMain);
          routeChanged = true;
        }
        const sidebar = node.matches?.("aside.app-shell-left-panel")
          ? node
          : node.closest?.("aside.app-shell-left-panel") || node.querySelector?.("aside.app-shell-left-panel");
        if (sidebar) {
          markPrimaryNavSources(sidebar, node.contains?.(sidebar) ? sidebar : node);
          syncPrimaryNavToolbar(sidebar, chromeParts?.toolbar);
        }
        if (node.matches?.(routeSelector) || node.querySelector?.(routeSelector)) routeChanged = true;
        if (node.matches?.("header.app-header-tint") || node.querySelector?.("header.app-header-tint")) frameChanged = true;
      }
      for (const node of record.removedNodes || []) {
        if (node?.nodeType === 1 && (node.matches?.(routeSelector) || node.querySelector?.(routeSelector))) {
          routeChanged = true;
          if (node.matches?.("header.app-header-tint") || node.querySelector?.("header.app-header-tint")) frameChanged = true;
        }
      }
    }
    if (routeChanged) scheduleEnsure({ route: true, layout: frameChanged });
  });
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell || skinView === "native") return;
    scheduleEnsure({ root: true, route: false });
  });

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true, route: false });
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    rootObserver,
    timer: null,
    scheduler,
    mediaQuery,
    mediaHandler,
    disposeInteractions,
    cancelFrameLayout,
    cancelNativeTabLayout,
    cancelOpenLocationSettle,
    artUrl,
    installToken,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  bindInteraction(window, "resize", scheduleFrameLayout, "frameResizeBound");
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-current", "aria-pressed", "data-state",
      "data-app-action-sidebar-thread-active"],
    characterData: true,
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-appearance", "data-color-mode"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-theme", "data-appearance", "data-color-mode"],
    });
  }
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true, route: false, layout: false });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__)
