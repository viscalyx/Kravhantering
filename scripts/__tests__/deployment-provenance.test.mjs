import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  buildGhVerificationArgs,
  createDeploymentReleasePredicate,
  deploymentAttestationBundleName,
  deploymentTrustedRootName,
  main,
  RELEASE_ATTESTATION_PREDICATE_TYPE,
  renderDeploymentProvenanceNotes,
  verificationMatchesPolicy,
  verifyDeploymentProvenance,
} from '../release/deployment-provenance.mjs'

const plan = {
  commitSha: '1234567890abcdef1234567890abcdef12345678',
  prerelease: true,
  ref: 'refs/heads/main',
  releaseTagName: 'v1.2.0-preview.4',
  repository: 'viscalyx/Kravhantering',
  version: '1.2.0-preview.4',
}

function verificationOptions(subject, overrides = {}) {
  return {
    releaseTag: plan.releaseTagName,
    releaseVersion: plan.version,
    repository: plan.repository,
    signerWorkflow:
      'viscalyx/Kravhantering/.github/workflows/container-release.yml',
    sourceDigest: plan.commitSha,
    sourceRef: plan.ref,
    subject,
    ...overrides,
  }
}

function verificationFixture(subject, overrides = () => {}) {
  const digest = crypto
    .createHash('sha256')
    .update(fs.readFileSync(subject))
    .digest('hex')
  const statement = {
    predicate: createDeploymentReleasePredicate(plan),
    predicateType: RELEASE_ATTESTATION_PREDICATE_TYPE,
    subject: [{ digest: { sha256: digest }, name: path.basename(subject) }],
  }
  const fixture = [
    {
      verificationResult: {
        statement,
      },
    },
  ]
  overrides(fixture[0].verificationResult.statement)
  return fixture
}

describe('deployment release provenance', () => {
  it('creates repository-owned preview and stable release identities', () => {
    expect(RELEASE_ATTESTATION_PREDICATE_TYPE).toBe(
      'https://github.com/viscalyx/Kravhantering/attestations/deployment-release/v1',
    )
    expect(createDeploymentReleasePredicate(plan)).toEqual({
      release: {
        prerelease: true,
        tag: 'v1.2.0-preview.4',
        version: '1.2.0-preview.4',
      },
      repository: 'viscalyx/Kravhantering',
      schemaVersion: 1,
      source: {
        commitSha: plan.commitSha,
        ref: 'refs/heads/main',
      },
    })
    expect(
      createDeploymentReleasePredicate({
        ...plan,
        prerelease: false,
        ref: 'refs/tags/v1.2.3',
        releaseTagName: 'v1.2.3',
        version: '1.2.3',
      }),
    ).toMatchObject({
      release: { prerelease: false, tag: 'v1.2.3', version: '1.2.3' },
      source: { ref: 'refs/tags/v1.2.3' },
    })
    expect(deploymentAttestationBundleName(plan.version)).toBe(
      'kravhantering-production-deploy-1.2.0-preview.4.tar.gz.sigstore.json',
    )
    expect(deploymentTrustedRootName(plan.version)).toBe(
      'kravhantering-production-deploy-1.2.0-preview.4.tar.gz.trusted-root.jsonl',
    )
  })

  it('renders exact release evidence links and identity constraints', () => {
    const notes = renderDeploymentProvenanceNotes(
      plan,
      'https://github.com/viscalyx/Kravhantering/attestations/123',
    )

    expect(notes).toContain('## Deployment archive provenance verification')
    expect(notes).toContain('The SHA-256 checksum proves transfer integrity.')
    expect(notes).toContain(
      '[GitHub attestation for this archive digest](https://github.com/viscalyx/Kravhantering/attestations/123)',
    )
    expect(notes).toContain(
      'kravhantering-production-deploy-1.2.0-preview.4.tar.gz.sigstore.json',
    )
    expect(notes).toContain(
      'kravhantering-production-deploy-1.2.0-preview.4.tar.gz.trusted-root.jsonl',
    )
    expect(notes).toContain(
      '- Source commit and ref: `1234567890abcdef1234567890abcdef12345678`, `refs/heads/main`',
    )
    expect(notes).toContain(
      'blob/1234567890abcdef1234567890abcdef12345678/docs/operations/release-artifact-and-image-verification.md',
    )
    expect(() => renderDeploymentProvenanceNotes(plan, ' ')).toThrow(
      'Missing required option --attestation-url',
    )
  })

  it('builds connected and offline GitHub CLI verification commands', () => {
    const connected = buildGhVerificationArgs(
      verificationOptions('/tmp/archive.tar.gz'),
    )
    expect(connected).toEqual([
      'attestation',
      'verify',
      '/tmp/archive.tar.gz',
      '--repo',
      plan.repository,
      '--signer-workflow',
      'viscalyx/Kravhantering/.github/workflows/container-release.yml',
      '--source-digest',
      plan.commitSha,
      '--source-ref',
      plan.ref,
      '--predicate-type',
      RELEASE_ATTESTATION_PREDICATE_TYPE,
      '--format',
      'json',
    ])
    expect(
      buildGhVerificationArgs(
        verificationOptions('/tmp/archive.tar.gz', {
          bundle: '/tmp/archive.sigstore.json',
          trustedRoot: '/tmp/trusted-root.jsonl',
        }),
      ),
    ).toEqual([
      ...connected,
      '--bundle',
      '/tmp/archive.sigstore.json',
      '--custom-trusted-root',
      '/tmp/trusted-root.jsonl',
    ])
    expect(() =>
      buildGhVerificationArgs(
        verificationOptions('/tmp/archive.tar.gz', { bundle: '/tmp/bundle' }),
      ),
    ).toThrow('--bundle and --trusted-root must be supplied together')
    expect(() =>
      buildGhVerificationArgs(
        verificationOptions('/tmp/archive.tar.gz', {
          trustedRoot: '/tmp/root',
        }),
      ),
    ).toThrow('--bundle and --trusted-root must be supplied together')
    expect(() =>
      buildGhVerificationArgs(
        verificationOptions('/tmp/archive.tar.gz', { repository: '' }),
      ),
    ).toThrow('Missing required option --repository')
  })

  it('accepts only an attestation matching the exact file and release', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-'))
    const subject = path.join(directory, 'archive.tar.gz')
    fs.writeFileSync(subject, 'release bytes')
    const options = verificationOptions(subject)
    const fixture = verificationFixture(subject, () => {})

    try {
      expect(verificationMatchesPolicy(fixture, options)).toBe(true)
      expect(verificationMatchesPolicy({}, options)).toBe(false)
      expect(() =>
        verificationMatchesPolicy(
          verificationFixture(subject, statement => {
            delete statement.predicate.release.version
          }),
          verificationOptions(subject, { releaseVersion: undefined }),
        ),
      ).toThrow('Missing required option --release-version')
      expect(() =>
        verificationMatchesPolicy(
          verificationFixture(subject, statement => {
            delete statement.predicate.release.tag
          }),
          verificationOptions(subject, { releaseTag: undefined }),
        ),
      ).toThrow('Missing required option --release-tag')

      const mutations = [
        statement => {
          statement.predicateType = 'https://example.invalid/predicate'
        },
        statement => {
          statement.predicate.schemaVersion = 2
        },
        statement => {
          statement.predicate.repository = 'other/repository'
        },
        statement => {
          statement.predicate.source.commitSha = '0'.repeat(40)
        },
        statement => {
          statement.predicate.source.ref = 'refs/heads/untrusted'
        },
        statement => {
          statement.predicate.release.version = 'unexpected'
        },
        statement => {
          statement.predicate.release.tag = `${plan.releaseTagName}-unexpected`
        },
        statement => {
          statement.subject[0].name = 'other.tar.gz'
        },
        statement => {
          statement.subject[0].digest.sha256 = '0'.repeat(64)
        },
      ]

      for (const mutate of mutations) {
        expect(
          verificationMatchesPolicy(
            verificationFixture(subject, mutate),
            options,
          ),
        ).toBe(false)
      }
    } finally {
      fs.rmSync(directory, { recursive: true })
    }
  })

  it('runs GitHub CLI and rejects malformed or mismatched results', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-gh-'))
    const subject = path.join(directory, 'archive.tar.gz')
    fs.writeFileSync(subject, 'release bytes')
    const options = verificationOptions(subject)
    const fixture = verificationFixture(subject, () => {})
    const execFileSyncImpl = vi.fn(() => JSON.stringify(fixture))

    try {
      expect(verifyDeploymentProvenance(options, { execFileSyncImpl })).toEqual(
        fixture,
      )
      expect(execFileSyncImpl).toHaveBeenCalledWith(
        'gh',
        buildGhVerificationArgs(options),
        { encoding: 'utf8', timeout: 30_000 },
      )
      expect(() =>
        verifyDeploymentProvenance(options, {
          execFileSyncImpl: () => 'not json',
        }),
      ).toThrow('GitHub CLI returned invalid verification JSON')
      expect(() =>
        verifyDeploymentProvenance(options, {
          execFileSyncImpl: () =>
            JSON.stringify(
              verificationFixture(subject, statement => {
                statement.predicate.release.version = 'unexpected'
              }),
            ),
        }),
      ).toThrow('Attestation does not match the expected release identity')
    } finally {
      fs.rmSync(directory, { recursive: true })
    }
  })

  it('writes predicates, appends notes, and verifies through the CLI adapter', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-cli-'))
    const planPath = path.join(directory, 'plan.json')
    const predicatePath = path.join(directory, 'metadata', 'predicate.json')
    const notesPath = path.join(directory, 'notes.md')
    const subject = path.join(directory, 'archive.tar.gz')
    const deploymentDir = path.join(directory, 'deployment')
    const bundleRoot = path.join(
      deploymentDir,
      'kravhantering-production-deploy-1.2.0-preview.4',
    )
    const guidePath = path.join(directory, 'verification.md')
    fs.writeFileSync(planPath, JSON.stringify(plan))
    fs.writeFileSync(notesPath, '# Existing notes\n')
    fs.writeFileSync(subject, 'release bytes')
    fs.mkdirSync(bundleRoot, { recursive: true })
    fs.writeFileSync(
      path.join(bundleRoot, 'DEPLOYMENT-MANIFEST.json'),
      JSON.stringify({ files: ['DEPLOYMENT-MANIFEST.json'] }),
    )
    fs.writeFileSync(guidePath, '# Verification\n')
    const consoleObj = { log: vi.fn() }

    try {
      await expect(
        main(['predicate', '--plan', planPath, '--output', predicatePath]),
      ).resolves.toBe(0)
      expect(JSON.parse(fs.readFileSync(predicatePath, 'utf8'))).toEqual(
        createDeploymentReleasePredicate(plan),
      )

      await expect(
        main([
          'stage-guide',
          '--plan',
          planPath,
          '--deployment-dir',
          deploymentDir,
          '--guide',
          guidePath,
        ]),
      ).resolves.toBe(0)
      expect(
        fs.readFileSync(
          path.join(
            bundleRoot,
            'docs/operations/release-artifact-and-image-verification.md',
          ),
          'utf8',
        ),
      ).toBe('# Verification\n')
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(bundleRoot, 'DEPLOYMENT-MANIFEST.json'),
            'utf8',
          ),
        ).files,
      ).toEqual([
        'DEPLOYMENT-MANIFEST.json',
        'docs/operations/release-artifact-and-image-verification.md',
      ])

      await expect(
        main([
          'append-notes',
          '--plan',
          planPath,
          '--notes',
          notesPath,
          '--attestation-url',
          'https://github.com/viscalyx/Kravhantering/attestations/123',
        ]),
      ).resolves.toBe(0)
      expect(fs.readFileSync(notesPath, 'utf8')).toMatch(
        /^# Existing notes\n\n## Deployment archive provenance verification/u,
      )

      await expect(
        main(
          [
            'verify',
            '--subject',
            subject,
            '--repository',
            plan.repository,
            '--signer-workflow',
            'viscalyx/Kravhantering/.github/workflows/container-release.yml',
            '--source-digest',
            plan.commitSha,
            '--source-ref',
            plan.ref,
            '--release-version',
            plan.version,
            '--release-tag',
            plan.releaseTagName,
          ],
          {
            consoleObj,
            execFileSyncImpl: () =>
              JSON.stringify(verificationFixture(subject, () => {})),
          },
        ),
      ).resolves.toBe(0)
      expect(consoleObj.log).toHaveBeenCalledWith(
        'Deployment archive provenance verified.',
      )

      await expect(main(['unknown'])).rejects.toThrow('Usage:')
      await expect(main(['verify', '--subject'])).rejects.toThrow(
        'Invalid option sequence',
      )
    } finally {
      fs.rmSync(directory, { recursive: true })
    }
  })
})
