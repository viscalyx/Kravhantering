import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const yaml = createRequire(import.meta.url)('js-yaml')
const action = yaml.load(
  fs.readFileSync('.github/actions/attest-with-retry/action.yml', 'utf8'),
)
const roots = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

// Exercise the composite's expressions and shell gate with simulated upstream
// results. OIDC and signing remain the pinned upstream action's responsibility.
function execute(
  outcomes,
  { inputs = {}, cancelAfter, missingBundle = false } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attest-retry-'))
  roots.push(root)
  const delays = path.join(root, 'delays')
  fs.writeFileSync(
    path.join(root, 'sleep'),
    '#!/bin/sh\nprintf "%s\\n" "$1" >> "$DELAY_LOG"\n',
    { mode: 0o755 },
  )
  const steps = new Proxy(
    {},
    {
      get: (target, name) =>
        target[name] ?? { outcome: 'skipped', outputs: {} },
    },
  )
  let cancelled = false
  let failed = false
  const attempts = []
  const evaluate = value =>
    typeof value === 'string' && value.startsWith('${{')
      ? vm.runInNewContext(value.slice(3, -2), {
          steps,
          inputs,
          cancelled: () => cancelled,
        })
      : value
  for (const step of action.runs.steps) {
    if (!(step.if ? evaluate(step.if) : !failed && !cancelled)) continue
    let outcome
    let outputs = {}
    if (step.uses) {
      const index = attempts.length
      attempts.push({
        uses: step.uses,
        inputs: Object.fromEntries(
          Object.entries(step.with).map(([key, value]) => [
            key,
            evaluate(value),
          ]),
        ),
      })
      outcome = outcomes[index]
      expect(outcome, 'unexpected extra attestation attempt').toBeDefined()
      const bundle = path.join(root, `bundle-${index}.json`)
      if (!missingBundle) fs.writeFileSync(bundle, '{}')
      // actions/attest exposes bundle-path before signing, even on failure.
      outputs = {
        'bundle-path': bundle,
        'attestation-id': `id-${index}`,
        'attestation-url': `https://example.com/attestations/${index}`,
      }
      cancelled = attempts.length === cancelAfter
    } else {
      const output = path.join(root, `output-${step.id ?? attempts.length}`)
      const result = spawnSync('bash', ['-e', '-c', step.run], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          DELAY_LOG: delays,
          GITHUB_OUTPUT: output,
          ...Object.fromEntries(
            Object.entries(step.env ?? {}).map(([key, value]) => [
              key,
              String(evaluate(value)),
            ]),
          ),
        },
      })
      outcome = result.status === 0 ? 'success' : 'failure'
      if (fs.existsSync(output))
        outputs = Object.fromEntries(
          fs
            .readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => {
              const separator = line.indexOf('=')
              return [line.slice(0, separator), line.slice(separator + 1)]
            }),
        )
    }
    if (step.id) steps[step.id] = { outcome, outputs }
    if (outcome === 'failure' && !step['continue-on-error']) failed = true
  }
  return {
    status: cancelled ? 'cancelled' : failed ? 'failure' : 'success',
    attempts,
    delays: fs.existsSync(delays)
      ? fs.readFileSync(delays, 'utf8').trim().split('\n').map(Number)
      : [],
    outputs: Object.fromEntries(
      Object.entries(action.outputs).map(([key, value]) => [
        key,
        evaluate(value.value),
      ]),
    ),
  }
}

describe('attestation retry action', () => {
  it.each([0, 1, 2])(
    'returns only the successful attempt outputs after %i failures',
    failures => {
      const result = execute([...Array(failures).fill('failure'), 'success'])
      expect(result.status).toBe('success')
      expect(result.attempts).toHaveLength(failures + 1)
      expect(result.delays).toEqual([10, 30].slice(0, failures))
      expect(result.outputs['attestation-id']).toBe(`id-${failures}`)
      expect(result.outputs['attestation-url']).toBe(
        `https://example.com/attestations/${failures}`,
      )
      expect(path.basename(result.outputs['bundle-path'])).toBe(
        `bundle-${failures}.json`,
      )
    },
  )

  it('fails closed after three failures even when failed attempts expose bundle paths', () => {
    const result = execute(['failure', 'failure', 'failure'])
    expect(result.status).toBe('failure')
    expect(result.attempts).toHaveLength(3)
    expect(result.delays).toEqual([10, 30])
    expect(result.outputs['bundle-path']).toBeUndefined()
  })

  it('requires an existing bundle from a successful action', () => {
    const result = execute(['success'], { missingBundle: true })
    expect(result.status).toBe('failure')
    expect(result.outputs['bundle-path']).toBeUndefined()
  })

  it('stops retrying when the job is cancelled', () => {
    const result = execute(['failure'], { cancelAfter: 1 })
    expect(result.status).toBe('cancelled')
    expect(result.attempts).toHaveLength(1)
    expect(result.delays).toEqual([])
  })

  it.each([
    {
      'subject-name': 'ghcr.io/owner/image',
      'subject-digest': `sha256:${'a'.repeat(64)}`,
    },
    {
      'subject-name': 'ghcr.io/owner/image',
      'subject-digest': `sha256:${'a'.repeat(64)}`,
      'sbom-path': 'sbom/image.spdx.json',
    },
    {
      'subject-path': 'release.tar.gz',
      'predicate-type': 'https://example.com/release/v1',
      'predicate-path': 'predicate.json',
    },
  ])('preserves attestation identity and inputs across retries: %j', inputs => {
    const result = execute(['failure', 'success'], { inputs })
    expect(result.status).toBe('success')
    for (const attempt of result.attempts) {
      expect(attempt.uses).toMatch(/^actions\/attest@[a-f0-9]{40}$/u)
      expect(attempt.inputs).toMatchObject({
        ...inputs,
        'push-to-registry': false,
      })
    }
    expect(result.attempts[0]).toEqual(result.attempts[1])
  })
})
