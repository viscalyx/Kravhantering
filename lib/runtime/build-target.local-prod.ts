/**
 * Build-time configuration for the `local-prod` target.
 *
 * Used by `npm run build:local-prod` and `npm run start:prodlike`.
 * Frozen values appropriate for running the production bundle locally
 * against a dev Keycloak instance (http://) — never use in a real deployment.
 *
 * No `process.env` reads — all values are compile-time constants so webpack
 * can eliminate branches that are conditional on these flags.
 *
 * @see lib/runtime/build-target.ts for the full API contract.
 */
import type { AuthEnabledAtBuild, BuildTarget } from './build-target'

export const BUILD_TARGET: BuildTarget = 'local-prod'

// 'env' so that `start:prodlike:noauth` (which sets AUTH_ENABLED=false) still
// works. The prod target freezes this to `true`.
export const AUTH_ENABLED_AT_BUILD: AuthEnabledAtBuild = 'env'

// Allow auth to be disabled at runtime via AUTH_ALLOW_DISABLE_IN_PRODUCTION,
// needed for `start:prodlike:noauth`.
export const ALLOW_DISABLE_AUTH_IN_PREPROD: boolean = true

// Local Keycloak is served over http://.
export const ALLOW_INSECURE_OIDC_ISSUER: boolean = true

// Legacy header-trust path is not active in local-prod.
// When auth is disabled (noauth), requests are treated as anonymous.
export const ALLOW_LEGACY_HEADER_TRUST: boolean = false

// Set Secure on cookies — local-prod serves on http://localhost but we still
// test the production cookie posture; browsers allow Secure cookies on localhost.
export const COOKIE_SECURE: boolean = true

// Use strict production CSP.
export const USE_DEV_CSP: boolean = false
