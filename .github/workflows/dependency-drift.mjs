#!/usr/bin/env node
import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDependencyMaintenance } from '../../scripts/dependency-maintenance.mjs'
import { packageManagerVersion } from '../../scripts/install-repository-npm.mjs'

const AUTOMATION_LABEL = 'automation:dependency-drift'
const ISSUE_LABELS = [AUTOMATION_LABEL, 'dependencies', 'ready-for-agent']
const ISSUE_LIST_LIMIT = '1000'
const PLATFORM = {
  architecture: 'amd64',
  os: 'linux',
}
const ACCEPT_MANIFESTS = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/iu

export const IMAGE_CONFIGS = {
  node: {
    image: 'docker.io/library/node',
    listTags: listNodeLtsTags,
    name: 'node',
    parseTag: parseNodeTag,
    paths: [
      'containers/app/Dockerfile',
      'containers/hsa-directory-mock/Dockerfile',
      'containers/hsa-person-lookup-adapter/Dockerfile',
    ],
    registryHost: 'registry-1.docker.io',
    registryRepository: 'library/node',
    versionSortValue: version => [version.major],
  },
  nginx: {
    image: 'docker.io/library/nginx',
    listTags: () => fetchDockerHubTags('library', 'nginx'),
    lockPath: 'containers/nginx/image.lock.json',
    name: 'nginx',
    parseTag: parseNginxTag,
    registryHost: 'registry-1.docker.io',
    registryRepository: 'library/nginx',
    versionSortValue: version => [version.major, version.minor, version.patch],
  },
  sqlserver: {
    image: 'mcr.microsoft.com/mssql/server',
    listTags: () => fetchRegistryTags('mcr.microsoft.com', 'mssql/server'),
    lockPath: 'containers/sqlserver/image.lock.json',
    name: 'sqlserver',
    parseTag: parseSqlServerTag,
    registryHost: 'mcr.microsoft.com',
    registryRepository: 'mssql/server',
    versionSortValue: version => [version.year, version.cu],
  },
  keycloak: {
    image: 'quay.io/keycloak/keycloak',
    listTags: () => fetchRegistryTags('quay.io', 'keycloak/keycloak'),
    lockPath: 'containers/keycloak/image.lock.json',
    name: 'keycloak',
    parseTag: parseKeycloakTag,
    registryHost: 'quay.io',
    registryRepository: 'keycloak/keycloak',
    versionSortValue: version => [
      version.major,
      version.minor,
      version.patch,
      version.revision,
    ],
  },
  kong: {
    image: 'docker.io/kong/kong-gateway',
    listTags: () => fetchDockerHubTags('kong', 'kong-gateway'),
    lockPath: 'containers/kong/image.lock.json',
    name: 'kong',
    parseTag: parseKongTag,
    registryHost: 'registry-1.docker.io',
    registryRepository: 'kong/kong-gateway',
    versionSortValue: version => [
      version.major,
      version.minor,
      version.patch,
      version.revision,
      version.buildDate,
    ],
  },
}

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function compareArrays(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }
  return 0
}

function compareVersions(config, left, right) {
  return compareArrays(
    config.versionSortValue(left),
    config.versionSortValue(right),
  )
}

export function parseArgs(argv, env) {
  const options = {
    unit: readNonEmpty(env.DEPENDENCY_DRIFT_UNIT) ?? 'all',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg !== '--unit') {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}.`)
    }
    options.unit = value
    index += 1
  }
  return options
}

export function parseNodeTag(tag) {
  const match = tag.match(/^(?<major>[1-9]\d*)-trixie-slim$/u)
  if (!match?.groups) return null
  const major = Number(match.groups.major)
  if (major % 2 !== 0) return null
  return { major, tag }
}

export function parseKeycloakTag(tag) {
  const match = tag.match(
    /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<revision>0|[1-9]\d*))?$/u,
  )
  if (!match?.groups) return null
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    revision:
      match.groups.revision === undefined ? -1 : Number(match.groups.revision),
    tag,
  }
}

export function parseNginxTag(tag) {
  const match = tag.match(
    /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)-alpine$/u,
  )
  if (!match?.groups) return null
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    tag,
  }
}

export function parseSqlServerTag(tag) {
  const match = tag.match(
    /^(?<year>20\d{2})-CU(?<cu>0|[1-9]\d*)-ubuntu-24\.04$/u,
  )
  if (!match?.groups) return null
  return {
    cu: Number(match.groups.cu),
    tag,
    year: Number(match.groups.year),
  }
}

export function parseKongTag(tag) {
  const match = tag.match(
    /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)\.(?<revision>0|[1-9]\d*)-(?<buildDate>20\d{6})-ubuntu$/u,
  )
  if (!match?.groups) return null
  return {
    buildDate: Number(match.groups.buildDate),
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    revision: Number(match.groups.revision),
    tag,
  }
}

async function fetchOk(url, options = {}) {
  const headers = options.headers ?? {}
  let response = await fetch(url, { ...options, headers })

  if (response.status === 401) {
    const token = await tokenFromChallenge(
      response.headers.get('www-authenticate'),
    )
    if (token) {
      response = await fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${token}` },
      })
    }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}${body ? ` ${body.slice(0, 240)}` : ''}`,
    )
  }
  return response
}

function parseChallengeParameters(value) {
  const parameters = {}
  const challenge = readNonEmpty(value)
  if (!challenge) return parameters
  for (const match of challenge.matchAll(
    /(?<key>[a-z][a-z0-9_-]*)="(?<value>[^"]*)"/giu,
  )) {
    if (match.groups) parameters[match.groups.key] = match.groups.value
  }
  return parameters
}

async function tokenFromChallenge(challenge) {
  const parameters = parseChallengeParameters(challenge)
  if (!parameters.realm) return null
  const tokenUrl = new URL(parameters.realm)
  for (const key of ['service', 'scope']) {
    if (parameters[key]) tokenUrl.searchParams.set(key, parameters[key])
  }
  const response = await fetch(tokenUrl)
  if (!response.ok) return null
  const payload = await response.json()
  return readNonEmpty(payload.token) ?? readNonEmpty(payload.access_token)
}

async function fetchJson(url, options) {
  const response = await fetchOk(url, options)
  return response.json()
}

function dockerHubHeaders() {
  const token =
    readNonEmpty(process.env.DOCKERHUB_TOKEN) ??
    readNonEmpty(process.env.DOCKER_HUB_TOKEN)
  return token
    ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
    : { Accept: 'application/json' }
}

async function fetchDockerHubTags(namespace, repository) {
  const tags = []
  let url =
    `https://hub.docker.com/v2/repositories/${namespace}/${repository}` +
    '/tags?page_size=100'
  while (url) {
    const payload = await fetchJson(url, { headers: dockerHubHeaders() })
    for (const item of payload.results ?? []) {
      if (typeof item.name === 'string') tags.push(item.name)
    }
    url = readNonEmpty(payload.next)
  }
  return tags
}

function nextLink(header, host) {
  const link = readNonEmpty(header)
  if (!link) return null
  for (const part of link.split(',')) {
    const match = part.match(/<(?<url>[^>]+)>;\s*rel="?next"?/u)
    if (!match?.groups?.url) continue
    return match.groups.url.startsWith('http')
      ? match.groups.url
      : `https://${host}${match.groups.url}`
  }
  return null
}

async function fetchRegistryTags(host, repository) {
  const tags = []
  let url = `https://${host}/v2/${repository}/tags/list?n=1000`
  while (url) {
    const response = await fetchOk(url, {
      headers: { Accept: 'application/json' },
    })
    const payload = await response.json()
    for (const tag of payload.tags ?? []) {
      if (typeof tag === 'string') tags.push(tag)
    }
    url = nextLink(response.headers.get('link'), host)
  }
  return tags
}

async function listNodeLtsTags() {
  const releases = await fetchJson('https://nodejs.org/dist/index.json')
  const majors = new Set()
  for (const release of releases) {
    const match = String(release.version ?? '').match(/^v(?<major>\d+)\./u)
    const major = Number(match?.groups?.major)
    if (release.lts && major % 2 === 0) majors.add(major)
  }
  if (majors.size === 0) {
    throw new Error('Node.js release index returned no even LTS releases.')
  }
  return [...majors].map(major => `${major}-trixie-slim`)
}

function normalizeDigest(value, context) {
  const digest = readNonEmpty(value)
  if (!digest || !DIGEST_PATTERN.test(digest)) {
    throw new Error(`${context} did not resolve to a sha256 digest.`)
  }
  return digest
}

function isImageIndex(manifest) {
  return Array.isArray(manifest?.manifests)
}

function isImageManifest(manifest) {
  return Boolean(manifest?.config?.digest)
}

async function fetchManifest(config, reference) {
  const url = `https://${config.registryHost}/v2/${config.registryRepository}/manifests/${reference}`
  const response = await fetchOk(url, {
    headers: { Accept: ACCEPT_MANIFESTS },
  })
  return {
    digest: response.headers.get('docker-content-digest'),
    manifest: await response.json(),
  }
}

function selectPlatformManifest(manifest, config, tag) {
  const descriptor = manifest.manifests.find(item => {
    const platform = item.platform ?? {}
    return (
      platform.os === PLATFORM.os &&
      platform.architecture === PLATFORM.architecture
    )
  })
  if (!descriptor?.digest) {
    throw new Error(
      `${config.name}:${tag} does not include ${PLATFORM.os}/${PLATFORM.architecture}.`,
    )
  }
  return descriptor.digest
}

export async function resolveImageIdentity(config, tag) {
  const first = await fetchManifest(config, tag)
  if (isImageIndex(first.manifest)) {
    const platformDigest = selectPlatformManifest(first.manifest, config, tag)
    const second = await fetchManifest(config, platformDigest)
    if (!isImageManifest(second.manifest)) {
      throw new Error(`${config.name}:${tag} platform manifest has no config.`)
    }
    return {
      imageId: normalizeDigest(
        second.manifest.config.digest,
        `${config.name}:${tag} image ID`,
      ),
      manifestDigest: normalizeDigest(
        second.digest ?? platformDigest,
        `${config.name}:${tag} manifest digest`,
      ),
    }
  }
  if (!isImageManifest(first.manifest)) {
    throw new Error(`${config.name}:${tag} manifest has no config.`)
  }
  return {
    imageId: normalizeDigest(
      first.manifest.config.digest,
      `${config.name}:${tag} image ID`,
    ),
    manifestDigest: normalizeDigest(
      first.digest,
      `${config.name}:${tag} manifest digest`,
    ),
  }
}

function isSameReleaseLane(config, left, right) {
  return config.versionSortValue(left)[0] === config.versionSortValue(right)[0]
}

export function selectAvailableVersion(config, tags, currentTag, options = {}) {
  const current = config.parseTag(currentTag)
  if (!current) {
    throw new Error(`${config.name} tag "${currentTag}" is unsupported.`)
  }
  let selected = current
  for (const tag of tags) {
    const candidate = config.parseTag(tag)
    if (
      candidate &&
      (!options.sameLaneOnly ||
        isSameReleaseLane(config, candidate, current)) &&
      compareVersions(config, candidate, current) >= 0 &&
      compareVersions(config, candidate, selected) > 0
    ) {
      selected = candidate
    }
  }
  return selected
}

function imageStatesDiffer(current, available) {
  return (
    current.tag !== available.tag ||
    current.manifestDigest !== available.manifestDigest ||
    (current.imageId !== null && current.imageId !== available.imageId)
  )
}

export function readNodeCurrent(config, root = process.cwd()) {
  const states = []
  for (const dockerfilePath of config.paths) {
    const source = fs.readFileSync(path.join(root, dockerfilePath), 'utf8')
    for (const match of source.matchAll(
      /^FROM node:(?<tag>[^@\s]+)@(?<digest>sha256:[a-f0-9]{64})(?:\s+AS\s+\S+)?$/gimu,
    )) {
      states.push({
        manifestDigest: match.groups.digest,
        tag: match.groups.tag,
      })
    }
  }
  if (states.length === 0) {
    throw new Error('No production Node base image references were found.')
  }
  const unique = new Set(
    states.map(state => `${state.tag}@${state.manifestDigest}`),
  )
  if (unique.size !== 1) {
    throw new Error('Production Node base image references are not aligned.')
  }
  return { ...states[0], imageId: null }
}

function readLockCurrent(config, root) {
  const current = readJson(path.join(root, config.lockPath))
  if (current.image !== config.image) {
    throw new Error(`${config.lockPath} does not match ${config.image}.`)
  }
  return {
    imageId: normalizeDigest(current.imageId, `${config.name} image ID`),
    manifestDigest: normalizeDigest(
      current.manifestDigest,
      `${config.name} manifest digest`,
    ),
    tag: current.tag,
  }
}

export async function detectImageDrift(
  unit,
  root = process.cwd(),
  dependencies = {},
) {
  const config = IMAGE_CONFIGS[unit.detector]
  if (!config) throw new Error(`Unknown image detector "${unit.detector}".`)
  const listTags = dependencies.listTags ?? config.listTags
  const resolveIdentity =
    dependencies.resolveImageIdentity ?? resolveImageIdentity
  const current =
    config.name === 'node'
      ? readNodeCurrent(config, root)
      : readLockCurrent(config, root)
  const tags = await listTags()
  const sameLaneVersion = selectAvailableVersion(config, tags, current.tag, {
    sameLaneOnly: true,
  })
  const sameLaneIdentity = await resolveIdentity(config, sameLaneVersion.tag)
  const sameLaneAvailable = {
    ...sameLaneIdentity,
    tag: sameLaneVersion.tag,
  }
  if (imageStatesDiffer(current, sameLaneAvailable)) {
    return {
      available: sameLaneAvailable,
      current,
      drift: true,
      skill: unit.skill,
      unit: unit.id,
    }
  }

  const availableVersion = selectAvailableVersion(config, tags, current.tag)
  const available =
    availableVersion.tag === sameLaneVersion.tag
      ? sameLaneAvailable
      : {
          ...(await resolveIdentity(config, availableVersion.tag)),
          tag: availableVersion.tag,
        }
  return {
    available,
    current,
    drift: imageStatesDiffer(current, available),
    skill: unit.skill,
    unit: unit.id,
  }
}

export async function detectNpmDrift(unit, root = process.cwd(), dependencies) {
  const fetchLatest =
    dependencies?.fetchLatest ??
    (async () => {
      const payload = await fetchJson('https://registry.npmjs.org/npm/latest')
      return payload.version
    })
  const packageJson = readJson(path.join(root, 'package.json'))
  const current = packageManagerVersion(packageJson)
  const available = await fetchLatest()
  if (!/^\d+\.\d+\.\d+$/u.test(String(available))) {
    throw new Error('npm registry returned an invalid latest version.')
  }
  return {
    available: { version: available },
    current: { version: current },
    drift: current !== available,
    skill: unit.skill,
    unit: unit.id,
  }
}

function issueMarker(unit) {
  return `<!-- dependency-drift:${unit} -->`
}

export function formatState(state) {
  if (state.version) return `npm ${state.version}`
  const parts = [`tag ${state.tag}`, `manifest ${state.manifestDigest}`]
  if (state.imageId) parts.push(`image ${state.imageId}`)
  return parts.join('; ')
}

export function renderIssueBody(detection, detectedAt) {
  return [
    issueMarker(detection.unit),
    '',
    `- Maintenance unit: \`${detection.unit}\``,
    `- Current state: \`${formatState(detection.current)}\``,
    `- Available state: \`${formatState(detection.available)}\``,
    `- Skill: \`$${detection.skill}\``,
    `- Detected: \`${detectedAt.toISOString()}\``,
    '',
    '## Completion checklist',
    '',
    '- [ ] Bring the maintenance unit to the available state.',
    '- [ ] Preserve compatibility and immutable identity policy.',
    '- [ ] Run all dynamically relevant verification.',
    '- [ ] Confirm a successful detector scan reports no drift.',
    '',
  ].join('\n')
}

function issueTitle(unit) {
  return `Dependency drift: ${unit}`
}

function run(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

export function listDetectorIssues(runCommand = run) {
  return JSON.parse(
    runCommand('gh', [
      'issue',
      'list',
      '--state',
      'all',
      '--label',
      AUTOMATION_LABEL,
      '--limit',
      ISSUE_LIST_LIMIT,
      '--json',
      'number,state,title,body',
    ]),
  )
}

function detectionTarget(detection) {
  return detection.available.version ?? detection.available.tag
}

function activeDeferral(registry, detection, now) {
  const today = now.toISOString().slice(0, 10)
  return (registry.deferrals ?? []).find(
    deferral =>
      deferral.unit === detection.unit &&
      deferral.available === detectionTarget(detection) &&
      deferral.expiresOn >= today,
  )
}

function issuesForUnit(issues, unit) {
  const marker = issueMarker(unit)
  return issues
    .filter(issue => issue.body?.includes(marker))
    .sort((left, right) => left.number - right.number)
}

export function planIssueActions(detections, issues, registry, now) {
  const actions = []
  for (const detection of detections) {
    const matching = issuesForUnit(issues, detection.unit)
    const primary =
      matching.find(issue => issue.state === 'OPEN') ?? matching[0] ?? null
    for (const duplicate of matching.filter(issue => issue !== primary)) {
      if (duplicate.state === 'OPEN') {
        actions.push({
          issue: duplicate.number,
          reason: 'not planned',
          type: 'close',
          unit: detection.unit,
        })
      }
    }

    const deferred = activeDeferral(registry, detection, now)
    if (!detection.drift || deferred) {
      if (primary?.state === 'OPEN') {
        actions.push({
          issue: primary.number,
          reason: deferred ? 'not planned' : 'completed',
          type: 'close',
          unit: detection.unit,
        })
      } else {
        actions.push({ type: 'unchanged', unit: detection.unit })
      }
      continue
    }

    const body = renderIssueBody(detection, now)
    if (!primary) {
      actions.push({
        body,
        title: issueTitle(detection.unit),
        type: 'create',
        unit: detection.unit,
      })
      continue
    }
    if (primary.state !== 'OPEN') {
      actions.push({
        issue: primary.number,
        type: 'reopen',
        unit: detection.unit,
      })
    }
    actions.push({
      body,
      issue: primary.number,
      title: issueTitle(detection.unit),
      type: 'edit',
      unit: detection.unit,
    })
  }
  return actions
}

function withBodyFile(body, callback) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dependency-drift-'),
  )
  const bodyPath = path.join(temporaryDirectory, 'issue.md')
  try {
    fs.writeFileSync(bodyPath, body)
    return callback(bodyPath)
  } finally {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}

function ensureAutomationLabel(runCommand) {
  runCommand(
    'gh',
    [
      'label',
      'create',
      AUTOMATION_LABEL,
      '--color',
      '8250df',
      '--description',
      'Created and maintained by dependency drift detection',
      '--force',
    ],
    { stdio: 'inherit' },
  )
}

export function executeIssueActions(actions, runCommand = run) {
  const results = {
    closed: [],
    created: [],
    reopened: [],
    unchanged: [],
    updated: [],
  }
  for (const action of actions) {
    if (action.type === 'unchanged') {
      results.unchanged.push(action.unit)
    } else if (action.type === 'close') {
      runCommand(
        'gh',
        ['issue', 'close', String(action.issue), '--reason', action.reason],
        { stdio: 'inherit' },
      )
      results.closed.push(`${action.unit} (#${action.issue})`)
    } else if (action.type === 'reopen') {
      runCommand('gh', ['issue', 'reopen', String(action.issue)], {
        stdio: 'inherit',
      })
      results.reopened.push(`${action.unit} (#${action.issue})`)
    } else if (action.type === 'create') {
      withBodyFile(action.body, bodyPath => {
        runCommand(
          'gh',
          [
            'issue',
            'create',
            '--title',
            action.title,
            '--body-file',
            bodyPath,
            '--label',
            ISSUE_LABELS.join(','),
          ],
          { stdio: 'inherit' },
        )
      })
      results.created.push(action.unit)
    } else if (action.type === 'edit') {
      withBodyFile(action.body, bodyPath => {
        runCommand(
          'gh',
          [
            'issue',
            'edit',
            String(action.issue),
            '--title',
            action.title,
            '--body-file',
            bodyPath,
            '--add-label',
            ISSUE_LABELS.join(','),
          ],
          { stdio: 'inherit' },
        )
      })
      results.updated.push(`${action.unit} (#${action.issue})`)
    }
  }
  return results
}

function selectedUnits(registry, selection) {
  const issueUnits = registry.units.filter(unit => unit.lane === 'issue')
  if (selection === 'all') return issueUnits
  const selected = issueUnits.filter(
    unit => unit.id === selection || unit.detector === selection,
  )
  if (selected.length !== 1) {
    throw new Error(`Unknown dependency drift unit "${selection}".`)
  }
  return selected
}

export async function detectUnits(units, root, dependencies = {}) {
  const detections = []
  for (const unit of units) {
    detections.push(
      unit.kind === 'npm-toolchain'
        ? await (dependencies.detectNpmDrift ?? detectNpmDrift)(
            unit,
            root,
            dependencies,
          )
        : await (dependencies.detectImageDrift ?? detectImageDrift)(
            unit,
            root,
            dependencies,
          ),
    )
  }
  return detections
}

function appendSummary(results, env) {
  const summaryPath = readNonEmpty(env.GITHUB_STEP_SUMMARY)
  if (!summaryPath) return
  const sections = [
    ['Created issues', results.created],
    ['Updated issues', results.updated],
    ['Reopened issues', results.reopened],
    ['Closed issues', results.closed],
    ['No action', results.unchanged],
  ]
  const lines = ['# Dependency Drift', '']
  for (const [title, values] of sections) {
    lines.push(`## ${title}`, '')
    lines.push(
      ...(values.length ? values.map(value => `- ${value}`) : ['- None']),
    )
    lines.push('')
  }
  fs.appendFileSync(summaryPath, lines.join('\n'))
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  dependencies = {},
) {
  const root = dependencies.root ?? process.cwd()
  const options = parseArgs(argv, env)
  const registry = readJson(
    path.join(root, '.github/dependency-maintenance.json'),
  )
  const now = dependencies.now ?? new Date()
  const validationErrors = (
    dependencies.validateDependencyMaintenance ?? validateDependencyMaintenance
  )(root, registry, now, { allowExpiredDeferrals: true })
  if (validationErrors.length > 0) {
    throw new Error(
      `Dependency maintenance registry is invalid:\n${validationErrors.map(error => `- ${error}`).join('\n')}`,
    )
  }

  const units = selectedUnits(registry, options.unit)
  const detections = await detectUnits(units, root, dependencies)
  const runCommand = dependencies.run ?? run

  // All registry and remote detection work succeeds before any GitHub mutation.
  ensureAutomationLabel(runCommand)
  const issues = (dependencies.listDetectorIssues ?? listDetectorIssues)(
    runCommand,
  )
  const actions = planIssueActions(detections, issues, registry, now)
  const results = (dependencies.executeIssueActions ?? executeIssueActions)(
    actions,
    runCommand,
  )
  appendSummary(results, env)
  return 0
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
