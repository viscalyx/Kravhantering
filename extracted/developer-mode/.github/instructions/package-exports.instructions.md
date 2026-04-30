---
applyTo: '{packages/*/package.json,packages/*/tsdown.config.ts}'
---

# Package Exports & ESM-only Policy (AI-only instruction)

Every published package in this monorepo is **ESM-only**. There is
no CJS output, no `"main"` field, and no `require`-style entry
point. This is a deliberate launch-time decision documented in
[`RELEASING.md`](../../RELEASING.md). Do not add CJS output as an
ad-hoc change — it is a release-policy decision.

## `exports` map shape

Every package's `package.json` MUST follow this shape:

```jsonc
{
  "type": "module",
  "sideEffects": false,
  "files": ["dist", "README.md", "LICENSE"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./noop": {
      "types": "./dist/noop.d.ts",
      "import": "./dist/noop.js"
    },
    "./package.json": "./package.json"
  }
}
```

### Rules

- The `"types"` condition MUST come **first** inside every
  conditional block. Resolution order is significant — TypeScript
  must see the declaration before the implementation.
- Only the `"import"` condition is allowed. Do not add `"require"`,
  `"default"`, or `"node"` conditions; that would silently re-enable
  CJS resolution for some bundlers.
- Always expose `./package.json` so tooling (Vitest, Biome,
  bundler resolvers) can read metadata.
- The `./noop` subpath is a **convention** for SSR-disabled or
  feature-flag-off builds. Every package SHOULD ship one if its
  main entry has runtime side effects (a React provider, an event
  listener, a global registration). The `noop` build must be a
  no-op with the same public types as the main entry.

## SemVer impact of `exports` changes

- **Adding** a new subpath = `minor`.
- **Adding** a new conditional inside an existing subpath that
  expands resolution = `minor`.
- **Removing** or **renaming** a subpath = `major`.
- **Tightening** an existing subpath (e.g. removing the `./noop`
  alias, renaming `dist/index.js` to `dist/main.js`) = `major`.
- Changing only the **internal** path a subpath resolves to (e.g.
  `./dist/index.js` to `./dist/index.mjs`) without touching the
  public subpath name is still `major` for any consumer that
  deep-imports — be conservative and bump major.

## tsdown / build alignment

- `tsdown.config.ts` MUST list `format: ['esm']` only.
- `dts: true` MUST stay on so the `"types"` condition resolves.
- The `entry` keys in `tsdown.config.ts` MUST match the subpath
  names in `exports` (e.g. `index` and `noop`).
- React packages MUST list `react`, `react-dom`, and
  `react/jsx-runtime` in `external` so they remain peer
  dependencies and are not bundled.

## When you change `exports`

1. Update `tsdown.config.ts` so the matching `entry` exists.
2. Update the package `README.md` import examples.
3. Add a changeset with the appropriate bump (see above).
