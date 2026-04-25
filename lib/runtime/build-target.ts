/**
 * Build-time configuration for the `dev` target.
 *
 * This file is the canonical import for build-time constants:
 *   import { COOKIE_SECURE, ... } from '@/lib/runtime/build-target'
 *
 * Webpack (next.config.ts) aliases this path to the concrete implementation
 * that matches the BUILD_TARGET env var at build time:
 *   - BUILD_TARGET=dev          → build-target.ts (this file)
 *   - BUILD_TARGET=local-prod   → build-target.local-prod.ts
 *   - BUILD_TARGET=prod         → build-target.prod.ts
 *
 * Vitest always resolves to this file (see vitest.config.ts alias).
 * Never import the concrete `.dev.ts` / `.local-prod.ts` / `.prod.ts` files
 * directly — always import from `@/lib/runtime/build-target`.
 */

export type BuildTarget = 'dev' | 'local-prod' | 'prod'
/**
 * `true` / `false` means auth is frozen at build time.
 * `'env'`  means read `process.env.AUTH_ENABLED` at runtime (dev and
 *          local-prod only — this value never appears in the prod target).
 */
export type AuthEnabledAtBuild = boolean | 'env'

export const BUILD_TARGET: BuildTarget = 'dev'

/**
 * Whether auth enablement is determined at runtime (`'env'`) or frozen
 * at build time (`true`). The `prod` target always returns `true`.
 */
export const AUTH_ENABLED_AT_BUILD: AuthEnabledAtBuild = 'env'

/**
 * Allow `AUTH_ALLOW_DISABLE_IN_PRODUCTION` env var to disable auth at
 * runtime when `NODE_ENV=production`. Only meaningful when
 * `AUTH_ENABLED_AT_BUILD === 'env'`. Always `false` in the `prod` target.
 */
export const ALLOW_DISABLE_AUTH_IN_PREPROD: boolean = true

/**
 * Allow an `http://` OIDC issuer URL (local Keycloak). Always `false` in
 * the `prod` target so the OIDC client never silently accepts plaintext OIDC.
 */
export const ALLOW_INSECURE_OIDC_ISSUER: boolean = true

/**
 * Allow the legacy `x-user-id` / `x-user-roles` header-trust path when
 * auth is disabled (`AUTH_ENABLED=false`). Used by `dev:noauth` and unit
 * tests. Always `false` in `local-prod` and `prod` targets.
 */
export const ALLOW_LEGACY_HEADER_TRUST: boolean = true

/**
 * Set the `Secure` flag on session and login-state cookies.
 * `false` in dev so http://localhost works without HTTPS.
 */
export const COOKIE_SECURE: boolean = false

/**
 * Use the permissive dev CSP (adds `unsafe-eval` and WebSocket connect-src).
 * `false` in `local-prod` and `prod` targets.
 */
export const USE_DEV_CSP: boolean = true
