#!/usr/bin/env node
const fs = require('node:fs')

const USAGE = 'Usage: extract-pids.js PORT'

function normalizePort(port) {
  const portText = String(port)
  if (!/^\d{1,5}$/.test(portText)) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  const portNumber = Number.parseInt(portText, 10)
  if (portNumber < 1 || portNumber > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  return String(portNumber)
}

function extractPids(inputText, port) {
  const normalizedPort = normalizePort(port)
  const re = new RegExp(`:${normalizedPort}[\\s\\S]*?pid=(\\d+)`, 'g')
  const found = new Set()

  while (true) {
    const match = re.exec(inputText)
    if (match === null) {
      break
    }
    found.add(match[1])
  }

  return [...found]
}

function main(argv = process.argv.slice(2)) {
  const portArg = argv[0]

  if (argv.length !== 1) {
    console.error(USAGE)
    process.exit(2)
  }

  try {
    const input = fs.readFileSync(0, 'utf8')
    for (const pid of extractPids(input, portArg)) {
      console.log(pid)
    }
  } catch (error) {
    console.error(error.message)
    console.error(USAGE)
    process.exit(2)
  }
}

module.exports = { extractPids, main }

if (require.main === module) {
  main()
}
