#!/usr/bin/env node

/**
 * Prebuild script for Next.js with OpenNext Cloudflare deployment
 * This script handles cleaning and preparation before building the Next.js app
 *
 * Problem this solves:
 * - OpenNext uses esbuild to compile config files during the build process
 * - esbuild has a bug that creates files with write-only permissions (--w-------)
 * - The bundler later tries to READ these configs and fails with permission errors
 * - We need to preserve and fix permissions on these configs between builds
 *
 * Solution:
 * 1. Clean Next.js build artifacts (.next, out)
 * 2. If .open-next exists, fix permissions on config files
 * 3. Preserve .open-next/.build (contains the configs) but clean everything else
 * 4. Rebuild site data (blog posts, page dates)
 */

// cSpell:ignore prebuild esbuild copyfile sitedata

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// Step 1: Clean Next.js build directories
console.log('🧹 Cleaning Next.js build artifacts...')
if (fs.existsSync('.next')) {
  fs.rmSync('.next', { recursive: true, force: true })
}
if (fs.existsSync('out')) {
  fs.rmSync('out', { recursive: true, force: true })
}

// Step 2 & 3: Handle OpenNext directory (if it exists)
if (fs.existsSync('.open-next')) {
  console.log('🔧 Fixing permissions on OpenNext config files...')
  // Fix permissions on config files (esbuild creates them with --w-------)
  // This needs to happen BEFORE the bundler tries to read them during the next build
  // Without this fix, you'll see errors like:
  //   ✘ [Error: ENOENT: no such file or directory,
  //     copyfile '/workspace/.open-next/.build/open-next.config.edge.mjs'
  //     -> '/workspace/.open-next/middleware/open-next.config.mjs'
  const buildDir = path.join('.open-next', '.build')

  if (fs.existsSync(buildDir)) {
    const files = fs.readdirSync(buildDir)
    files.forEach(file => {
      if (file.startsWith('open-next.config') && file.endsWith('.mjs')) {
        const filePath = path.join(buildDir, file)
        try {
          fs.chmodSync(filePath, 0o644)
        } catch {
          // Silently ignore permission errors (e.g., on Windows)
        }
      }
    })
  }

  console.log('🗑️  Cleaning OpenNext artifacts (preserving .build)...')
  // Clean everything in .open-next EXCEPT the .build directory
  // The .build directory contains compiled configs that we want to reuse
  const items = fs.readdirSync('.open-next')
  items.forEach(item => {
    if (item !== '.build') {
      const itemPath = path.join('.open-next', item)
      fs.rmSync(itemPath, { recursive: true, force: true })
    }
  })
}

// Step 4: Generate Cloudflare types
console.log('☁️  Generating Cloudflare types...')
try {
  execSync('npm run cf-typegen', { stdio: 'inherit' })
} catch {
  console.error('❌ Failed to generate Cloudflare types')
  process.exit(1)
}
