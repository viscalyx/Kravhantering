import fs from 'node:fs'

export const OPERATOR_UPGRADE_NOTES_PATH = 'docs/operator-upgrade-notes.md'
export const OPERATOR_UPGRADE_NOTES_START_MARKER =
  '<!-- operator-upgrade:notes start -->'
export const OPERATOR_UPGRADE_NOTES_END_MARKER =
  '<!-- operator-upgrade:notes end -->'
export const OPERATOR_UPGRADE_NOTES_PLACEHOLDER =
  'Write operator upgrade notes here...'

export const REQUIRED_CHECKBOXES = [
  {
    id: 'reviewed',
    label: 'Operator upgrade impact is reviewed, or explicitly not relevant.',
  },
]

export const OPTIONAL_CHECKBOXES = [
  {
    id: 'no-notes',
    label: 'No operator upgrade notes are needed.',
  },
]

export const OPERATOR_UPGRADE_PATH_RULES = [
  {
    id: 'migration-required-seed',
    label: 'database migration or required seed data',
    patterns: [
      'typeorm/migrations/**',
      'typeorm/seed-required.mjs',
      'typeorm/seed-runner.mjs',
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
  rules = OPERATOR_UPGRADE_PATH_RULES,
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
    `^[ \\t]*[-*][ \\t]*\\[([ xX])\\][ \\t]*<!--\\s*operator-upgrade:${markerId}\\s*-->`,
    'mu',
  )
}

export function checkboxState(prBody, markerId) {
  const match = String(prBody ?? '').match(markerCheckboxRegExp(markerId))
  if (!match) return 'missing'
  return match[1].toLowerCase() === 'x' ? 'checked' : 'unchecked'
}

function stripHtmlCommentMarkup(value) {
  const input = String(value ?? '')
  let output = ''
  let index = 0

  while (index < input.length) {
    if (input.startsWith('<!--', index)) {
      const commentEndIndex = input.indexOf('-->', index + 4)
      if (commentEndIndex === -1) break
      index = commentEndIndex + 3
      continue
    }

    const character = input.at(index)
    if (character !== '<' && character !== '>') {
      output += character
    }
    index += 1
  }

  return output
}

function hasMeaningfulNoteText(line) {
  return /[^\s!-]/u.test(line)
}

function operatorUpgradeNotesBlock(prBody) {
  const body = String(prBody ?? '')
  const startMarkerMatch = body.match(
    /^[ \t]*<!--\s*operator-upgrade:notes start\s*-->[ \t]*$/mu,
  )
  if (!startMarkerMatch) {
    return { notes: '', status: 'missing-start' }
  }

  const afterStartMarker = body.slice(
    startMarkerMatch.index + startMarkerMatch[0].length,
  )
  const endMarkerMatch = afterStartMarker.match(
    /^[ \t]*<!--\s*operator-upgrade:notes end\s*-->[ \t]*$/mu,
  )
  if (!endMarkerMatch) {
    return { notes: '', status: 'missing-end' }
  }

  const notesSection = afterStartMarker.slice(0, endMarkerMatch.index)
  const notes = stripHtmlCommentMarkup(notesSection)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(hasMeaningfulNoteText)
    .join('\n')

  return { notes, status: 'found' }
}

export function extractOperatorUpgradeNotes(prBody) {
  return operatorUpgradeNotesBlock(prBody).notes
}

export function evaluateOperatorUpgradeGate({ changedFiles, prBody }) {
  const scopedGroups = classifyChangedFiles(changedFiles)

  if (scopedGroups.length === 0) {
    return {
      failures: [],
      passed: true,
      requiresGate: false,
      scopedGroups,
    }
  }

  const checkboxResults = REQUIRED_CHECKBOXES.map(checkbox => ({
    ...checkbox,
    state: checkboxState(prBody, checkbox.id),
  }))
  const noNotesCheckbox = {
    ...OPTIONAL_CHECKBOXES[0],
    state: checkboxState(prBody, OPTIONAL_CHECKBOXES[0].id),
  }
  const notesBlock = operatorUpgradeNotesBlock(prBody)
  const notes = notesBlock.notes
  const hasDefaultPlaceholder = notes === OPERATOR_UPGRADE_NOTES_PLACEHOLDER
  const hasOperatorUpgradeNotes =
    notesBlock.status === 'found' && Boolean(notes) && !hasDefaultPlaceholder
  const failures = []

  for (const checkbox of checkboxResults) {
    if (checkbox.state === 'missing') {
      failures.push(
        `Missing Operator Upgrade checkbox marker "operator-upgrade:${checkbox.id}" in the PR body.`,
      )
      continue
    }

    if (checkbox.state !== 'checked') {
      failures.push(
        `Operator Upgrade checkbox is not checked: ${checkbox.label}`,
      )
    }
  }

  if (noNotesCheckbox.state === 'missing') {
    failures.push(
      'Missing Operator Upgrade checkbox marker "operator-upgrade:no-notes" in the PR body.',
    )
  }

  if (notesBlock.status === 'missing-start') {
    failures.push(
      `Missing Operator Upgrade notes start marker "${OPERATOR_UPGRADE_NOTES_START_MARKER}" in the PR body.`,
    )
  } else if (notesBlock.status === 'missing-end') {
    failures.push(
      `Missing Operator Upgrade notes end marker "${OPERATOR_UPGRADE_NOTES_END_MARKER}" in the PR body.`,
    )
  }

  if (noNotesCheckbox.state !== 'checked' && hasDefaultPlaceholder) {
    failures.push(
      'Operator Upgrade notes still contain the default placeholder. Replace it with operator notes, or remove it and check the no-notes checkbox.',
    )
  }

  if (
    noNotesCheckbox.state !== 'checked' &&
    notesBlock.status === 'found' &&
    (!notes || hasDefaultPlaceholder)
  ) {
    failures.push(
      'Operator Upgrade evidence is missing. Check "No operator upgrade notes are needed" or add operator upgrade notes between the operator-upgrade notes markers.',
    )
  }

  const normalizedFiles = new Set(changedFiles.map(normalizeChangedFile))
  if (
    noNotesCheckbox.state !== 'checked' &&
    hasOperatorUpgradeNotes &&
    !normalizedFiles.has(OPERATOR_UPGRADE_NOTES_PATH)
  ) {
    failures.push(
      `Operator Upgrade notes are provided, but ${OPERATOR_UPGRADE_NOTES_PATH} is not changed.`,
    )
  }

  return {
    checkboxResults,
    failures,
    noNotesCheckbox,
    notes,
    passed: failures.length === 0,
    requiresGate: true,
    scopedGroups,
  }
}

function formatScopedGroups(scopedGroups) {
  return scopedGroups
    .map(group => {
      const files = group.files.map(file => `    - ${file}`).join('\n')
      return `  - ${group.label} (${group.id})\n${files}`
    })
    .join('\n')
}

export function formatGateReport(result) {
  if (!result.requiresGate) {
    return 'Operator Upgrade gate not required: no migration or required seed paths changed.'
  }

  const touchedPaths = formatScopedGroups(result.scopedGroups)

  if (result.passed) {
    return [
      'Operator Upgrade gate passed for migration or required seed changes.',
      'Touched migration or required seed paths:',
      touchedPaths,
    ].join('\n')
  }

  return [
    'Operator Upgrade gate failed.',
    '',
    'This PR changes migrations or required seed data but the PR body does not contain completed operator-upgrade evidence.',
    '',
    'Touched migration or required seed paths:',
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
  node scripts/release/operator-upgrade-gate.mjs --github-pr <number>
  node scripts/release/operator-upgrade-gate.mjs --changed-files <path> --pr-body <path>`
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
      'user-agent': 'kravhantering-operator-upgrade-gate',
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

    const result = evaluateOperatorUpgradeGate(input)
    const report = formatGateReport(result)

    if (result.passed) {
      consoleObj.log(report)
      return 0
    }

    consoleObj.error(report)
    return 1
  } catch (error) {
    consoleObj.error(`Operator Upgrade gate error: ${error.message}`)
    consoleObj.error(usage())
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main()
}
