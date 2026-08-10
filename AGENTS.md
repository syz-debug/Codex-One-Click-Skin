# Project Rules

## Purpose

Codex One-Click Skin is a reversible Windows Codex renderer theming tool. It must preserve native Codex behavior while applying image-driven visual themes.

## Runtime

- Requires Windows, PowerShell and Node.js 22+.
- Uses loopback-only Chrome DevTools Protocol injection.
- Never modify `WindowsApps`, `app.asar`, Codex signatures, accounts or API settings.
- Keep install, start, verify and restore flows reversible.

## Source Layout

- `assets/`: renderer CSS, injector and visual assets.
- `scripts/`: installation, runtime injection, theme management and verification.
- `presets/`: bundled themes and their metadata.
- `tests/`: configuration, payload and renderer regression tests.
- `docs/quality-constraints.md`: authoritative layout and interaction contract.

## Engineering Rules

- Preserve real Codex inputs, buttons, menus, tabs, panels and accessibility semantics.
- Decorative DOM must not intercept pointer events.
- Prefer stable data attributes and ARIA semantics over generated class hashes.
- Keep mutation synchronization idempotent and safe across route changes.
- Validate primary controls and secondary panels across the four viewport sizes in `scripts/layout-check.mjs`.
- Do not remove third-party copyright notices required by included licenses.

## Verification

Run before release:

```powershell
node --check .\assets\renderer-inject.js
node --check .\scripts\injector.mjs
node --check .\scripts\layout-check.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
node .\scripts\injector.mjs --check-payload --theme-dir .\presets\preset-codex-1907-deep
node .\scripts\layout-check.mjs 9335
git diff --check
```

Update `README.md`, `CHANGELOG.md`, package version and injector version together for a release.
