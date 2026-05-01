'use client'

// Local no-op replacement for `@viscalyx/developer-mode-react` aliased in via
// next.config.ts when ENABLE_DEVELOPER_MODE !== 'true'. Mirrors the package's
// own `dist/noop.js`: a Fragment-passthrough provider with the same default
// export shape so consumers (components/DeveloperModeProvider.tsx) compile
// unchanged.

import { Fragment, type ReactNode } from 'react'

export default function DeveloperModeProvider({
  children,
}: {
  children: ReactNode
  // The real provider also accepts `labels` and `navigationKey`. They are
  // intentionally ignored here; declaring the props loosely keeps the alias
  // swap invisible to callers.
  [key: string]: unknown
}) {
  return <Fragment>{children}</Fragment>
}
