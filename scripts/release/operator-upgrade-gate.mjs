import fs from 'node:fs'

import {
  DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  meaningfulUnreleasedChange,
  parseOperatorUpgradeNotes,
} from './operator-upgrade-notes.mjs'

function readNonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function evaluateOperatorUpgradeGate({ prBody, baseNotes, headNotes }) {
  const failures = []
  const declarations = [
    ...String(prBody ?? '').matchAll(
      /^[-*] \[([xX])\].*<!--(?: DO NOT REMOVE:)? operator-upgrade:(updated|no-notes) -->[ \t]*$/gmu,
    ),
  ]
  if (declarations.length !== 1)
    failures.push(
      'Select exactly one declaration: "Operator notes updated" or "No operator notes needed".',
    )
  try {
    parseOperatorUpgradeNotes(headNotes)
    if (
      declarations[0]?.[2] === 'updated' &&
      !meaningfulUnreleasedChange(baseNotes, headNotes)
    )
      failures.push(
        'Updated notes require a meaningful Unreleased addition or correction.',
      )
  } catch (error) {
    failures.push(error.message)
  }
  return { failures, passed: failures.length === 0, requiresGate: true }
}

export function formatGateReport(result) {
  if (result.passed) {
    return 'Operator Upgrade gate passed.'
  }

  return [
    'Operator Upgrade gate failed.',
    '',
    'The PR declaration or committed operator guidance is incomplete.',
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
    if (!['github-pr', 'pr-body', 'base-notes', 'head-notes'].includes(key))
      throw new Error(`Unknown option: ${arg}`)
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
  node scripts/release/operator-upgrade-gate.mjs --pr-body <path> --base-notes <path> --head-notes <path>`
}

async function fetchGitHubJson(url, { fetchImpl, token }) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'kravhantering-operator-upgrade-gate',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(30_000),
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
    baseSha: pullRequest.base.sha,
    headSha: pullRequest.head.sha,
    headRepository: pullRequest.head.repo.full_name,
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
    if (parsedArgs['pr-body']) {
      input = {
        prBody: fsImpl.readFileSync(parsedArgs['pr-body'], 'utf8'),
        baseNotes: fsImpl.readFileSync(parsedArgs['base-notes'], 'utf8'),
        headNotes: fsImpl.readFileSync(parsedArgs['head-notes'], 'utf8'),
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

    if (input.headSha) {
      const readSnapshot = async (repository, sha) => {
        const url = `https://api.github.com/repos/${repository}/contents/${DEFAULT_OPERATOR_UPGRADE_NOTES_PATH}?ref=${encodeURIComponent(sha)}`
        const file = await fetchGitHubJson(url, {
          fetchImpl: options.fetchImpl ?? fetch,
          token: env.GITHUB_TOKEN,
        })
        if (file.encoding !== 'base64' || typeof file.content !== 'string')
          throw new Error('Committed notes content unavailable.')
        return Buffer.from(file.content, 'base64').toString('utf8')
      }
      input.baseNotes = await readSnapshot(env.GITHUB_REPOSITORY, input.baseSha)
      input.headNotes = await readSnapshot(input.headRepository, input.headSha)
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
