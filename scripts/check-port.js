#!/usr/bin/env node
const { execSync } = require('node:child_process')

const port = process.argv[2] || process.env.PORT || '3000'
try {
  const raw = execSync('ss -ltnp', { encoding: 'utf8' })
  const re = new RegExp(`:${port}[\\s\\S]*?pid=(\\d+)`, 'g')
  const found = new Set([...raw.matchAll(re)].map(match => match[1]))
  if (found.size > 0) {
    console.log([...found].join(' '))
  } else {
    // Print info to stderr so callers parsing stdout don't get confused
    console.error(`No process listening on port ${port}`)
  }
} catch {
  // If ss is not available or command fails, exit silently with success
  process.exit(0)
}
