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
import type { BuildTarget } from './build-target'

export const BUILD_TARGET: BuildTarget = 'local-prod'

// Local Keycloak is served over http://.
export const ALLOW_INSECURE_OIDC_ISSUER: boolean = true

// Set Secure on cookies — local-prod serves on http://localhost but we still
// test the production cookie posture; browsers allow Secure cookies on localhost.
export const USE_INSECURE_COOKIE: boolean = false

// Use strict production CSP.
export const USE_DEV_CSP: boolean = false
