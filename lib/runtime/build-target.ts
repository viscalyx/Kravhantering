/**
 * Build-time configuration for the `dev` target.
 *
 * This file is the canonical import for build-time constants:
 *   import { USE_INSECURE_COOKIE, ... } from '@/lib/runtime/build-target'
 *
 * Webpack and Turbopack (next.config.ts) alias this path to the concrete
 * implementation that matches the BUILD_TARGET env var at build time:
 *   - BUILD_TARGET=dev          → build-target.ts (this file)
 *   - BUILD_TARGET=local-prod   → build-target.local-prod.ts
 *   - BUILD_TARGET=prod         → build-target.prod.ts
 *
 * Vitest always resolves to this file (see vitest.config.ts alias).
 * Never import the concrete `.dev.ts` / `.local-prod.ts` / `.prod.ts` files
 * directly — always import from `@/lib/runtime/build-target`.
 */

export type BuildTarget = 'dev' | 'local-prod' | 'prod'

export const BUILD_TARGET: BuildTarget = 'dev'

/**
 * Allow an `http://` OIDC issuer URL (local Keycloak). Always `false` in
 * the `prod` target so the OIDC client never silently accepts plaintext OIDC.
 */
export const ALLOW_INSECURE_OIDC_ISSUER: boolean = true

/**
 * Omit the `Secure` flag on session and login-state cookies.
 * `true` in dev so http://localhost works without HTTPS.
 */
export const USE_INSECURE_COOKIE: boolean = true

/**
 * Use the permissive dev CSP (adds `unsafe-eval` and WebSocket connect-src).
 * `false` in `local-prod` and `prod` targets.
 */
export const USE_DEV_CSP: boolean = true
