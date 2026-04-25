/**
 * Build-time configuration for the `prod` target.
 *
 * Used by `npm run build:prod` (and the `build` alias). All values are
 * compile-time constants — no `process.env` reads — so webpack dead-code
 * elimination removes every dev/escape-hatch branch from the bundle.
 *
 * CRITICAL: never add `process.env` reads to this file. The CI bundle-
 * verification script (`scripts/verify-prod-bundle.mjs`) confirms that
 * forbidden dev tokens do not appear in `.next/server` or `.next/static`.
 *
 * @see lib/runtime/build-target.ts for the full API contract.
 */
import type { AuthEnabledAtBuild, BuildTarget } from './build-target'

export const BUILD_TARGET: BuildTarget = 'prod'

// Auth is always enabled in production. This is a frozen constant so
// webpack eliminates the AUTH_ENABLED=false short-circuit entirely.
export const AUTH_ENABLED_AT_BUILD: AuthEnabledAtBuild = true

// Auth cannot be disabled at runtime in production builds.
export const ALLOW_DISABLE_AUTH_IN_PREPROD: boolean = false

// Production OIDC providers must use https://. The insecure http:// path
// is physically absent from this build.
export const ALLOW_INSECURE_OIDC_ISSUER: boolean = false

// Legacy x-user-id / x-user-roles header-trust path is absent from prod.
export const ALLOW_LEGACY_HEADER_TRUST: boolean = false

// All cookies carry the Secure flag in production.
export const COOKIE_SECURE: boolean = true

// Strict production CSP — no unsafe-eval, no dev WebSocket connect-src.
export const USE_DEV_CSP: boolean = false
