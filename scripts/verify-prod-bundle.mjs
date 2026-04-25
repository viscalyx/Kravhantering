#!/usr/bin/env node
/**
 * verify-prod-bundle.mjs
 *
 * Greps the production Next.js bundle output for tokens that must never
 * appear in real production bundles — dev escape hatches, placeholder values,
 * legacy bypass strings, and build-time-only validator code.
 *
 * Run after `npm run build` (BUILD_TARGET=prod) via:
 *   npm run verify:prod-bundle
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SERVER_DIR = resolve(ROOT, '.next/server')
const STATIC_DIR = resolve(ROOT, '.next/static')

// Tokens that must not appear in any prod bundle chunk.
const FORBIDDEN = [
  'AUTH_ALLOW_DISABLE_IN_PRODUCTION',
  'AUTH_OIDC_ALLOW_INSECURE_ISSUER',
  'buildDevCsp',
  'collectPlaceholderViolations',
  'dev-only',
  'kravhantering-app',
  'prodlike-only',
  'replace-with-',
]

let failed = false

for (const dir of [SERVER_DIR, STATIC_DIR]) {
  if (!existsSync(dir)) {
    console.error(`[verify-prod-bundle] Missing expected directory: ${dir}`)
    console.error('Run `npm run build` first (BUILD_TARGET=prod).')
    process.exit(1)
  }
}

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

if (failed) {
  console.error(
    '\n[verify-prod-bundle] FAILED — prod bundle contains forbidden dev tokens.',
  )
  process.exit(1)
} else {
  console.log(
    '[verify-prod-bundle] OK — no forbidden dev tokens found in prod bundle.',
  )
}
