import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const LIFECYCLE = path.resolve('containers/hsa-mtls-topology/lifecycle.sh')

let testRoot

beforeEach(async () => {
  testRoot = await mkdtemp(path.join(os.tmpdir(), 'hsa-lifecycle-test-'))
  const docker = path.join(testRoot, 'docker')
  await writeFile(
    docker,
    `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
const command = process.argv.slice(2).join(' ')
appendFileSync(process.env.HSA_TEST_CALLS, command + '\\n')
if (command.includes('run --rm provisioner ensure')) {
  process.stdout.write(process.env.HSA_TEST_ENSURE_RESULT + '\\n')
} else if (command.includes('run --rm provisioner inspect')) {
  const reconciled = existsSync(process.env.HSA_TEST_FINALIZE_STATE)
  process.stdout.write(JSON.stringify({ ok: true, result: { selection: { current: 'generation-2', previous: reconciled ? null : 'generation-1' } } }) + '\\n')
} else if (command.includes('run --rm provisioner finalize')) {
  const state = process.env.HSA_TEST_FINALIZE_COUNT
  const count = existsSync(state) ? Number(readFileSync(state, 'utf8')) : 0
  writeFileSync(state, String(count + 1))
  if (count < Number(process.env.HSA_TEST_FINALIZE_FAILURES || '0')) {
    if (process.env.HSA_TEST_FINALIZE_AMBIGUOUS === 'true') writeFileSync(process.env.HSA_TEST_FINALIZE_STATE, 'reconciled')
    process.exit(1)
  }
  writeFileSync(process.env.HSA_TEST_FINALIZE_STATE, 'reconciled')
} else if (command.includes('run --rm --no-deps test')) {
  const state = process.env.HSA_TEST_VERIFY_STATE
  const count = existsSync(state) ? Number(readFileSync(state, 'utf8')) : 0
  writeFileSync(state, String(count + 1))
  if (count < Number(process.env.HSA_TEST_VERIFY_FAILURES || '0')) process.exit(1)
} else if (command.includes("--profile * config --format json")) {
  process.stdout.write(process.env.HSA_TEST_NORMALIZED_CONFIG + '\\n')
}
`,
  )
  await chmod(docker, 0o755)
})

afterEach(async () => {
  await rm(testRoot, { force: true, recursive: true })
})

async function runEnsure(
  ensureResult,
  {
    finalizeAmbiguous = false,
    finalizeFailures = 0,
    normalizedConfig = { services: {} },
    verifyFailures = 0,
  } = {},
) {
  const callsPath = path.join(testRoot, 'calls.log')
  const finalizeCount = path.join(testRoot, 'finalize-count')
  const finalizeState = path.join(testRoot, 'finalize-state')
  const verifyState = path.join(testRoot, 'verify-state')
  const result = spawnSync(LIFECYCLE, ['ensure'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HSA_MTLS_LIFETIME: 'persistent',
      HSA_TEST_CALLS: callsPath,
      HSA_TEST_ENSURE_RESULT: JSON.stringify({
        ok: true,
        result: ensureResult,
      }),
      HSA_TEST_VERIFY_FAILURES: String(verifyFailures),
      HSA_TEST_VERIFY_STATE: verifyState,
      HSA_TEST_FINALIZE_AMBIGUOUS: String(finalizeAmbiguous),
      HSA_TEST_FINALIZE_COUNT: finalizeCount,
      HSA_TEST_FINALIZE_FAILURES: String(finalizeFailures),
      HSA_TEST_FINALIZE_STATE: finalizeState,
      HSA_TEST_NORMALIZED_CONFIG: JSON.stringify(normalizedConfig),
      PATH: `${testRoot}:${process.env.PATH}`,
    },
  })
  let calls = []
  try {
    const contents = (await readFile(callsPath, 'utf8')).trim()
    calls = contents ? contents.split('\n') : []
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return { calls, result }
}

describe('HSA mTLS topology ensure lifecycle', () => {
  it('rejects writable material mounts on runtime leaf services', async () => {
    const { calls, result } = await runEnsure(
      { action: 'reused', generationId: 'generation-1' },
      {
        normalizedConfig: {
          services: {
            kong: {
              volumes: [
                {
                  read_only: false,
                  source: 'kong-material',
                  target: '/run/kravhantering/hsa-mtls',
                },
              ],
            },
            provisioner: {
              volumes: [
                {
                  read_only: false,
                  source: 'app-material',
                  target: '/run/kravhantering/hsa-mtls-runtime/app',
                },
              ],
            },
          },
        },
      },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Writable HSA runtime material mount')
    expect(calls).not.toContainEqual(
      expect.stringContaining('provisioner inspect'),
    )
  })

  it('restarts and authenticates reused material without switching it', async () => {
    const { calls, result } = await runEnsure({
      action: 'reused',
      generationId: 'generation-1',
    })

    expect(result.status).toBe(0)
    const stopped = calls.findIndex(call => call.includes('stop --timeout 1'))
    const ensured = calls.findIndex(call =>
      call.includes('run --rm provisioner ensure --lifetime persistent'),
    )
    const authenticated = calls.findIndex(call =>
      call.includes('run --rm --no-deps test'),
    )
    expect(ensured).toBeGreaterThan(stopped)
    expect(authenticated).toBeGreaterThan(ensured)
    expect(calls).not.toContainEqual(expect.stringContaining('deploy'))
    expect(calls).not.toContainEqual(expect.stringContaining('finalize'))
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
    expect(calls).not.toContainEqual(
      expect.stringContaining('--force-recreate'),
    )
  })

  it('switches, recreates, authenticates, and finalizes promoted material', async () => {
    const { calls, result } = await runEnsure({
      action: 'promoted',
      generationId: 'generation-2',
      previousGenerationId: 'generation-1',
    })

    expect(result.status).toBe(0)
    const ensured = calls.findIndex(call => call.includes('provisioner ensure'))
    const deployed = calls.findIndex(call =>
      call.includes('provisioner deploy'),
    )
    const recreated = calls.findIndex(call =>
      call.includes('up --no-deps -d --wait --force-recreate mock'),
    )
    const authenticated = calls.findIndex(call =>
      call.includes('run --rm --no-deps test'),
    )
    const finalized = calls.findIndex(call =>
      call.includes('provisioner finalize'),
    )
    expect(deployed).toBeGreaterThan(ensured)
    expect(recreated).toBeGreaterThan(deployed)
    expect(authenticated).toBeGreaterThan(recreated)
    expect(finalized).toBeGreaterThan(authenticated)
  })

  it('rolls back and authenticates recovery after promoted material fails', async () => {
    const { calls, result } = await runEnsure(
      {
        action: 'promoted',
        generationId: 'generation-2',
        previousGenerationId: 'generation-1',
      },
      { verifyFailures: 1 },
    )

    expect(result.status).toBe(1)
    const firstAuthentication = calls.findIndex(call =>
      call.includes('run --rm --no-deps test'),
    )
    const rollback = calls.findIndex(call =>
      call.includes('provisioner rollback'),
    )
    const recoveryAuthentication = calls.findLastIndex(call =>
      call.includes('run --rm --no-deps test'),
    )
    expect(rollback).toBeGreaterThan(firstAuthentication)
    expect(recoveryAuthentication).toBeGreaterThan(rollback)
    expect(calls).not.toContainEqual(expect.stringContaining('finalize'))
  })

  it('keeps authenticated endpoints running after an ambiguous finalization failure', async () => {
    const { calls, result } = await runEnsure(
      {
        action: 'promoted',
        generationId: 'generation-2',
        previousGenerationId: 'generation-1',
      },
      { finalizeAmbiguous: true, finalizeFailures: 1 },
    )

    expect(result.status).toBe(0)
    const authenticated = calls.findIndex(call =>
      call.includes('run --rm --no-deps test'),
    )
    const finalized = calls.findIndex(call =>
      call.includes('provisioner finalize'),
    )
    const reconciled = calls.findLastIndex(call =>
      call.includes('provisioner inspect'),
    )
    expect(finalized).toBeGreaterThan(authenticated)
    expect(reconciled).toBeGreaterThan(finalized)
    expect(calls.slice(authenticated + 1)).not.toContainEqual(
      expect.stringContaining('stop --timeout 1'),
    )
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })

  it('retries cleanup while deletion failure retains the prior generation identity', async () => {
    const { calls, result } = await runEnsure(
      {
        action: 'promoted',
        generationId: 'generation-2',
        previousGenerationId: 'generation-1',
      },
      { finalizeFailures: 1 },
    )

    expect(result.status).toBe(0)
    const finalized = calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.includes('provisioner finalize'))
    expect(finalized).toHaveLength(2)
    expect(
      calls.findLastIndex(call => call.includes('provisioner inspect')),
    ).toBeGreaterThan(finalized[1]?.index ?? -1)
    expect(calls).not.toContainEqual(expect.stringContaining('rollback'))
  })
})
