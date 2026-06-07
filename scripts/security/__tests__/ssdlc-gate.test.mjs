import { describe, expect, it, vi } from 'vitest'
import {
  checkboxState,
  classifyChangedFiles,
  evaluateSsdlcGate,
  formatGateReport,
  main,
  matchesPathPattern,
  parseArgs,
  readPullRequestFromGitHub,
} from '../ssdlc-gate.mjs'

const completePrBody = `## SSDLC Gate

- [x] There are no security requirements, data protection impact or threat model impact, and no security tests are needed for this change. <!-- DO NOT REMOVE: ssdlc:requirements -->
`

describe('SSDLC gate', () => {
  it('does not require evidence for ordinary documentation changes', () => {
    const result = evaluateSsdlcGate({
      changedFiles: ['docs/README.md'],
      prBody: '',
    })

    expect(result).toMatchObject({
      passed: true,
      requiresGate: false,
    })
    expect(formatGateReport(result)).toBe(
      'SSDLC gate not required: no security-sensitive paths changed.',
    )
  })

  it('classifies security-sensitive paths by responsibility area', () => {
    expect(
      matchesPathPattern('./app/api/requirements/route.ts', 'app/**'),
    ).toBe(true)
    expect(matchesPathPattern('docs/note.md', 'app/**')).toBe(false)
    expect(matchesPathPattern('lib', 'lib/**')).toBe(true)
    expect(matchesPathPattern('', 'lib/**')).toBe(false)
    expect(matchesPathPattern('SECURITY.md', 'SECURITY.md')).toBe(true)

    const groups = classifyChangedFiles([
      'app/api/requirements/route.ts',
      'typeorm/migrations/0013_example.mjs',
      'package-lock.json',
    ])

    expect(groups.map(group => group.id)).toEqual(
      expect.arrayContaining([
        'api',
        'application-code',
        'database',
        'dependency-supply-chain',
      ]),
    )
  })

  it('parses checkbox states', () => {
    expect(checkboxState(completePrBody, 'requirements')).toBe('checked')
    expect(
      checkboxState(
        completePrBody.replace(
          '- [x] There are no security requirements, data protection impact or threat model impact, and no security tests are needed for this change. <!-- DO NOT REMOVE: ssdlc:requirements -->',
          '- [ ] There are no security requirements, data protection impact or threat model impact, and no security tests are needed for this change. <!-- DO NOT REMOVE: ssdlc:requirements -->',
        ),
        'requirements',
      ),
    ).toBe('unchecked')
    expect(checkboxState(completePrBody, 'unknown')).toBe('missing')
  })

  it('fails when security-sensitive changes have no completed PR evidence', () => {
    const result = evaluateSsdlcGate({
      changedFiles: ['app/api/requirements/route.ts'],
      prBody: '',
    })

    expect(result.passed).toBe(false)
    expect(result.requiresGate).toBe(true)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Missing SSDLC checkbox marker "ssdlc:requirements" in the PR body.',
      ]),
    )
    expect(formatGateReport(result)).toContain('app/api/requirements/route.ts')
  })

  it('passes when the SSDLC checkbox is completed', () => {
    const result = evaluateSsdlcGate({
      changedFiles: ['lib/auth/session.ts'],
      prBody: completePrBody,
    })

    expect(result.passed).toBe(true)
    expect(result.requiresGate).toBe(true)
    expect(formatGateReport(result)).toContain('SSDLC gate passed')
  })

  it('requires the SSDLC checkbox to be checked', () => {
    const incompleteBody = completePrBody.replace(
      '- [x] There are no security requirements, data protection impact or threat model impact, and no security tests are needed for this change. <!-- DO NOT REMOVE: ssdlc:requirements -->',
      '- [ ] There are no security requirements, data protection impact or threat model impact, and no security tests are needed for this change. <!-- DO NOT REMOVE: ssdlc:requirements -->',
    )

    const result = evaluateSsdlcGate({
      changedFiles: ['lib/privacy/display-name.ts'],
      prBody: incompleteBody,
    })

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'SSDLC checkbox is not checked: There are no security requirements, data protection impact or threat model impact, and no security tests are needed for this change.',
      ]),
    )
  })

  it('reads pull request body and paginated changed files from GitHub', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      filename: `app/file-${index}.ts`,
    }))
    const secondPage = [{ filename: 'docs/security-ci.md' }]
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('/files?per_page=100&page=1')) {
          return firstPage
        }
        if (String(url).includes('/files?per_page=100&page=2')) {
          return secondPage
        }
        return { body: completePrBody }
      },
    }))

    const result = await readPullRequestFromGitHub({
      fetchImpl,
      prNumber: '42',
      repository: 'viscalyx/Kravhantering',
      token: 'token',
    })

    expect(result.prBody).toBe(completePrBody)
    expect(result.changedFiles).toHaveLength(101)
    expect(result.changedFiles.at(-1)).toBe('docs/security-ci.md')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('classifies current and previous paths for renamed GitHub PR files', async () => {
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('/files?per_page=100&page=1')) {
          return [
            {
              filename: 'docs/security-ci.md',
              previous_filename: 'lib/auth/session.ts',
            },
          ]
        }
        return { body: completePrBody }
      },
    }))

    const input = await readPullRequestFromGitHub({
      fetchImpl,
      prNumber: '42',
      repository: 'viscalyx/Kravhantering',
      token: 'token',
    })
    const result = evaluateSsdlcGate(input)

    expect(input.changedFiles).toEqual([
      'docs/security-ci.md',
      'lib/auth/session.ts',
    ])
    expect(result.sensitiveGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          files: ['lib/auth/session.ts'],
          id: 'authentication-authorization',
        }),
        expect.objectContaining({
          files: ['docs/security-ci.md'],
          id: 'ci-release-security',
        }),
      ]),
    )
  })

  it('rejects invalid GitHub inputs and API failures', async () => {
    await expect(
      readPullRequestFromGitHub({
        fetchImpl: vi.fn(),
        prNumber: '42',
        repository: 'invalid',
        token: 'token',
      }),
    ).rejects.toThrow('Invalid GitHub repository')

    await expect(
      readPullRequestFromGitHub({
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status: 500,
        })),
        prNumber: '42',
        repository: 'viscalyx/Kravhantering',
        token: 'token',
      }),
    ).rejects.toThrow('GitHub API request failed (500)')
  })

  it('runs the local CLI path from changed-file and PR-body inputs', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const fsImpl = {
      readFileSync: vi.fn(filePath => {
        if (filePath === 'changed.txt') return 'lib/auth/session.ts\n'
        if (filePath === 'body.md') return completePrBody
        throw new Error(`Unexpected file: ${filePath}`)
      }),
    }

    const exitCode = await main(
      ['--changed-files', 'changed.txt', '--pr-body', 'body.md'],
      {
        consoleObj,
        fsImpl,
      },
    )

    expect(exitCode).toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      expect.stringContaining('SSDLC gate passed'),
    )
    expect(consoleObj.error).not.toHaveBeenCalled()
  })

  it('reports CLI help and validation errors', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }

    expect(parseArgs(['--github-pr', '42'])).toEqual({ 'github-pr': '42' })
    expect(() => parseArgs(['unexpected'])).toThrow('Unexpected argument')
    expect(() => parseArgs(['--github-pr'])).toThrow(
      'Missing value for --github-pr.',
    )

    await expect(main(['--help'], { consoleObj })).resolves.toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
    )

    const missingPairExitCode = await main(['--changed-files', 'changed.txt'], {
      consoleObj,
    })
    expect(missingPairExitCode).toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('--changed-files and --pr-body'),
    )
  })

  it('runs the GitHub CLI path and fails incomplete SSDLC evidence', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('/files?per_page=100&page=1')) {
          return [{ filename: 'scripts/security/ssdlc-gate.mjs' }]
        }
        return { body: completePrBody.replaceAll('[x]', '[ ]') }
      },
    }))

    const exitCode = await main(['--github-pr', '42'], {
      consoleObj,
      env: {
        GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
        GITHUB_TOKEN: 'token',
      },
      fetchImpl,
    })

    expect(exitCode).toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('SSDLC gate failed'),
    )
  })
})
