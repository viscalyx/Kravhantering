// Local no-op replacement for `@viscalyx/developer-mode-core` aliased in via
// next.config.ts when ENABLE_DEVELOPER_MODE !== 'true'. Mirrors the package's
// own `dist/noop.js` API surface so the rest of the codebase can import the
// public package specifier without dragging the real implementation (or the
// package itself) into production builds.
//
// Keep this in sync with the symbols re-exported by
// `@viscalyx/developer-mode-core/noop` (currently `devMarker`,
// `noopDevMarker`). Type-only imports continue to resolve through the real
// package's `.` entry, so this file deliberately exports values only.

export function devMarker(_input: unknown): Record<string, never> {
  return {}
}

export function noopDevMarker(): Record<string, never> {
  return {}
}
