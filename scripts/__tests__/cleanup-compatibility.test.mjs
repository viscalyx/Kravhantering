import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseCleanupCompatibilityContract } from '../../lib/transient-cleanup/compatibility'
import { runCleanupCompatibilityCli } from '../release/cleanup-compatibility.mjs'
import {
  createCleanupCompatibilityContract,
  verifyCleanupCompatibilityContract,
} from '../release/cleanup-compatibility-contract.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

const kinds = [
  'ai_run_coordination_entries',
  'ai_forensic_evidence',
  'hsa_verification_quota_buckets',
  'requirement_import_validation_sessions',
  'requirement_import_validation_rate_buckets',
]
const imageId = `sha256:${'a'.repeat(64)}`
const digest = `sha256:${'b'.repeat(64)}`
function input() {
  return {
    manifest: {
      version: '2.0.0',
      database: { expectedSchemaVersion: 'Target123' },
    },
    stackLock: {
      services: [{ name: 'db-job', imageId, manifestDigest: digest }],
    },
    sources: [
      {
        release: '1.0.0',
        schemaVersion: 'Source122',
        archiveSha256: 'c'.repeat(64),
        stackLockSha256: 'd'.repeat(64),
      },
    ],
    evidence: ['Target123', 'Source122'].map(schemaVersion => ({
      schemaVersion,
      schemaFingerprint: 'e'.repeat(64),
      imageId,
      outcome: 'success',
      targets: kinds.map(kind => ({
        kind,
        outcome: schemaVersion === 'Source122' ? 'not_applicable' : 'success',
      })),
    })),
  }
}
describe('cleanup release compatibility contract', () => {
  it('seals source evidence for packaging and verifies the exact declared source set', () => {
    const args = input()
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-contract-'))
    roots.push(root)
    for (const [file, value] of Object.entries({
      'DEPLOYMENT-MANIFEST.json': args.manifest,
      'container-stack.lock.json': args.stackLock,
      'evidence.json': args.evidence,
      'sources.json': args.sources,
    })) {
      fs.writeFileSync(path.join(root, file), JSON.stringify(value))
    }
    runCleanupCompatibilityCli([
      'seal',
      root,
      path.join(root, 'evidence.json'),
      path.join(root, 'sources.json'),
    ])
    const contract = JSON.parse(
      fs.readFileSync(path.join(root, 'cleanup-compatibility.json'), 'utf8'),
    )
    expect(
      verifyCleanupCompatibilityContract(
        contract,
        args.manifest,
        args.stackLock,
        args.sources,
      ),
    ).toEqual(contract)
    expect(() =>
      verifyCleanupCompatibilityContract(
        contract,
        args.manifest,
        args.stackLock,
        [],
      ),
    ).toThrow('source declarations')
    expect(() =>
      verifyCleanupCompatibilityContract(
        contract,
        { ...args.manifest, version: '3.0.0' },
        args.stackLock,
      ),
    ).toThrow('release lock')
    expect(() => runCleanupCompatibilityCli([])).toThrow('Usage')
  })

  it('verifies multiple explicit sources sharing the same proven schema regardless of declaration order', () => {
    const args = input()
    args.sources.push({ ...args.sources[0], release: '1.1.0' })
    const contract = createCleanupCompatibilityContract(args)
    expect(
      verifyCleanupCompatibilityContract(
        contract,
        args.manifest,
        args.stackLock,
        [...args.sources].reverse(),
      ),
    ).toEqual(contract)
  })
  it('supports a target with no declared rollback sources', () => {
    const args = input()
    delete args.sources
    args.evidence.pop()
    expect(createCleanupCompatibilityContract(args).sources).toEqual([])
  })

  it.each([
    'version',
    'identifier',
    'digest',
    'missing-array',
    'duplicate-release',
    'duplicate-schema',
    'duplicate-target',
    'missing-schema',
    'invalid-record',
    'invalid-source-digest',
  ])('rejects malformed %s contracts', reason => {
    const contract = createCleanupCompatibilityContract(input())
    if (reason === 'version') contract.schemaVersion = 2
    if (reason === 'identifier') contract.target.release = '../unsafe'
    if (reason === 'digest') contract.imageId = 'moving-tag'
    if (reason === 'missing-array') contract.sources = null
    if (reason === 'duplicate-release')
      contract.sources.push(contract.sources[0])
    if (reason === 'duplicate-schema')
      contract.verification.push(contract.verification[0])
    if (reason === 'duplicate-target')
      contract.verification[0].targets.push(contract.verification[0].targets[0])
    if (reason === 'missing-schema') contract.verification.pop()
    if (reason === 'invalid-record') contract.target = null
    if (reason === 'invalid-source-digest')
      contract.sources[0].archiveSha256 = 'bad'
    expect(() => parseCleanupCompatibilityContract(contract)).toThrow()
  })

  it('binds the exact cleanup image to target and explicit rollback source evidence', () => {
    const result = createCleanupCompatibilityContract(input())
    expect(result.imageId).toBe(imageId)
    expect(result.target).toEqual({
      release: '2.0.0',
      schemaVersion: 'Target123',
    })
    expect(result.sources[0].release).toBe('1.0.0')
    expect(result.verification).toHaveLength(2)
  })
  it.each(['missing-source', 'wrong-image', 'failed-target', 'missing-target'])(
    'rejects %s proof before packaging',
    failure => {
      const args = input()
      if (failure === 'missing-source') args.evidence.pop()
      if (failure === 'wrong-image')
        args.evidence[1].imageId = `sha256:${'f'.repeat(64)}`
      if (failure === 'failed-target')
        args.evidence[1].targets[0].outcome = 'failure'
      if (failure === 'missing-target') args.evidence[1].targets.pop()
      expect(() => createCleanupCompatibilityContract(args)).toThrow()
    },
  )
})
