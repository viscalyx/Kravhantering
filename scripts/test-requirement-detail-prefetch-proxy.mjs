#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = process.cwd()
const resultDirectory = path.join(repositoryRoot, 'test-results')
const reportPath = path.join(
  resultDirectory,
  'requirement-detail-prefetch-proxy.json',
)
const specPath = 'tests/integration/requirement-detail-prefetch/proxy.spec.ts'

await mkdir(resultDirectory, { recursive: true })

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  }
}

run('npm', ['run', 'db:setup'])
run(
  'npm',
  [
    'run',
    'test:integration:prodlike',
    '--',
    '--',
    specPath,
    '--grep=PREFETCH-01',
  ],
  {
    NEXT_PUBLIC_ENABLE_REQUIREMENT_DETAIL_PREFETCH: 'true',
    NEXT_PUBLIC_REQUIREMENT_DETAIL_PREFETCH_SYNTHETIC_LATENCY_MS: '0',
    NEXT_PUBLIC_VALIDATE_REQUIREMENT_DETAIL_PREFETCH: 'true',
    REQUIREMENT_DETAIL_PREFETCH_PROXY_OUTPUT: reportPath,
  },
)
process.stdout.write(`Prodlike proxy report: ${reportPath}\n`)
