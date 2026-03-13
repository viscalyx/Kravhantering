#!/usr/bin/env node
const { execSync } = require('node:child_process')
const { extractPids, normalizePort } = require('./extract-pids.js')

const portArg = process.argv[2] || process.env.PORT || '3000'

let port
try {
  port = normalizePort(portArg)
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

try {
  const raw = execSync('ss -ltnp', { encoding: 'utf8' })
  const pids = extractPids(raw, port)
  if (pids.length > 0) {
    console.log(pids.join(' '))
  } else {
    // Print info to stderr so callers parsing stdout don't get confused
    console.error(`No process listening on port ${port}`)
  }
} catch {
  // If ss is not available or command fails, exit silently with success
  process.exit(0)
}
