import { afterEach, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}))
vi.mock('node:fs', () => ({ default: fs }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.resetModules()
})

it.each([undefined, 'failure', 'success'])(
  'reports asset counts with publication outcome %s',
  async outcome => {
    vi.stubEnv('STEPS', JSON.stringify({ 'github-publication': { outcome } }))
    vi.stubEnv('GITHUB_STEP_SUMMARY', 'summary.md')
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        releasePage: 'preserved',
        assets: [{ name: 'bundle.tar.gz', outcome: 'preserved' }],
      }),
    )
    await import('../report-publication.mjs')
    const summary = fs.appendFileSync.mock.calls[0][1]
    expect(summary).toContain('Release page publication: preserved')
    expect(summary).toContain(
      `Required asset delivery: ${outcome ?? 'missing'}; 1 assets verified`,
    )
    expect(summary).toContain('bundle.tar.gz: preserved')
  },
)

it('reports unavailable evidence without claiming verified delivery', async () => {
  vi.stubEnv('STEPS', '{}')
  vi.stubEnv('GITHUB_STEP_SUMMARY', 'summary.md')
  fs.existsSync.mockReturnValue(false)
  await import('../report-publication.mjs')
  const summary = fs.appendFileSync.mock.calls[0][1]
  expect(summary).toContain(
    'Release page publication: missing; no verified result',
  )
  expect(summary).toContain('Required asset delivery: no verified result')
})
