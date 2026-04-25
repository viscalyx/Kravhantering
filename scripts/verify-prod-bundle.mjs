#!/usr/bin/env node
/**
 * verify-prod-bundle.mjs
 *
 * Two-part guard for the prod runtime posture:
 *
 * 1. **Build-target file check** (always runs; cheap; suitable for
 *    `npm run check`). Loads `lib/runtime/build-target.prod.ts` at
 *    runtime via Node's native TypeScript stripping (Node 22.6+) and
 *    asserts the file exports exactly the expected named constants with
 *    the expected production values. Any extra/missing export, or any
 *    drifted value, fails the script.
 *
 * 2. **Bundle grep** (runs when `.next/server` and `.next/static` exist).
 *    Greps the production Next.js bundle output for tokens that must
 *    never appear in real production bundles — dev escape hatches,
 *    placeholder values, legacy bypass strings, and build-time-only
 *    validator code.
 *
 * Run after `npm run build` (BUILD_TARGET=prod) via:
 *   npm run verify:prod-bundle
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SERVER_DIR = resolve(ROOT, '.next/server')
const STATIC_DIR = resolve(ROOT, '.next/static')

// ---------------------------------------------------------------------------
// Part 1 — build-target.prod.ts runtime check
// ---------------------------------------------------------------------------

/**
 * Exact contract for the prod build target. Any divergence — extra export,
 * missing export, or drifted value — fails the verification.
 */
const EXPECTED_PROD_EXPORTS = Object.freeze({
  ALLOW_INSECURE_OIDC_ISSUER: false,
  BUILD_TARGET: 'prod',
  USE_DEV_CSP: false,
  USE_INSECURE_COOKIE: false,
})

const BUILD_TARGET_PROD_PATH = resolve(
  ROOT,
  'lib/runtime/build-target.prod.ts',
)

let failed = false

async function verifyBuildTargetProd() {
  if (!existsSync(BUILD_TARGET_PROD_PATH)) {
    console.error(
      `[verify-prod-bundle] Missing build-target file: ${BUILD_TARGET_PROD_PATH}`,
    )
    failed = true
    return
  }

  let mod
  try {
    mod = await import(pathToFileURL(BUILD_TARGET_PROD_PATH).href)
  } catch (err) {
    console.error(
      `[verify-prod-bundle] Failed to import ${BUILD_TARGET_PROD_PATH}:`,
      err instanceof Error ? err.message : err,
    )
    console.error(
      '  Requires Node.js >= 22.6 with native TypeScript stripping.',
    )
    failed = true
    return
  }

  const expectedKeys = Object.keys(EXPECTED_PROD_EXPORTS).sort()
  const actualKeys = Object.keys(mod)
    .filter(k => k !== 'default' && k !== '__esModule')
    .sort()

  const extras = actualKeys.filter(k => !(k in EXPECTED_PROD_EXPORTS))
  const missing = expectedKeys.filter(k => !actualKeys.includes(k))

  if (extras.length > 0) {
    console.error(
      `[verify-prod-bundle] build-target.prod.ts exports UNEXPECTED constants: ${extras.join(', ')}`,
    )
    console.error(
      `  Update EXPECTED_PROD_EXPORTS in scripts/verify-prod-bundle.mjs if this is intentional.`,
    )
    failed = true
  }
  if (missing.length > 0) {
    console.error(
      `[verify-prod-bundle] build-target.prod.ts is MISSING required constants: ${missing.join(', ')}`,
    )
    failed = true
  }

  for (const [key, expected] of Object.entries(EXPECTED_PROD_EXPORTS)) {
    if (!(key in mod)) continue
    if (mod[key] !== expected) {
      console.error(
        `[verify-prod-bundle] build-target.prod.ts: ${key} = ${JSON.stringify(mod[key])} (expected ${JSON.stringify(expected)})`,
      )
      failed = true
    }
  }

  if (!failed) {
    console.log(
      '[verify-prod-bundle] OK — build-target.prod.ts exports match the expected prod contract.',
    )
  }
}

await verifyBuildTargetProd()

// ---------------------------------------------------------------------------
// Part 2 — bundle grep (skipped when no build artifacts)
// ---------------------------------------------------------------------------

// Tokens that must not appear in any prod bundle chunk. Each entry must
// reference a real artifact in the dev sources whose presence in the prod
// bundle would indicate a regression (a dev-only branch surviving DCE, a
// dev placeholder leaking into prod, etc.). Tokens for vars that have been
// fully removed from the codebase are not listed — there is nothing left
// to leak.
const FORBIDDEN = [
  // Dev-only CSP builder in `proxy.ts`. Should be DCE'd in prod
  // (`USE_DEV_CSP === false`).
  'buildDevCsp',
  // Prefix used by every placeholder secret in `.env.development` /
  // `.env.example` / `dev/keycloak/realm-kravhantering-dev.json`.
  'dev-only',
  // Dev OIDC client id in `.env.development` and the local Keycloak realm.
  'kravhantering-app',
  // Sentinel prefix for unconfigured secrets in `.env.example`.
  'replace-with-',
]

const bundleArtifactsExist =
  existsSync(SERVER_DIR) && existsSync(STATIC_DIR)

if (!bundleArtifactsExist) {
  console.log(
    '[verify-prod-bundle] No build artifacts found — skipping bundle grep.',
  )
  console.log(
    '  Run `npm run build` (BUILD_TARGET=prod) first to enable the grep step.',
  )
} else {
  for (const token of FORBIDDEN) {
    for (const dir of [SERVER_DIR, STATIC_DIR]) {
      let output = ''
      try {
        output = execSync(
          `grep -r --include="*.js" -l ${JSON.stringify(token)} ${JSON.stringify(dir)}`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim()
      } catch {
        // grep exits 1 when nothing is found — that is the success case here.
        output = ''
      }

      if (output.length > 0) {
        console.error(
          `[verify-prod-bundle] FORBIDDEN token "${token}" found in bundle:`,
        )
        for (const file of output.split('\n').filter(Boolean)) {
          console.error(`  ${file}`)
        }
        failed = true
      }
    }
  }
}

if (failed) {
  console.error('\n[verify-prod-bundle] FAILED.')
  process.exit(1)
}

if (bundleArtifactsExist) {
  console.log(
    '[verify-prod-bundle] OK — no forbidden dev tokens found in prod bundle.',
  )
}
