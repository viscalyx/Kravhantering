# Architecture

`@viscalyx/developer-mode` ships as two npm packages so consumers
only pull in what they need.

```text
┌──────────────────────────────────┐
│  @viscalyx/developer-mode-react  │  ← React 19 provider + overlay
│  (peer-deps on react, react-dom) │
└──────────────┬───────────────────┘
               │ depends on
               ▼
┌──────────────────────────────────┐
│  @viscalyx/developer-mode-core   │  ← framework-agnostic helpers
│  (no React, no DOM dependencies  │
│   beyond standard `lib.dom.d.ts`) │
└──────────────────────────────────┘
```

## `@viscalyx/developer-mode-core`

Pure TypeScript, framework-agnostic. Owns:

- The shortcut constants (`DEVELOPER_MODE_SHORTCUT_*`) and the
  `matchesDeveloperModeShortcut` predicate.
- The marker prop helpers (`devMarker`, `noopDevMarker`,
  `normalizeDeveloperModeText`).
- The label-derivation pipeline that walks an `HTMLElement`'s
  attributes / role / text and produces a stable
  `DeveloperModeTarget` (`findDeveloperModeTargetAt`,
  `scanVisibleDeveloperModeTargets`).
- The copy-text and chip-label formatters
  (`buildDeveloperModeCopyText`, `buildDeveloperModeChipLabel`).

Subpaths:

- `.` — full implementation.
- `./noop` — same exports, all no-ops. For SSR or feature-flag-off
  builds where you want to keep the import sites intact without
  shipping the real logic.

## `@viscalyx/developer-mode-react`

Thin React 19 layer on top of the core. Owns:

- `DeveloperModeProvider` (default export) — a `'use client'`
  provider that wires the shortcut listener, hover scanner,
  overlay portal, and clipboard copy with a transient toast.
- `DeveloperModeProviderProps` and `DeveloperModeLabels` —
  consumer-supplied i18n labels.

Subpaths:

- `.` — full provider + overlay.
- `./noop` — `DeveloperModeProvider` becomes
  `({ children }) => <>{children}</>` with the same props
  signature. Use this in SSR-only contexts or when developer mode
  is disabled by a feature flag at build time.

`react` and `react-dom` are **peer dependencies**. The package
does not bundle them; consumers pick the React version. The
`peerDependencies` range is `^19.0.0` because the package uses
React 19 server-component-aware behaviour.

## ESM-only

Both packages publish only the ESM build (`dist/index.js`,
`dist/noop.js`, plus matching `.d.ts`). No `"main"`, no `"require"`
condition, no CJS shim. See
[`RELEASING.md`](../RELEASING.md#esm-only-policy).

## Build pipeline

Each package has its own `tsdown.config.ts`. `tsdown` (Rolldown
under the hood) emits ESM `.js` and `.d.ts` from one config. The
React package marks `react`, `react-dom`, `react/jsx-runtime`, and
`@viscalyx/developer-mode-core` as `external` so they stay as
peer deps / runtime imports rather than getting bundled in.

## Versioning

The two packages version **independently** via Changesets
(`fixed: []`, `linked: []` in `.changeset/config.json`). A change
that touches only the React package does not bump the core, and
vice versa.
