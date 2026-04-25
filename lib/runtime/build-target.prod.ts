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
import type { BuildTarget } from './build-target'

export const BUILD_TARGET: BuildTarget = 'prod'

// Production OIDC providers must use https://. The insecure http:// path
// is physically absent from this build.
export const ALLOW_INSECURE_OIDC_ISSUER: boolean = false

// All cookies carry the Secure flag in production.
export const USE_INSECURE_COOKIE: boolean = false

// Strict production CSP — no unsafe-eval, no dev WebSocket connect-src.
export const USE_DEV_CSP: boolean = false
