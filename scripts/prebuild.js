#!/usr/bin/env node

/**
 * Prebuild cleanup for native Next.js builds.
 *
 * We keep this hook so `npm run build` always starts from a clean `.next` and
 * `out` directory without carrying over artifacts from prior dev or prod-like
 * runs.
 */

const fs = require('node:fs')

console.log('🧹 Cleaning Next.js build artifacts...')
if (fs.existsSync('.next')) {
  fs.rmSync('.next', { recursive: true, force: true })
}
if (fs.existsSync('out')) {
  fs.rmSync('out', { recursive: true, force: true })
}
