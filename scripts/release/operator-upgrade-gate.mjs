import fs from 'node:fs'

export const OPERATOR_UPGRADE_NOTES_START_MARKER =
  '<!-- DO NOT REMOVE: operator-upgrade:notes start -->'
export const OPERATOR_UPGRADE_NOTES_END_MARKER =
  '<!-- DO NOT REMOVE: operator-upgrade:notes end -->'
export const OPERATOR_UPGRADE_NOTES_PLACEHOLDER =
  'Write operator upgrade notes here...'

export const NO_OPERATOR_NOTES_CHECKBOX = {
  id: 'no-notes',
  label: 'No operator notes needed.',
}

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function markerCheckboxRegExp(markerId) {
  return new RegExp(
    `^[ \\t]*[-*][ \\t]*\\[([ xX])\\][^\\r\\n]*<!--[^\\r\\n]*operator-upgrade:${markerId}[^\\r\\n]*-->`,
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
    /^[ \t]*<!--[^\r\n]*operator-upgrade:notes start[^\r\n]*-->[ \t]*$/mu,
  )
  if (!startMarkerMatch) {
    return { notes: '', status: 'missing-start' }
  }

  const afterStartMarker = body.slice(
    startMarkerMatch.index + startMarkerMatch[0].length,
  )
  const endMarkerMatch = afterStartMarker.match(
    /^[ \t]*<!--[^\r\n]*operator-upgrade:notes end[^\r\n]*-->[ \t]*$/mu,
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

export function evaluateOperatorUpgradeGate({ prBody }) {
  const noNotesCheckbox = {
    ...NO_OPERATOR_NOTES_CHECKBOX,
    state: checkboxState(prBody, NO_OPERATOR_NOTES_CHECKBOX.id),
  }
  const notesBlock = operatorUpgradeNotesBlock(prBody)
  const notes = notesBlock.notes
  const hasDefaultPlaceholder = notes === OPERATOR_UPGRADE_NOTES_PLACEHOLDER
  const failures = []

  if (noNotesCheckbox.state === 'missing') {
    failures.push(
      'Missing Operator Upgrade checkbox marker "operator-upgrade:no-notes" in the PR body.',
    )
  }

  if (noNotesCheckbox.state !== 'checked') {
    if (notesBlock.status === 'missing-start') {
      failures.push(
        `Missing Operator Upgrade notes start marker "${OPERATOR_UPGRADE_NOTES_START_MARKER}" in the PR body.`,
      )
    } else if (notesBlock.status === 'missing-end') {
      failures.push(
        `Missing Operator Upgrade notes end marker "${OPERATOR_UPGRADE_NOTES_END_MARKER}" in the PR body.`,
      )
    }

    if (hasDefaultPlaceholder) {
      failures.push(
        'Operator Upgrade notes still contain the default placeholder. Replace it with operator notes, or check "No operator notes needed".',
      )
    }

    if (notesBlock.status === 'found' && (!notes || hasDefaultPlaceholder)) {
      failures.push(
        'Operator Upgrade evidence is missing. Check "No operator notes needed" or add operator notes between the operator-upgrade notes markers.',
      )
    }
  }

  return {
    failures,
    noNotesCheckbox,
    notes,
    passed: failures.length === 0,
    requiresGate: true,
  }
}

export function formatGateReport(result) {
  if (result.passed) {
    return 'Operator Upgrade gate passed.'
  }

  return [
    'Operator Upgrade gate failed.',
    '',
    'The PR body does not contain completed operator-upgrade evidence.',
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
  node scripts/release/operator-upgrade-gate.mjs --pr-body <path>`
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

  return {
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
    if (parsedArgs['changed-files']) {
      throw new Error(
        '--changed-files is no longer supported; operator upgrade evidence is read from the PR body.',
      )
    }

    if (parsedArgs['pr-body']) {
      input = {
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
