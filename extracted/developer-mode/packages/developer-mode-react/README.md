# @viscalyx/developer-mode-react

React overlay and provider for the Developer Mode runtime.

## Overview

`@viscalyx/developer-mode-react` is the UI layer that turns
`@viscalyx/developer-mode-core` targets into a usable in-browser inspection
experience. It mounts a client-side provider that:

- toggles Developer Mode with the shared keyboard shortcut
- tracks the hovered element
- resolves the best matching Developer Mode target
- renders a highlight outline, chip, badge, and copy toast
- copies deterministic payloads to the clipboard

This package does not define the marker contract itself. It expects the DOM to
contain curated or discoverable targets from
[`@viscalyx/developer-mode-core`](../developer-mode-core/README.md).

## When To Use This Package

Use `@viscalyx/developer-mode-react` when you want a ready-made React runtime
instead of building your own overlay on top of the core package.

This package is a good fit when you need:

- a `DeveloperModeProvider` that wraps an existing React application
- a visible overlay for hovered targets
- copy-to-clipboard behavior for stable developer references
- host-provided English badge and toast labels
- a no-op provider entrypoint for builds that must exclude the real runtime

If you only need marker helpers or target scanning, use
[`@viscalyx/developer-mode-core`](../developer-mode-core/README.md) by itself.

## Installation

```bash
npm install --save-dev @viscalyx/developer-mode-react \
  @viscalyx/developer-mode-core
```

Peer dependencies:

- `react`
- `react-dom`

### Current Repo Usage

In this repository, the package is currently consumed as a local
`devDependency`:

```json
"@viscalyx/developer-mode-react": "file:packages/developer-mode-react"
```

The application wraps the package in a small adapter:

- [`components/DeveloperModeProvider.tsx`](../../components/DeveloperModeProvider.tsx)

That adapter supplies stable, English Developer Mode labels and a
route-derived `navigationKey`. This is the recommended integration style for
future consumers too.

## Quick Start

### 1. Wrap your app

```tsx
'use client'

import DeveloperModeProvider from '@viscalyx/developer-mode-react'

export function AppDeveloperMode({
  children,
  navigationKey,
}: {
  children: React.ReactNode
  navigationKey?: string | null
}) {
  return (
    <DeveloperModeProvider
      labels={{
        badge: 'Developer Mode',
        copied: 'Copied',
        copyFailed: 'Copy failed',
      }}
      navigationKey={navigationKey}
    >
      {children}
    </DeveloperModeProvider>
  )
}
```

### 2. Mark the UI with core markers

```tsx
import { devMarker } from '@viscalyx/developer-mode-core'

export function ColumnPickerButton() {
  return (
    <button
      {...devMarker({
        context: 'requirements table',
        name: 'floating pill',
        value: 'columns',
      })}
      type="button"
    >
      Columns
    </button>
  )
}
```

### 3. Toggle Developer Mode in the browser

Focus a non-editable part of the page, then press
`Mod+Alt+Shift+H`.

- macOS: `Command+Option+Shift+H`
- Windows/Linux: `Ctrl+Alt+Shift+H`

## Provider API

The package exports a default `DeveloperModeProvider` component with this
practical contract:

```ts
interface DeveloperModeProviderProps {
  children: ReactNode
  labels: {
    badge: string
    copied: string
    copyFailed: string
  }
  navigationKey?: string | null
}
```

Required behavior:

- `children`: the wrapped application tree
- `labels.badge`: English badge text shown while Developer Mode is enabled
- `labels.copied`: English success prefix for copied payload toasts
- `labels.copyFailed`: English failure prefix for clipboard errors
- `navigationKey`: optional route or state key that clears stale hover state
  when navigation changes

The package also exports the corresponding `DeveloperModeLabels` and
`DeveloperModeProviderProps` types.

## Runtime Behavior

`DeveloperModeProvider` is a client component. When enabled, it:

- listens for the shared keyboard shortcut
- ignores shortcut toggles inside editable controls
- listens for pointer movement across the document
- resolves the best target with
  `findDeveloperModeTargetAt(...)` from the core package
- renders the overlay through a React portal attached to `document.body`
- copies `buildDeveloperModeCopyText(...)` payloads on chip click
- shows a transient success or error toast

The enabled state is in-memory only. It survives client-side navigation if the
provider stays mounted, but resets on a hard reload.

## No-Op And Production Exclusion

The package exposes a `./noop` entrypoint whose provider simply renders
`children` without mounting the real overlay runtime:

```tsx
import DeveloperModeProvider from '@viscalyx/developer-mode-react/noop'
```

As with the core package, most host applications should prefer build-time
aliasing over direct component-level imports of the no-op entrypoint.

In this repository:

- local development uses the real provider
- non-development builds alias the package to
  `packages/developer-mode-react/src/noop.tsx` unless
  `ENABLE_DEVELOPER_MODE=true`

See [Developer Mode Overlay](../../docs/developer-mode-overlay.md) for the
repo-specific build wiring and maintenance rules.

## Using With @viscalyx/developer-mode-core

These packages are designed to be used together:

- `@viscalyx/developer-mode-core` authors and discovers targets
- `@viscalyx/developer-mode-react` renders and operates the overlay

Recommended composition:

1. Put all marker authoring behind a host helper such as
   `lib/developer-mode-markers.ts`.
2. Wrap the app with a host adapter around `DeveloperModeProvider`.
3. Supply English Developer Mode badge and toast labels from the host app.
4. Pass a route-derived `navigationKey` if your app has client-side navigation.
5. Use build-time aliasing to swap both packages to their `./noop` variants in
   production.

In this repository, that adapter flow looks like:

- markers:
  [`lib/developer-mode-markers.ts`](../../lib/developer-mode-markers.ts)
- provider adapter:
  [`components/DeveloperModeProvider.tsx`](../../components/DeveloperModeProvider.tsx)
- build aliasing:
  [`next.config.ts`](../../next.config.ts)

## Notes For Host Applications

- Keep marker names and copied payload values in English, even if the
  surrounding UI is localized.
- Provide English badge and toast strings from the host app instead of
  hardcoding them inside the package.
- Use a stable `navigationKey` whenever route transitions can leave stale hover
  targets behind.
- Prefer mounting the provider near the top of the client app shell so it can
  observe the whole page.
- Treat this package as a debugging and authoring aid, not a production-facing
  UI feature.
