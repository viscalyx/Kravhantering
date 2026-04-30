# @viscalyx/developer-mode-core

Framework-agnostic Developer Mode utilities for marker-backed UI discovery,
stable naming, copy payload generation, and viewport scanning.

## Overview

`@viscalyx/developer-mode-core` is the low-level package behind the
Developer Mode overlay. It does not render any UI. Instead, it provides the
shared contract that host applications and UI runtimes use to:

- emit curated `data-developer-mode-*` markers
- normalize marker text and values
- scan visible DOM targets
- resolve the best target under the pointer
- build deterministic chip labels and copy payloads
- detect the Developer Mode keyboard shortcut

Use this package when you want a reusable naming layer that can be consumed by
an overlay, inspector, test helper, or custom debugging tool.

## When To Use This Package

Use `@viscalyx/developer-mode-core` when you need one or more of these
capabilities:

- a stable marker API for important UI surfaces
- deterministic copy text such as `requirements table > column header:
  requirement id`
- a consistent keyboard shortcut contract for toggling developer tooling
- DOM scanning helpers that prefer curated markers but can fall back to
  semantic roles and stable labels
- a no-op marker helper for production builds that should not emit marker
  attributes

If you also want a ready-made React overlay, use this package together with
[`@viscalyx/developer-mode-react`](../developer-mode-react/README.md).

## Installation

```bash
npm install --save-dev @viscalyx/developer-mode-core
```

### Current Repo Usage

In this repository, the package is currently consumed as a local
`devDependency`:

```json
"@viscalyx/developer-mode-core": "file:packages/developer-mode-core"
```

App code does not import the package directly from every component. Instead, it
routes marker creation through a small host adapter:

- [`lib/developer-mode-markers.ts`](../../lib/developer-mode-markers.ts)

That pattern is recommended for future consumers too, because it gives the host
application one place to centralize naming conventions, helper wrappers, and
future no-op behavior.

## Quick Start

### 1. Mark important UI surfaces

```tsx
import { devMarker } from '@viscalyx/developer-mode-core'

export function RequirementsHeader() {
  return (
    <button
      {...devMarker({
        context: 'requirements table',
        name: 'column header',
        value: 'requirement id',
        priority: 500,
      })}
      type="button"
    >
      Requirement ID
    </button>
  )
}
```

When Developer Mode is enabled, `devMarker(...)` emits curated
`data-developer-mode-*` attributes. When the package is aliased to its
`./noop` entrypoint, the same call returns `{}` so production HTML stays clean.

### 2. Resolve visible targets

```ts
import {
  findDeveloperModeTargetAt,
  scanVisibleDeveloperModeTargets,
} from '@viscalyx/developer-mode-core'

const hoveredTarget = findDeveloperModeTargetAt(event.target as HTMLElement)
const visibleTargets = scanVisibleDeveloperModeTargets(document.body)
```

### 3. Build stable copy text

```ts
import { buildDeveloperModeCopyText } from '@viscalyx/developer-mode-core'

const payload = buildDeveloperModeCopyText({
  context: 'requirements table',
  name: 'column header',
  value: 'requirement id',
})

// "requirements table > column header: requirement id"
```

## Marker API

The main authoring API is `devMarker(...)`.

```ts
devMarker({
  name: 'column header',
  context: 'requirements table',
  value: 'requirement id',
  priority: 500,
})
```

Supported input fields:

- `name`: required canonical English label
- `context`: optional English parent context
- `value`: optional English or runtime value
- `priority`: optional numeric override used to win collisions

When enabled, the helper emits:

- `data-developer-mode-name`
- `data-developer-mode-context`
- `data-developer-mode-value`
- `data-developer-mode-priority`

The package also exports:

- `noopDevMarker()`: always returns `{}`
- `normalizeDeveloperModeText(value)`: collapses whitespace and removes empty
  strings

## API Overview

This package intentionally exposes a small practical surface:

- `devMarker(...)` and `noopDevMarker()` for DOM authoring
- `buildDeveloperModeCopyText(...)` for deterministic copied references
- `buildDeveloperModeChipLabel(...)` for compact overlay labels
- `matchesDeveloperModeShortcut(...)` plus shortcut constants for keyboard
  activation
- `isEditableTarget(...)` to ignore toggles inside inputs and editable regions
- `findDeveloperModeTargetAt(...)` to resolve the best target from a hovered DOM
  element
- `scanVisibleDeveloperModeTargets(...)` to scan the viewport for visible
  targets
- shared types such as `DeveloperModeDescriptor`, `DeveloperModeTarget`, and
  `DeveloperModeMarkerInput`

## Scanning And Fallback Behavior

The scanner prefers curated markers first, then falls back to a bounded set of
generic heuristics.

Priority order:

1. explicit `data-developer-mode-*` markers
2. known product hooks such as `data-floating-action-rail`
3. semantic roles such as `dialog`, `tab`, `tabpanel`, and `navigation`
4. `aria-label` and `title`
5. stable visible text
6. `data-testid`

The scanner only returns targets that are currently visible in the viewport and
skips:

- hidden or `aria-hidden` nodes
- zero-sized elements
- offscreen elements
- the Developer Mode overlay itself

## Shortcut Contract

The package exports the shared shortcut constants:

- `DEVELOPER_MODE_SHORTCUT_LABEL`: `Mod+Alt+Shift+H`
- `DEVELOPER_MODE_SHORTCUT_KEY`: `h`
- `DEVELOPER_MODE_SHORTCUT_CODE`: `KeyH`

Use `matchesDeveloperModeShortcut(...)` instead of comparing raw key values
yourself. It accepts either the physical `KeyH` code or a matching lowercase
`key`, which keeps the shortcut stable even when modifier keys alter the typed
character on some keyboard layouts.

## No-Op And Production Exclusion

The package exposes a `./noop` entrypoint for builds that should keep the call
sites but remove the marker output:

```ts
import { devMarker } from '@viscalyx/developer-mode-core/noop'
```

In practice, most applications should not import `./noop` directly from
components. Instead, configure a build-time alias so the main package resolves
to `./noop` in production or other non-debug builds.

In this repository:

- local development uses the real package
- non-development builds alias the package to
  `packages/developer-mode-core/src/noop.ts` unless
  `ENABLE_DEVELOPER_MODE=true`

See [Developer Mode Overlay](../../docs/developer-mode-overlay.md) for the
repo-specific build wiring.

## Used Together With @viscalyx/developer-mode-react

`@viscalyx/developer-mode-core` provides the contract and scanning logic.
`@viscalyx/developer-mode-react` provides the visible overlay and interaction
layer.

Typical division of responsibility:

- core:
  - marker helpers
  - target discovery
  - copy text and chip label formatting
  - shortcut matching
- react:
  - provider lifecycle
  - pointer tracking
  - portal rendering
  - copy toast and overlay chip UI

Minimal combined example:

```tsx
import { devMarker } from '@viscalyx/developer-mode-core'
import DeveloperModeProvider from '@viscalyx/developer-mode-react'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DeveloperModeProvider
      labels={{
        badge: 'Developer Mode',
        copied: 'Copied',
        copyFailed: 'Copy failed',
      }}
    >
      <main {...devMarker({ name: 'main content' })}>{children}</main>
    </DeveloperModeProvider>
  )
}
```

For a fuller React integration guide, see
[`packages/developer-mode-react/README.md`](../developer-mode-react/README.md).

## Notes For Host Applications

- Keep curated labels in English, even if the product UI is localized.
- Prefer a host-side adapter such as `lib/developer-mode-markers.ts` so app code
  does not hardcode package-specific policy everywhere.
- Use curated markers for important product surfaces first, then rely on
  fallback scanning only for generic coverage.
- Keep copied payloads deterministic. A stable `context > name: value` format
  makes prompts and support notes much easier to reuse.
- Treat `priority` as an escape hatch. Use it only when two nearby candidates
  would otherwise compete for the same overlay region.
