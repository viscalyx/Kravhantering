#!/usr/bin/env node

/**
 * Prebuild cleanup for native Next.js builds.
 *
 * We keep this hook so `npm run build` always starts from a clean `.next` and
 * `out` directory without carrying over artifacts from prior dev or prod-like
 * runs.
 */

const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { writeBuildMetadata } = require('./build-metadata')

const metadataOnly = process.argv.includes('--metadata-only')

execFileSync(process.execPath, [
  path.join(__dirname, 'generate-status-icon-aliases.mjs'),
])

if (!metadataOnly) {
  console.info('🧹 Cleaning Next.js build artifacts...')
  if (fs.existsSync('.next')) {
    fs.rmSync('.next', { recursive: true, force: true })
  }
  if (fs.existsSync('out')) {
    fs.rmSync('out', { recursive: true, force: true })
  }
}

const metadata = writeBuildMetadata()
console.info(`📦 Wrote public/build.json for version ${metadata.version}`)
