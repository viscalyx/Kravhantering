import fs from 'node:fs'

export const REQUIRED_CHECKBOXES = [
  {
    id: 'requirements',
    label: 'Security requirements are identified, or explicitly not relevant.',
  },
  {
    id: 'tests',
    label: 'Security tests are added/run, or explicitly not required.',
  },
  {
    id: 'privacy',
    label: 'Data protection impact is assessed, or explicitly not relevant.',
  },
  {
    id: 'threat-model',
    label: 'Threat model impact is assessed, or explicitly not required.',
  },
  {
    id: 'approval',
    label:
      'Security reviewer approval is complete, requested, or covered by CODEOWNERS.',
  },
]

export const SSDLC_NOTES_MARKER = '<!-- ssdlc:notes -->'

export const SECURITY_SENSITIVE_PATH_RULES = [
  {
    id: 'application-code',
    label: 'application code',
    patterns: ['app/**', 'components/**', 'lib/**'],
  },
  {
    id: 'api',
    label: 'API contract or route',
    patterns: ['app/api/**', 'openapi/**', 'schemathesis.toml'],
  },
  {
    id: 'authentication-authorization',
    label: 'authentication, authorization, or session boundary',
    patterns: [
      'middleware.ts',
      'lib/auth/**',
      'lib/access-review/**',
      'lib/http/**',
    ],
  },
  {
    id: 'audit-logging',
    label: 'audit, logging, or observability',
    patterns: [
      'lib/audit/**',
      'lib/observability/**',
      'docs/audit-log.md',
      'docs/api-security.md',
    ],
  },
  {
    id: 'personal-data',
    label: 'personal-data or privacy surface',
    patterns: [
      'lib/privacy/**',
      'docs/informationsmangder-kravhantering.md',
      'docs/privacy-data-portability.md',
    ],
  },
  {
    id: 'database',
    label: 'database schema, migration, or persistence layer',
    patterns: ['lib/typeorm/**', 'typeorm/**'],
  },
  {
    id: 'requirements-domain',
    label: 'requirements domain behavior',
    patterns: ['lib/requirements/**', 'lib/archiving/**'],
  },
  {
    id: 'ai-mcp',
    label: 'AI or MCP integration',
    patterns: [
      'lib/ai/**',
      'lib/mcp/**',
      'docs/mcp-security-test-plan.md',
      'docs/mcp-seeded-dast.md',
      'docs/mcp-server-contributor-guide.md',
      'docs/mcp-server-user-guide.md',
    ],
  },
  {
    id: 'dependency-supply-chain',
    label: 'dependency or supply-chain input',
    patterns: [
      'package.json',
      'package-lock.json',
      '.github/dependabot.yml',
      'containers/**',
    ],
  },
  {
    id: 'ci-release-security',
    label: 'CI, release, or security workflow',
    patterns: [
      '.github/workflows/**',
      '.github/CODEOWNERS',
      '.github/pull_request_template.md',
      'SECURITY.md',
      'docs/security-ci.md',
      'docs/container-release-workflow.md',
      'scripts/security/**',
      'scripts/release/**',
      'scripts/containers/**',
    ],
  },
]

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function normalizeChangedFile(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//u, '')
}

export function matchesPathPattern(filePath, pattern) {
  const normalizedFilePath = normalizeChangedFile(filePath)
  const normalizedPattern = normalizeChangedFile(pattern)

  if (!normalizedFilePath || !normalizedPattern) return false

  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3)
    return (
      normalizedFilePath === prefix ||
      normalizedFilePath.startsWith(`${prefix}/`)
    )
  }

  return normalizedFilePath === normalizedPattern
}

export function classifyChangedFiles(
  changedFiles,
  rules = SECURITY_SENSITIVE_PATH_RULES,
) {
  const normalizedFiles = [...new Set(changedFiles.map(normalizeChangedFile))]
    .filter(Boolean)
    .sort()

  return rules
    .map(rule => ({
      ...rule,
      files: normalizedFiles.filter(file =>
        rule.patterns.some(pattern => matchesPathPattern(file, pattern)),
      ),
    }))
    .filter(rule => rule.files.length > 0)
}

function markerCheckboxRegExp(markerId) {
  return new RegExp(
    `^[ \\t]*[-*][ \\t]*\\[([ xX])\\][ \\t]*<!--\\s*ssdlc:${markerId}\\s*-->`,
    'mu',
  )
}

export function checkboxState(prBody, markerId) {
  const match = String(prBody ?? '').match(markerCheckboxRegExp(markerId))
  if (!match) return 'missing'
  return match[1].toLowerCase() === 'x' ? 'checked' : 'unchecked'
}

export function extractSsdlcNotes(prBody) {
  const body = String(prBody ?? '')
  const markerIndex = body.indexOf(SSDLC_NOTES_MARKER)
  if (markerIndex === -1) return ''

  const afterMarker = body.slice(markerIndex + SSDLC_NOTES_MARKER.length)
  const nextHeadingIndex = afterMarker.search(/^##\s+/mu)
  const notesSection =
    nextHeadingIndex === -1
      ? afterMarker
      : afterMarker.slice(0, nextHeadingIndex)

  return notesSection
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function evaluateSsdlcGate({ changedFiles, prBody }) {
  const sensitiveGroups = classifyChangedFiles(changedFiles)

  if (sensitiveGroups.length === 0) {
    return {
      failures: [],
      passed: true,
      requiresGate: false,
      sensitiveGroups,
    }
  }

  const checkboxResults = REQUIRED_CHECKBOXES.map(checkbox => ({
    ...checkbox,
    state: checkboxState(prBody, checkbox.id),
  }))
  const notes = extractSsdlcNotes(prBody)
  const failures = []

  for (const checkbox of checkboxResults) {
    if (checkbox.state === 'missing') {
      failures.push(
        `Missing SSDLC checkbox marker "ssdlc:${checkbox.id}" in the PR body.`,
      )
      continue
    }

    if (checkbox.state !== 'checked') {
      failures.push(`SSDLC checkbox is not checked: ${checkbox.label}`)
    }
  }

  if (!notes) {
    failures.push(
      'SSDLC notes are missing. Add requirement IDs, test evidence, privacy impact, threat-model decision, and approval context.',
    )
  }

  return {
    checkboxResults,
    failures,
    notes,
    passed: failures.length === 0,
    requiresGate: true,
    sensitiveGroups,
  }
}

function formatSensitiveGroups(sensitiveGroups) {
  return sensitiveGroups
    .map(group => {
      const files = group.files.map(file => `    - ${file}`).join('\n')
      return `  - ${group.label} (${group.id})\n${files}`
    })
    .join('\n')
}

export function formatGateReport(result) {
  if (!result.requiresGate) {
    return 'SSDLC gate not required: no security-sensitive paths changed.'
  }

  const touchedPaths = formatSensitiveGroups(result.sensitiveGroups)

  if (result.passed) {
    return [
      'SSDLC gate passed for security-sensitive changes.',
      'Touched security-sensitive paths:',
      touchedPaths,
    ].join('\n')
  }

  return [
    'SSDLC gate failed.',
    '',
    'This PR changes security-sensitive paths but the PR body does not contain completed SSDLC evidence.',
    '',
    'Touched security-sensitive paths:',
    touchedPaths,
    '',
    'Required fixes:',
    ...result.failures.map(failure => `  - ${failure}`),
  ].join('\n')
}

export function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }

    options[key] = value
    index += 1
  }

  return options
}

function usage() {
  return `Usage:
  node scripts/security/ssdlc-gate.mjs --github-pr <number>
  node scripts/security/ssdlc-gate.mjs --changed-files <path> --pr-body <path>`
}

function readChangedFiles(filePath, fsImpl = fs) {
  return fsImpl
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map(normalizeChangedFile)
    .filter(Boolean)
}

async function fetchGitHubJson(url, { fetchImpl, token }) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'kravhantering-ssdlc-gate',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${url}`)
  }

  return response.json()
}

export async function readPullRequestFromGitHub({
  fetchImpl = fetch,
  prNumber,
  repository,
  token,
}) {
  const cleanRepository = readNonEmpty(repository)
  const cleanToken = readNonEmpty(token)
  const cleanPrNumber = readNonEmpty(prNumber)

  if (!cleanRepository) throw new Error('GITHUB_REPOSITORY is required.')
  if (!cleanToken) throw new Error('GITHUB_TOKEN is required.')
  if (!cleanPrNumber) throw new Error('Pull request number is required.')

  const [owner, repo] = cleanRepository.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository: ${cleanRepository}`)
  }

  const encodedOwner = encodeURIComponent(owner)
  const encodedRepo = encodeURIComponent(repo)
  const encodedPrNumber = encodeURIComponent(cleanPrNumber)
  const baseUrl = `https://api.github.com/repos/${encodedOwner}/${encodedRepo}/pulls/${encodedPrNumber}`
  const pullRequest = await fetchGitHubJson(baseUrl, {
    fetchImpl,
    token: cleanToken,
  })

  const changedFiles = []
  for (let page = 1; page <= 100; page += 1) {
    const files = await fetchGitHubJson(
      `${baseUrl}/files?per_page=100&page=${page}`,
      {
        fetchImpl,
        token: cleanToken,
      },
    )
    for (const file of files) {
      changedFiles.push(file.filename)
      if (file.previous_filename) {
        changedFiles.push(file.previous_filename)
      }
    }
    if (files.length < 100) break
  }

  return {
    changedFiles,
    prBody: pullRequest.body ?? '',
  }
}

export async function main(args = process.argv.slice(2), options = {}) {
  const consoleObj = options.consoleObj ?? console
  const env = options.env ?? process.env
  const fsImpl = options.fsImpl ?? fs

  try {
    const parsedArgs = parseArgs(args)

    if (parsedArgs.help) {
      consoleObj.log(usage())
      return 0
    }

    let input
    if (parsedArgs['changed-files'] || parsedArgs['pr-body']) {
      if (!parsedArgs['changed-files'] || !parsedArgs['pr-body']) {
        throw new Error(
          '--changed-files and --pr-body must be provided together.',
        )
      }

      input = {
        changedFiles: readChangedFiles(parsedArgs['changed-files'], fsImpl),
        prBody: fsImpl.readFileSync(parsedArgs['pr-body'], 'utf8'),
      }
    } else {
      const prNumber =
        parsedArgs['github-pr'] ?? env.PR_NUMBER ?? env.GITHUB_PR_NUMBER
      input = await readPullRequestFromGitHub({
        fetchImpl: options.fetchImpl ?? fetch,
        prNumber,
        repository: env.GITHUB_REPOSITORY,
        token: env.GITHUB_TOKEN,
      })
    }

    const result = evaluateSsdlcGate(input)
    const report = formatGateReport(result)

    if (result.passed) {
      consoleObj.log(report)
      return 0
    }

    consoleObj.error(report)
    return 1
  } catch (error) {
    consoleObj.error(`SSDLC gate error: ${error.message}`)
    consoleObj.error(usage())
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main()
}
