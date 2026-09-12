import childProcess from 'node:child_process'
import {
  DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  parseOperatorUpgradeNotes,
} from './operator-upgrade-notes.mjs'
import { collectSelectionInput } from './select-validation.mjs'
import { selectValidation } from './selection.mjs'

export const RELEASE_IMAGE_ROLES = [
  ['appRuntime', 'app-runtime'],
  ['dbJob', 'db-job'],
  ['demoSeed', 'demo-seed'],
  ['testSupport.hsaDirectoryMock', 'hsa-directory-mock'],
  ['hsaIntegrationSupport.hsaMtlsProvisioner', 'hsa-mtls-provisioner'],
  ['hsaIntegrationSupport.hsaPersonLookupAdapter', 'hsa-person-lookup-adapter'],
]

export const PUBLICATION_CHECKS = [
  'Run trusted static and unit validation',
  'Record exact candidate image identities',
  'Gate complete candidate SBOMs against vulnerability policy',
  'Stage production deployment bundle for validation',
  'Archive production deployment bundle for validation',
  'Install production archive with rootless Quadlet',
  'Verify production stack',
]

/** Both publishers enforce this contract before any remote mutation. */
export function assertPublicationAllowed(plan, metadata, evidence) {
  if (!plan?.selection || !evidence)
    throw new Error(
      'Publication requires selection and same-run validation evidence.',
    )
  const selection = selectValidation(plan.selection)
  if (!selection.releaseEligible || !plan.createGitHubRelease)
    throw new Error('Source event is ineligible for publication.')
  if (
    plan.commitSha !== selection.commitSha ||
    plan.ref !== selection.ref ||
    plan.eventName !== selection.eventName ||
    plan.releaseTagName !== `v${plan.version}`
  )
    throw new Error('Release identity does not match selection.')
  if (
    evidence.commitSha !== plan.commitSha ||
    evidence.repository?.toLowerCase() !== plan.repository?.toLowerCase() ||
    String(evidence.runId) !== String(plan.runId) ||
    evidence.eventName !== plan.eventName ||
    evidence.ref !== plan.ref
  )
    throw new Error(
      'Validation evidence source, repository, event or run mismatch.',
    )
  const actualSelection = selectValidation(evidence.selection)
  if (
    !actualSelection.releaseEligible ||
    JSON.stringify(actualSelection.collection) !==
      JSON.stringify(selection.collection) ||
    actualSelection.preview !== selection.preview
  )
    throw new Error(
      'Publication selection does not match collected event facts.',
    )
  if (
    metadata?.commitSha !== plan.commitSha ||
    metadata.version !== plan.version ||
    metadata.releaseTagName !== plan.releaseTagName
  )
    throw new Error('Release metadata source or identity mismatch.')
  for (const name of PUBLICATION_CHECKS) {
    if (evidence.checks?.[name] !== 'success')
      throw new Error(
        `Selected validation is ${evidence.checks?.[name] ?? 'missing'}: ${name}.`,
      )
  }
  if (evidence.tagSha && evidence.tagSha !== plan.commitSha)
    throw new Error(
      `Release tag ${plan.releaseTagName} points at another source.`,
    )
  if (
    selection.ref.startsWith('refs/tags/') &&
    (evidence.tagSha !== plan.commitSha ||
      plan.releaseTagName !== selection.ref.slice('refs/tags/'.length))
  )
    throw new Error('Stable publication requires its verified source tag.')
  const owner = plan.repository.split('/')[0].toLowerCase()
  const tags = selection.ref.startsWith('refs/tags/')
    ? [plan.version]
    : [
        plan.version,
        `main-${plan.commitSha.slice(0, 12)}`,
        `sha-${plan.commitSha}`,
      ]
  for (const [objectPath, name] of RELEASE_IMAGE_ROLES) {
    const image = objectPath
      .split('.')
      .reduce((value, key) => value?.[key], metadata)
    const expected = tags.map(
      tag => `ghcr.io/${owner}/kravhantering-${name}:${tag}`,
    )
    if (JSON.stringify(image?.tags) !== JSON.stringify(expected))
      throw new Error(`Image publication identity mismatch for ${name}.`)
  }
  const notes = parseOperatorUpgradeNotes(evidence.notesContent)
  return { selection, notes }
}

export function readPublishedTag(plan, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const read = endpoint =>
    JSON.parse(
      execFileSync('gh', ['api', endpoint], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
  let value
  try {
    value = read(`repos/${plan.repository}/git/ref/tags/${plan.releaseTagName}`)
  } catch (error) {
    if (/HTTP 404/u.test(String(error.stderr))) return undefined
    throw error
  }
  let object = value.object
  for (let depth = 0; object?.type === 'tag' && depth < 8; depth++)
    object = read(`repos/${plan.repository}/git/tags/${object.sha}`).object
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/u.test(object.sha))
    throw new Error('Unverifiable Git tag object.')
  return object.sha
}

export function readCommittedOperatorNotes(plan, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  return execFileSync(
    'git',
    ['show', `${plan.commitSha}:${DEFAULT_OPERATOR_UPGRADE_NOTES_PATH}`],
    { cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

/** Read live same-run evidence; a supplied success flag or an earlier PR run cannot authorize writes. */
export function readPublicationEvidence(plan, options = {}) {
  const env = options.env ?? process.env
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const exec = (command, args) =>
    execFileSync(command, args, {
      cwd: options.cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  if (
    String(plan.runId) !== env.GITHUB_RUN_ID ||
    plan.commitSha !== env.GITHUB_SHA ||
    plan.repository?.toLowerCase() !== env.GITHUB_REPOSITORY?.toLowerCase()
  )
    throw new Error('Publisher must run in the source repository workflow run.')
  const run = JSON.parse(
    exec('gh', ['api', `repos/${plan.repository}/actions/runs/${plan.runId}`]),
  )
  if (
    run.path !== '.github/workflows/container-release.yml' ||
    run.head_sha !== plan.commitSha ||
    run.event !== plan.eventName ||
    run.repository.full_name.toLowerCase() !== plan.repository.toLowerCase()
  )
    throw new Error('Trusted release workflow provenance mismatch.')
  const pages = JSON.parse(
    exec('gh', [
      'api',
      '--paginate',
      '--slurp',
      `repos/${plan.repository}/actions/runs/${plan.runId}/jobs?filter=latest&per_page=100`,
    ]),
  )
  const job = pages
    .flatMap(page => page.jobs)
    .find(
      candidate =>
        candidate.name ===
        'Validate and Promote Trusted Container Stack (execution)',
    )
  if (!job || job.head_sha !== plan.commitSha)
    throw new Error(
      'Trusted validation job is missing or has a different source.',
    )
  const checks = Object.fromEntries(
    job.steps.map(step => [step.name, step.conclusion]),
  )
  const selection = selectValidation({
    ...collectSelectionInput(options),
    workflow: 'container-release',
  })
  return {
    repository: run.repository.full_name,
    runId: String(run.id),
    commitSha: run.head_sha,
    eventName: run.event,
    ref: env.GITHUB_REF,
    checks,
    selection,
    notesContent: readCommittedOperatorNotes(plan, options),
    tagSha: readPublishedTag(plan, options),
  }
}
