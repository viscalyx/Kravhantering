import childProcess from 'node:child_process'
import fs from 'node:fs'
import { selectValidation, WORKFLOW_OWNERS } from './selection.mjs'

/** Parse Git's NUL-delimited name-status output without quoting or rename ambiguity. */
export function changedPathFacts(text) {
  if (text && !text.endsWith('\0'))
    throw new Error('Truncated changed-path input.')
  const tokens = text.split('\0')
  tokens.pop()
  const files = []
  while (tokens.length) {
    const status = tokens.shift()
    if (!/^(?:[AMDUT]|[RC]\d+)$/u.test(status))
      throw new Error(`Invalid Git path status: ${status}`)
    const first = tokens.shift()
    const filename = /^[RC]/u.test(status) ? tokens.shift() : first
    if (!first || !filename) throw new Error('Incomplete changed-path record.')
    files.push({
      filename,
      status: status.startsWith('R')
        ? 'renamed'
        : status === 'D'
          ? 'removed'
          : 'modified',
    })
  }
  return files
}

export function collectSelectionInput({
  env = process.env,
  fsImpl = fs,
  execFileSync = childProcess.execFileSync,
  cwd = process.cwd(),
} = {}) {
  const event = env.GITHUB_EVENT_PATH
    ? JSON.parse(fsImpl.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
    : {}
  const eventName = env.GITHUB_EVENT_NAME
  const commitSha = env.GITHUB_SHA
  const ref = env.GITHUB_REF
  const git = args =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  let files = []
  if (eventName === 'pull_request') {
    if (!event.pull_request?.base?.sha || !event.pull_request?.head?.sha)
      throw new Error('PR change endpoints are required.')
    files = changedPathFacts(
      git([
        'diff',
        '--name-status',
        '-z',
        '--find-renames',
        `${event.pull_request.base.sha}...${event.pull_request.head.sha}`,
      ]),
    )
  } else if (eventName === 'push' && !ref?.startsWith('refs/tags/')) {
    const before = event.before ?? env.GITHUB_EVENT_BEFORE
    if (!/^[a-f0-9]{40}$/u.test(before ?? ''))
      throw new Error('Push before SHA is required; cannot infer changes.')
    if (/^0+$/u.test(before)) {
      const output = git(['ls-tree', '-r', '--name-only', '-z', commitSha])
      if (output && !output.endsWith('\0'))
        throw new Error('Truncated tree enumeration.')
      files = output ? output.slice(0, -1).split('\0') : []
    } else {
      files = changedPathFacts(
        git([
          'diff',
          '--name-status',
          '-z',
          '--find-renames',
          before,
          commitSha,
        ]),
      )
    }
  }
  const input = {
    eventName,
    ref,
    commitSha,
    preview: event.inputs?.preview === true || event.inputs?.preview === 'true',
    collection: { complete: true, files },
  }
  selectValidation(input)
  return input
}

export function evaluateSelectedResults(selection, results, ownerJobs) {
  const failures = []
  for (const owner of selection.owners) {
    const jobs = ownerJobs[owner]
    if (!jobs?.length)
      failures.push(`Selected owner ${owner} has no result mapping.`)
    for (const job of jobs ?? []) {
      if (results[job]?.result !== 'success')
        failures.push(`${owner}: ${job} ${results[job]?.result ?? 'missing'}`)
    }
  }
  return { passed: failures.length === 0, failures }
}

export function selectionSummary(selection) {
  return [
    `Source: ${selection.commitSha} (${selection.eventName}, ${selection.ref})`,
    `Publication eligible: ${selection.releaseEligible}. ${selection.releaseReason}.`,
    ...selection.classifications.map(
      fact => `- ${fact.path}: ${fact.category}`,
    ),
    ...Object.entries(selection.reasons).map(
      ([owner, reason]) =>
        `- ${owner}: ${selection.owners.includes(owner) ? 'Selected' : 'Native skip'}. ${reason}`,
    ),
  ].join('\n')
}

/* v8 ignore start -- CLI serialization and process exit only. */
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv[2] === 'report') {
      if (process.env.SELECTION_RESULT !== 'success')
        throw new Error('Selection failed, cancelled or missing.')
      const selection = JSON.parse(process.env.SELECTION)
      if (process.env.REPORT_OWNER) {
        selection.owners = selection.owners.filter(
          owner => owner === process.env.REPORT_OWNER,
        )
        selection.reasons = Object.fromEntries(
          Object.entries(selection.reasons).filter(
            ([owner]) => owner === process.env.REPORT_OWNER,
          ),
        )
      }
      const result = evaluateSelectedResults(
        selection,
        JSON.parse(process.env.NEEDS),
        JSON.parse(process.env.OWNER_JOBS),
      )
      if (!result.passed) throw new Error(result.failures.join('\n'))
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `${selectionSummary(selection)}\n${selection.owners.length ? 'Selected work completed successfully.' : 'No validation selected; policy exclusions are listed above.'}\n`,
      )
    } else {
      const workflow = process.argv[2]
      if (!WORKFLOW_OWNERS[workflow])
        throw new Error(`Unknown workflow scope: ${workflow}`)
      const selection = selectValidation({
        ...collectSelectionInput(),
        workflow,
      })
      if (process.env.GITHUB_OUTPUT)
        fs.appendFileSync(
          process.env.GITHUB_OUTPUT,
          `selection=${JSON.stringify(selection)}\nowners=${JSON.stringify(selection.owners)}\nrelease=${selection.releaseEligible}\n`,
        )
      const summary = selectionSummary(selection)
      console.log(summary)
      if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
/* v8 ignore stop */
