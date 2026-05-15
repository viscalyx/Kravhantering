#!/usr/bin/env node
/**
 * Dev helper: log in to the local Keycloak IdP as a configured dev user
 * and emit a Netscape-format cookie jar suitable for `curl -b`.
 *
 * Mirrors the OIDC flow in tests/integration/global-setup.ts but uses
 * only Node's built-in fetch so it can run without Playwright installed.
 *
 * Usage:
 *   node scripts/dev-login.mjs                     # default: ada.admin
 *   node scripts/dev-login.mjs --user rita.reviewer
 *   node scripts/dev-login.mjs --base http://localhost:3000
 *   node scripts/dev-login.mjs --jar .auth/admin.cookies
 *   node scripts/dev-login.mjs --print-jar         # only print jar path
 *
 * Prints the absolute path to the cookie jar on stdout, so you can do:
 *   jar=$(node scripts/dev-login.mjs) && curl -b "$jar" \
 *     http://localhost:3000/sv/requirements/IDN0001/4
 *
 * Or use the convenience wrapper: scripts/dev-curl.sh
 */

import { resolve } from 'node:path'
import { argv, exit, stderr } from 'node:process'
import { fileURLToPath } from 'node:url'
import { main } from './lib/dev-login-core.mjs'

const isMainEntry =
  argv[1] != null && resolve(argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  main().catch(err => {
    stderr.write(`[dev-login] ${err?.stack ?? err}\n`)
    exit(1)
  })
}
