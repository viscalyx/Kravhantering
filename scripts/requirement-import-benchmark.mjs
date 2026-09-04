#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const environmentPath = resolve(
  repoRoot,
  process.env.REQUIREMENT_IMPORT_BENCHMARK_ENV_FILE ?? '.env.sqlserver',
)
const composePath = resolve(
  repoRoot,
  'tests/performance/requirement-import-benchmark.compose.yml',
)
const sqlPort = process.env.REQUIREMENT_IMPORT_BENCHMARK_SQL_PORT ?? '14339'
const updateBaseline = process.argv.includes('--update-baseline')
const forwardedBenchmarkEnvironment = [
  'REQUIREMENT_IMPORT_BENCHMARK_CANDIDATE_ROWS',
  'REQUIREMENT_IMPORT_BENCHMARK_REPETITIONS',
  'REQUIREMENT_IMPORT_BENCHMARK_SCREENING_MAX_ROWS',
].flatMap(name =>
  process.env[name] == null ? [] : ['--env', `${name}=${process.env[name]}`],
)

if (!existsSync(environmentPath)) {
  throw new Error(
    `Missing ${environmentPath}. Copy .env.sqlserver.example and set its SQL Server password first.`,
  )
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status ?? 'unknown'}`,
    )
  }
}

const composeArgs = [
  'compose',
  '--env-file',
  environmentPath,
  '--file',
  composePath,
]

try {
  run('docker', [
    ...composeArgs,
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '180',
    'db',
  ])
  run('docker', [
    'run',
    '--rm',
    '--cpus',
    '3',
    '--memory',
    '4g',
    '--memory-swap',
    '4g',
    '--user',
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    '--network',
    'host',
    '--volume',
    `${repoRoot}:/workspace`,
    '--workdir',
    '/workspace',
    '--env-file',
    environmentPath,
    '--env',
    'DB_HOST=127.0.0.1',
    '--env',
    `DB_PORT=${sqlPort}`,
    '--env',
    'NODE_ENV=test',
    '--env',
    'DB_REQUEST_TIMEOUT_MS=300000',
    '--env',
    'REQUIREMENT_IMPORT_SQLSERVER_BENCHMARK=1',
    '--env',
    'REQUIREMENT_IMPORT_BENCHMARK_SQL_CPU_LIMIT=2',
    '--env',
    'REQUIREMENT_IMPORT_BENCHMARK_SQL_MEMORY_LIMIT_MIB=4096',
    ...forwardedBenchmarkEnvironment,
    ...(updateBaseline
      ? ['--env', 'REQUIREMENT_IMPORT_BENCHMARK_UPDATE_BASELINE=1']
      : []),
    'node:24-bookworm',
    'node_modules/.bin/vitest',
    'run',
    '--config',
    'vitest.requirement-import-benchmark.config.mts',
  ])
} finally {
  run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans'])
}
