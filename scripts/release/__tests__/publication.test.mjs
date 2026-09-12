import { describe, expect, it } from 'vitest'
import { assertPublicationAllowed } from '../publication.mjs'
import { publicationFixture } from './publication-fixture.mjs'

describe('shared publisher enforcement', () => {
  it('accepts validated source notes including an explicit documentation preview', () => {
    const { plan, metadata, evidence } = publicationFixture({
      eventName: 'workflow_dispatch',
      preview: true,
      collection: { complete: true, files: ['docs/guide.md'] },
    })
    expect(
      assertPublicationAllowed(plan, metadata, evidence).notes.unreleased,
    ).toBe('Back up SQL.')
  })
  it.each(['missing', 'failure', 'cancelled', 'skipped'])(
    'blocks %s applicable validation',
    status => {
      const { plan, metadata, evidence } = publicationFixture()
      evidence.checks['Verify production stack'] =
        status === 'missing' ? undefined : status
      expect(() => assertPublicationAllowed(plan, metadata, evidence)).toThrow(
        /Verify production stack/,
      )
    },
  )
  it('blocks ineligible source, cross-run evidence and malformed source notes', () => {
    const { plan, metadata, evidence } = publicationFixture()
    expect(() => assertPublicationAllowed(plan, metadata)).toThrow(/evidence/)
    expect(() =>
      assertPublicationAllowed(plan, metadata, { ...evidence, runId: '456' }),
    ).toThrow(/mismatch/)
    expect(() =>
      assertPublicationAllowed(plan, metadata, {
        ...evidence,
        notesContent: '# Notes',
      }),
    ).toThrow(/Unreleased/)
    const docs = publicationFixture({
      collection: { complete: true, files: ['docs/guide.md'] },
    })
    expect(() =>
      assertPublicationAllowed(docs.plan, docs.metadata, docs.evidence),
    ).toThrow(/ineligible/)
  })
})

import {
  readCommittedOperatorNotes,
  readPublicationEvidence,
} from '../publication.mjs'

describe('same-run publication evidence adapter', () => {
  function fixture() {
    const f = publicationFixture()
    const env = {
      GITHUB_REPOSITORY: f.plan.repository,
      GITHUB_RUN_ID: f.plan.runId,
      GITHUB_SHA: f.plan.commitSha,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_BEFORE: 'b'.repeat(40),
    }
    const run = {
      id: 123,
      path: '.github/workflows/container-release.yml',
      head_sha: f.plan.commitSha,
      event: 'push',
      repository: { full_name: f.plan.repository },
    }
    const job = {
      name: 'Validate and Promote Trusted Container Stack (execution)',
      head_sha: f.plan.commitSha,
      steps: Object.entries(f.evidence.checks).map(([name, conclusion]) => ({
        name,
        conclusion,
      })),
    }
    const execFileSync = (command, args) => {
      if (command === 'git')
        return args[0] === 'show'
          ? f.evidence.notesContent
          : 'M\0app/page.tsx\0'
      if (args.some(arg => arg.includes('/git/ref/'))) {
        const error = new Error('Not found')
        error.stderr = 'HTTP 404'
        throw error
      }
      return JSON.stringify(
        args.includes('--paginate') ? [{ jobs: [job] }] : run,
      )
    }
    return { ...f, env, run, job, execFileSync }
  }
  it('reads source snapshots and successful steps only from the original trusted run', () => {
    const f = fixture()
    const evidence = readPublicationEvidence(f.plan, {
      env: f.env,
      execFileSync: f.execFileSync,
    })
    expect(evidence.commitSha).toBe(f.plan.commitSha)
    expect(evidence.checks['Verify production stack']).toBe('success')
    expect(
      readCommittedOperatorNotes(f.plan, { execFileSync: f.execFileSync }),
    ).toBe(f.evidence.notesContent)
  })
  it('rejects another run, workflow or job source', () => {
    const f = fixture()
    expect(() =>
      readPublicationEvidence(f.plan, {
        env: { ...f.env, GITHUB_RUN_ID: '456' },
        execFileSync: f.execFileSync,
      }),
    ).toThrow(/source repository/)
    f.run.path = '.github/workflows/quality-checks.yml'
    expect(() =>
      readPublicationEvidence(f.plan, {
        env: f.env,
        execFileSync: f.execFileSync,
      }),
    ).toThrow(/provenance/)
    f.run.path = '.github/workflows/container-release.yml'
    f.job.head_sha = 'c'.repeat(40)
    expect(() =>
      readPublicationEvidence(f.plan, {
        env: f.env,
        execFileSync: f.execFileSync,
      }),
    ).toThrow(/different source/)
    f.job.name = 'other'
    expect(() =>
      readPublicationEvidence(f.plan, {
        env: f.env,
        execFileSync: f.execFileSync,
      }),
    ).toThrow(/missing/)
  })
  it('rejects altered plan, metadata and collected selection identity', () => {
    const { plan, metadata, evidence } = publicationFixture()
    expect(() =>
      assertPublicationAllowed(
        { ...plan, releaseTagName: 'v9.9.9' },
        metadata,
        evidence,
      ),
    ).toThrow(/identity/)
    expect(() =>
      assertPublicationAllowed(
        plan,
        { ...metadata, version: '9.9.9' },
        evidence,
      ),
    ).toThrow(/metadata/)
    expect(() =>
      assertPublicationAllowed(plan, metadata, {
        ...evidence,
        selection: {
          ...evidence.selection,
          collection: { complete: true, files: ['lib/new.ts'] },
        },
      }),
    ).toThrow(/collected/)
  })
})

it('preserves stable tag publication only with its verified tagged source', () => {
  const f = publicationFixture({ ref: 'refs/tags/v1.2.3' })
  expect(
    assertPublicationAllowed(f.plan, f.metadata, f.evidence).selection
      .releaseEligible,
  ).toBe(true)
  expect(() =>
    assertPublicationAllowed(f.plan, f.metadata, {
      ...f.evidence,
      tagSha: undefined,
    }),
  ).toThrow(/Stable publication/)
})
