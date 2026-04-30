# `@viscalyx/developer-mode`

A small TypeScript library monorepo that ships an in-app
"developer mode" overlay: hover any UI element with a keyboard
shortcut to see how it would be referred to in test selectors,
documentation, or QA notes, then copy that label to the clipboard.

This repository was extracted from
[`viscalyx/Kravhantering`](https://github.com/viscalyx/Kravhantering)
where it shipped as in-tree workspaces.

## Packages

<!-- markdownlint-disable MD013 -->

| Package | npm | Description |
| --- | --- | --- |
| [`@viscalyx/developer-mode-core`](./packages/developer-mode-core/README.md) | `npm i @viscalyx/developer-mode-core` | Framework-agnostic helpers, marker functions, and the visible-target scanner. No React dependency. |
| [`@viscalyx/developer-mode-react`](./packages/developer-mode-react/README.md) | `npm i @viscalyx/developer-mode-react` | React 19 provider and overlay. Peer-deps on `react` and `react-dom`. Re-exports types from the core. |

<!-- markdownlint-enable MD013 -->

Both packages are **ESM-only**, target Node ≥ 22, and follow
SemVer via [Changesets](https://github.com/changesets/changesets).

## Quick start

```ts
import { devMarker } from '@viscalyx/developer-mode-core'

const props = devMarker({ name: 'button', value: 'Save' })
// → { 'data-developer-mode-name': 'button',
//     'data-developer-mode-value': 'Save' }
```

```tsx
import DeveloperModeProvider from '@viscalyx/developer-mode-react'

export default function Layout({ children }) {
  return (
    <DeveloperModeProvider
      labels={{
        badge: 'Dev mode',
        copied: 'Copied to clipboard',
        copyFailed: 'Copy failed',
      }}
    >
      {children}
    </DeveloperModeProvider>
  )
}
```

For SSR or feature-flag-off builds, import the `./noop` subpath of
either package — the API is identical and every export is a no-op.

## Development

```bash
nvm install            # picks up the version in .nvmrc (Node 22+)
npm install
npm run check          # type-check, format, lint, build, tests, md
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full local
workflow and [`RELEASING.md`](./RELEASING.md) for the release flow
(including the **ESM-only** policy).

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — how the two
  packages relate.
- [`docs/workflows.md`](./docs/workflows.md) — what each CI
  workflow does.

## License

[MIT](./LICENSE) © Viscalyx
