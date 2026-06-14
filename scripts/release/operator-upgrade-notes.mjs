import fs from 'node:fs'
import {
  evaluateOperatorUpgradeGate,
  formatGateReport,
  readPullRequestFromGitHub,
} from './operator-upgrade-gate.mjs'

export const DEFAULT_OPERATOR_UPGRADE_NOTES_PATH =
  'docs/operator-upgrade-notes.md'
export const OPERATOR_UPGRADE_SOURCE_PREFIX = 'operator-upgrade:source'

const USAGE = `Usage:
  node scripts/release/operator-upgrade-notes.mjs sync-pr --github-pr <number> [--operator-notes <path>]
  node scripts/release/operator-upgrade-notes.mjs sync-commit-prs --commit <sha> [--operator-notes <path>]
  node scripts/release/operator-upgrade-notes.mjs archive-stable --version vX.Y.Z --date YYYY-MM-DD [--operator-notes <path>]`

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requireNonEmpty(name, value) {
  const trimmed = readNonEmpty(value)
  if (!trimmed) throw new Error(`${name} is required.`)
  return trimmed
}

function parseArgs(args) {
  const [command, ...rest] = args
  const options = {}

  if (command === '--help' || command === '-h') {
    return { command: 'help', options }
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }

  return { command, options }
}

function normalizedPullRequestNumber(prNumber) {
  const value = requireNonEmpty('Pull request number', prNumber)
  if (!/^\d+$/u.test(value)) {
    throw new Error(`Invalid pull request number: ${value}`)
  }
  return value
}

function notesPath(options) {
  return (
    readNonEmpty(options['operator-notes']) ??
    DEFAULT_OPERATOR_UPGRADE_NOTES_PATH
  )
}

function readNotesFile(filePath, fsImpl = fs) {
  try {
    return fsImpl.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Operator upgrade notes file is missing: ${filePath}.`)
    }
    throw error
  }
}

function writeNotesFile(filePath, content, fsImpl = fs) {
  fsImpl.writeFileSync(filePath, content)
}

function sourceIdForPullRequest(prNumber) {
  return `pr-${normalizedPullRequestNumber(prNumber)}`
}

export function operatorUpgradeSourceStartMarker(sourceId) {
  return `<!-- ${OPERATOR_UPGRADE_SOURCE_PREFIX} ${sourceId} start -->`
}

export function operatorUpgradeSourceEndMarker(sourceId) {
  return `<!-- ${OPERATOR_UPGRADE_SOURCE_PREFIX} ${sourceId} end -->`
}

function hasSourceMarker(content, sourceId) {
  return String(content).includes(operatorUpgradeSourceStartMarker(sourceId))
}

export function stripOperatorUpgradeSourceMarkers(content) {
  return String(content)
    .split(/\r?\n/u)
    .filter(
      line =>
        !new RegExp(
          `^\\s*<!--\\s*${OPERATOR_UPGRADE_SOURCE_PREFIX}\\s+\\S+\\s+(?:start|end)\\s*-->\\s*$`,
          'u',
        ).test(line),
    )
    .join('\n')
}

function splitUnreleasedSection(content, filePath) {
  const body = String(content ?? '')
  const headingMatch = body.match(/^##[ \t]+Unreleased[ \t]*$/mu)
  if (!headingMatch) {
    throw new Error(
      `Operator upgrade notes file ${filePath} must contain "## Unreleased".`,
    )
  }

  const sectionStart = headingMatch.index + headingMatch[0].length
  const afterHeading = body.slice(sectionStart)
  const nextReleaseHeadingIndex = afterHeading.search(/^##[ \t]+\S/mu)
  const sectionEnd =
    nextReleaseHeadingIndex === -1
      ? body.length
      : sectionStart + nextReleaseHeadingIndex

  return {
    after: body.slice(sectionEnd),
    before: body.slice(0, sectionStart),
    section: body.slice(sectionStart, sectionEnd),
  }
}

function withTrailingNewline(content) {
  return content.endsWith('\n') ? content : `${content}\n`
}

function appendBlockToSection(section, block) {
  const trimmedSection = section.trim()
  if (!trimmedSection) return `\n\n${block}\n`
  return `\n\n${trimmedSection}\n\n${block}\n`
}

export function addPullRequestNotesToContent(
  content,
  { prBody, prNumber, filePath },
) {
  const sourceId = sourceIdForPullRequest(prNumber)
  if (hasSourceMarker(content, sourceId)) {
    return { changed: false, content, reason: 'already-synced' }
  }

  const gateResult = evaluateOperatorUpgradeGate({ prBody })
  if (!gateResult.passed) {
    throw new Error(formatGateReport(gateResult))
  }

  if (
    gateResult.noNotesCheckbox.state === 'checked' ||
    !readNonEmpty(gateResult.notes)
  ) {
    return { changed: false, content, reason: 'no-notes' }
  }

  const block = [
    operatorUpgradeSourceStartMarker(sourceId),
    gateResult.notes.trim(),
    operatorUpgradeSourceEndMarker(sourceId),
  ].join('\n')
  const parts = splitUnreleasedSection(content, filePath)
  const nextContent = `${parts.before}${appendBlockToSection(parts.section, block)}${parts.after}`

  return {
    changed: nextContent !== content,
    content: nextContent,
    reason: 'synced',
  }
}

export function archiveStableOperatorUpgradeNotesContent(
  content,
  { date, filePath, version },
) {
  const stableVersion = requireNonEmpty('Stable release version', version)
  if (!/^v\d+\.\d+\.\d+$/u.test(stableVersion)) {
    throw new Error(
      `Stable release version must look like vX.Y.Z: ${stableVersion}`,
    )
  }

  const releaseDate = requireNonEmpty('Release date', date)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(releaseDate)) {
    throw new Error(`Release date must use YYYY-MM-DD: ${releaseDate}`)
  }

  const archiveHeadingPattern = new RegExp(
    `^##[ \\t]+${stableVersion.replaceAll('.', '\\.')}[ \\t]+-\\s+\\d{4}-\\d{2}-\\d{2}[ \\t]*$`,
    'mu',
  )
  if (archiveHeadingPattern.test(content)) {
    return { changed: false, content, reason: 'already-archived' }
  }

  const parts = splitUnreleasedSection(content, filePath)
  const unreleasedNotes = parts.section.trim()
  if (!unreleasedNotes) {
    return { changed: false, content, reason: 'no-notes' }
  }

  const remainingContent = parts.after.trim()
  const nextSections = [
    parts.before,
    '',
    `## ${stableVersion} - ${releaseDate}\n\n${unreleasedNotes}`,
  ]
  if (remainingContent) {
    nextSections.push('', remainingContent)
  }
  const nextContent = withTrailingNewline(nextSections.join('\n'))

  return {
    changed: nextContent !== content,
    content: nextContent,
    reason: 'archived',
  }
}

function repositoryParts(repository) {
  const cleanRepository = requireNonEmpty('GITHUB_REPOSITORY', repository)
  const [owner, repo] = cleanRepository.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository: ${cleanRepository}`)
  }
  return { owner, repo }
}

async function fetchGitHubJson(url, { fetchImpl, token }) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'kravhantering-operator-upgrade-notes',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${url}`)
  }

  return response.json()
}

export async function readPullRequestsForCommitFromGitHub({
  commit,
  fetchImpl = fetch,
  repository,
  token,
}) {
  const cleanCommit = requireNonEmpty('Commit SHA', commit)
  const cleanToken = requireNonEmpty('GITHUB_TOKEN', token)
  const { owner, repo } = repositoryParts(repository)
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}/commits/${encodeURIComponent(cleanCommit)}/pulls`

  const pullRequests = await fetchGitHubJson(url, {
    fetchImpl,
    token: cleanToken,
  })

  return Array.isArray(pullRequests) ? pullRequests : []
}

export function syncPullRequestNotesFile({
  filePath = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  fsImpl = fs,
  prBody,
  prNumber,
}) {
  const content = readNotesFile(filePath, fsImpl)
  const result = addPullRequestNotesToContent(content, {
    filePath,
    prBody,
    prNumber,
  })
  if (result.changed) {
    writeNotesFile(filePath, result.content, fsImpl)
  }
  return result
}

export function archiveStableOperatorUpgradeNotesFile({
  date,
  filePath = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  fsImpl = fs,
  version,
}) {
  const content = readNotesFile(filePath, fsImpl)
  const result = archiveStableOperatorUpgradeNotesContent(content, {
    date,
    filePath,
    version,
  })
  if (result.changed) {
    writeNotesFile(filePath, result.content, fsImpl)
  }
  return result
}

async function syncPrCommand(options, dependencies) {
  const env = dependencies.env ?? process.env
  const prNumber = normalizedPullRequestNumber(
    options['github-pr'] ?? env.PR_NUMBER ?? env.GITHUB_PR_NUMBER,
  )
  const input = await readPullRequestFromGitHub({
    fetchImpl: dependencies.fetchImpl ?? fetch,
    prNumber,
    repository: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
  })
  return syncPullRequestNotesFile({
    filePath: notesPath(options),
    fsImpl: dependencies.fsImpl ?? fs,
    prBody: input.prBody,
    prNumber,
  })
}

async function syncCommitPrsCommand(options, dependencies) {
  const env = dependencies.env ?? process.env
  const consoleObj = dependencies.consoleObj ?? console
  let pullRequests
  try {
    pullRequests = await readPullRequestsForCommitFromGitHub({
      commit: options.commit ?? env.GITHUB_SHA,
      fetchImpl: dependencies.fetchImpl ?? fetch,
      repository: env.GITHUB_REPOSITORY,
      token: env.GITHUB_TOKEN,
    })
  } catch (error) {
    consoleObj.warn(
      `Operator upgrade notes commit lookup skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { changed: false, reason: 'lookup-skipped' }
  }

  let changed = false
  let synced = 0
  for (const pullRequest of pullRequests) {
    const prNumber = pullRequest?.number
    if (!prNumber) continue

    try {
      const result = syncPullRequestNotesFile({
        filePath: notesPath(options),
        fsImpl: dependencies.fsImpl ?? fs,
        prBody: pullRequest.body ?? '',
        prNumber: String(prNumber),
      })
      changed = changed || result.changed
      if (result.reason === 'synced') synced += 1
    } catch (error) {
      consoleObj.warn(
        `Operator upgrade notes sync skipped for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return { changed, reason: synced > 0 ? 'synced' : 'no-pr-notes', synced }
}

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const fsImpl = dependencies.fsImpl ?? fs

  try {
    const { command, options } = parseArgs(args)
    if (command === 'help' || options.help) {
      consoleObj.log(USAGE)
      return 0
    }

    let result
    if (command === 'sync-pr') {
      result = await syncPrCommand(options, dependencies)
    } else if (command === 'sync-commit-prs') {
      result = await syncCommitPrsCommand(options, dependencies)
    } else if (command === 'archive-stable') {
      result = archiveStableOperatorUpgradeNotesFile({
        date: options.date,
        filePath: notesPath(options),
        fsImpl,
        version: options.version,
      })
    } else {
      consoleObj.error(USAGE)
      return 1
    }

    consoleObj.log(
      `Operator upgrade notes ${result.changed ? 'updated' : 'unchanged'} (${result.reason}).`,
    )
    return 0
  } catch (error) {
    consoleObj.error(
      `Operator upgrade notes error: ${error instanceof Error ? error.message : String(error)}`,
    )
    consoleObj.error(USAGE)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main()
}
