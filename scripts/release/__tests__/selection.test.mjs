import { describe, expect, it } from 'vitest'
import { selectValidation } from '../selection.mjs'

const input = {
  eventName: 'push',
  ref: 'refs/heads/main',
  commitSha: 'a'.repeat(40),
  collection: {
    complete: true,
    files: ['docs/operations/operator-upgrade-notes.md'],
  },
}
describe('shared release selection', () => {
  it('selects document checks and excludes publication for committed operator notes', () => {
    const result = selectValidation(input)
    expect(result.owners).toEqual(['documents'])
    expect(result.releaseEligible).toBe(false)
    expect(result.reasons.documents).toContain('documentation')
  })
})

describe('complete validation owners', () => {
  it.each([
    ['tests/unit/query.test.ts', ['static', 'unit', 'sql']],
    ['tests/unit/fixtures/query.ts', ['static', 'unit', 'sql']],
    ['tests/other/query.test.ts', ['static', 'unit']],
  ])('preserves the specific test owners for %s', (file, owners) => {
    const result = selectValidation({
      ...input,
      collection: { complete: true, files: [file] },
    })
    expect(result.owners).toEqual(owners)
    expect(result.releaseEligible).toBe(false)
  })
  it.each([
    ['lib/__tests__/nested/data.test.ts', ['static', 'unit'], false],
    ['packages/example/test/data.test.ts', ['static', 'unit'], false],
    [
      'containers/hsa-directory-mock/test/server.test.mjs',
      ['static', 'packages'],
      false,
    ],
    [
      'tests/integration/requirements/create.spec.ts',
      ['static', 'browser'],
      false,
    ],
    [
      'tests/integration/authentication/login.spec.ts',
      ['static', 'runtime'],
      false,
    ],
    ['tests/sql-integration/transactions.test.ts', ['static', 'sql'], false],
    ['tests/release-smoke/upgrade.spec.ts', ['static', 'trusted'], false],
    [
      'tests/helpers/session.ts',
      ['static', 'browser', 'runtime', 'sql', 'trusted'],
      false,
    ],
    [
      'playwright.config.ts',
      ['static', 'browser', 'runtime', 'trusted'],
      false,
    ],
    ['tests/performance/list.test.ts', ['static', 'performance'], false],
    ['tests/powershell/Unit/setup.Tests.ps1', ['static', 'powershell'], false],
    [
      '.devcontainer/devcontainer.json',
      ['static', 'devcontainer', 'setup', 'powershell'],
      false,
    ],
    ['scripts/azure-dev/setup.ps1', ['static', 'powershell', 'setup'], false],
    [
      '.github/workflows/integration-tests.yml',
      ['static', 'unit', 'browser', 'runtime', 'sql', 'developer'],
      false,
    ],
    [
      '.github/actions/container-candidate/action.yml',
      ['static', 'unit'],
      false,
    ],
    [
      'containers/production/bin/install.sh',
      ['static', 'unit', 'trusted'],
      true,
    ],
    [
      'app/api/route.ts',
      ['static', 'unit', 'build', 'browser', 'runtime', 'trusted'],
      true,
    ],
    [
      'package-lock.json',
      ['static', 'unit', 'packages', 'build', 'browser', 'runtime', 'trusted'],
      true,
    ],
    [
      'new-area/input.blob',
      ['static', 'unit', 'build', 'browser', 'runtime', 'trusted'],
      true,
    ],
  ])('selects complete owners for %s', (file, owners, eligible) => {
    const result = selectValidation({
      ...input,
      collection: { complete: true, files: [file] },
    })
    expect(result.owners).toEqual(expect.arrayContaining(owners))
    expect(result.releaseEligible).toBe(eligible)
  })
})

describe('event and collection boundaries', () => {
  it('unions mixed paths and uses rename destination and deleted path', () => {
    const moved = selectValidation({
      ...input,
      collection: {
        complete: true,
        files: [
          {
            status: 'renamed',
            previous_filename: 'app/page.tsx',
            filename: 'docs/page.md',
          },
        ],
      },
    })
    expect(moved.releaseEligible).toBe(false)
    expect(moved.owners).toEqual(['documents'])
    const mixed = selectValidation({
      ...input,
      collection: {
        complete: true,
        files: [
          'docs/page.md',
          { status: 'removed', filename: 'app/page.tsx' },
        ],
      },
    })
    expect(mixed.releaseEligible).toBe(true)
    expect(mixed.owners).toContain('browser')
  })
  it.each([
    undefined,
    { complete: false, files: [] },
    { complete: true, truncated: true, files: [] },
    { complete: true },
    { complete: true, files: [null] },
    { complete: true, files: ['../escape'] },
  ])('rejects incomplete or invalid collection %j', collection => {
    expect(() => selectValidation({ ...input, collection })).toThrow()
  })
  it('requires fresh complete validation for manual previews and stable tags', () => {
    const manual = selectValidation({
      ...input,
      eventName: 'workflow_dispatch',
      preview: true,
    })
    expect(manual.releaseEligible).toBe(true)
    expect(manual.owners).toContain('trusted')
    expect(
      selectValidation({ ...input, eventName: 'workflow_dispatch' })
        .releaseEligible,
    ).toBe(false)
    expect(
      selectValidation({ ...input, ref: 'refs/tags/v1.2.3' }).releaseEligible,
    ).toBe(true)
    expect(() =>
      selectValidation({
        ...input,
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/topic',
        preview: true,
      }),
    ).toThrow(/main/)
  })
  it('preserves scheduled responsibilities and excludes PR-only owners from main', () => {
    const schedule = selectValidation({
      ...input,
      eventName: 'schedule',
      workflow: 'security-api',
    })
    expect(schedule.owners).toEqual(['api'])
    const pr = selectValidation({
      ...input,
      eventName: 'pull_request',
      ref: 'refs/pull/1/merge',
      collection: { complete: true, files: ['app/page.tsx'] },
    })
    expect(pr.owners).toContain('candidates')
    expect(pr.owners).not.toContain('trusted')
    expect(pr.releaseEligible).toBe(false)
    expect(selectValidation(input).owners).not.toContain('candidates')
  })
})

it.each([
  ['tests/integration/developer-mode/overlay.spec.ts', 'developer'],
  ['tests/integration/mcp/seeded-scan.spec.ts', 'mcp'],
  ['tests/container-integration/nginx-client-ip.test.mjs', 'trusted'],
  ['vitest.config.mts', 'unit'],
  ['.github/actions/prodlike-stack/action.yml', 'runtime'],
  ['.github/actions/container-vulnerability-gate/action.yml', 'trusted'],
  ['.github/workflows/container-release.yml', 'trusted'],
  ['.github/workflows/new.yml', 'trusted'],
  ['scripts/security/generate-zap-api-openapi.mjs', 'api'],
  ['scripts/containers/production-smoke.sh', 'trusted'],
  ['scripts/prebuild.js', 'build'],
  ['biome.json', 'static'],
  ['.env.production', 'trusted'],
  ['.env.prodlike', 'runtime'],
  ['scripts/dev-curl.sh', 'runtime'],
  ['scripts/biome-lint-strict.js', 'static'],
  ['scripts/check-client-bundles.mjs', 'build'],
  ['schemathesis.toml', 'api'],
  ['scripts/openapi/generate.mjs', 'build'],
  ['.github/production-smoke/quadlet/stack.template', 'trusted'],
  ['.github/ISSUE_TEMPLATE/config.yml', 'documents'],
])('maps each known owner input %s', (file, owner) => {
  expect(
    selectValidation({
      ...input,
      collection: { complete: true, files: [file] },
    }).owners,
  ).toContain(owner)
})
it('rejects invalid identities and preview intent', () => {
  for (const value of [
    { commitSha: 'short' },
    { eventName: 'workflow_run' },
    { preview: true },
    { collection: { complete: true, files: ['/absolute'] } },
  ])
    expect(() => selectValidation({ ...input, ...value })).toThrow()
})

it('selects candidate prerequisites whenever PR assembly is selected', () => {
  const result = selectValidation({
    ...input,
    eventName: 'pull_request',
    ref: 'refs/pull/1/merge',
    workflow: 'container-pr-smoke',
    collection: {
      complete: true,
      files: ['tests/helpers/desktop-viewport.ts'],
    },
  })
  expect(result.owners).toEqual(['candidates', 'assembly'])
})
it.each([
  'topology-test.mjs',
  'runtime-substitution-test.sh',
  'runtime-wrong-server-test.sh',
  'wrong-server-decoy.mjs',
])('keeps HSA test runner %s in validation-only work', name => {
  const result = selectValidation({
    ...input,
    collection: {
      complete: true,
      files: [`containers/hsa-mtls-topology/${name}`],
    },
  })
  expect(result.owners).toContain('trusted')
  expect(result.releaseEligible).toBe(false)
})

it('selects shared reporting owners and rejects unknown workflow scope', () => {
  expect(
    selectValidation({
      ...input,
      collection: {
        complete: true,
        files: ['.github/actions/report-validation/action.yml'],
      },
    }).owners,
  ).toContain('trusted')
  expect(() => selectValidation({ ...input, workflow: 'unknown' })).toThrow(
    /Unknown workflow/,
  )
})
