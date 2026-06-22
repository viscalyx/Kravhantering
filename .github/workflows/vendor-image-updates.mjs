#!/usr/bin/env node
import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAIN_BRANCH = 'main'
const BRANCH_PREFIX = 'automation/vendor-image'
const OPEN_PR_LIST_LIMIT = '1000'
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
  nginx: {
    companionFiles: ['containers/production/env/release.env.template'],
    image: 'docker.io/library/nginx',
    laneDescription: lane => `nginx ${lane}.x`,
    laneFromVersion: version => String(version.major),
    laneSortValue: lane => Number(lane),
    listTags: () => fetchDockerHubTags('library', 'nginx'),
    lockPath: 'containers/nginx/image.lock.json',
    name: 'nginx',
    parseTag: parseNginxTag,
    registryHost: 'registry-1.docker.io',
    registryRepository: 'library/nginx',
    versionSortValue: version => [version.major, version.minor, version.patch],
  },
  sqlserver: {
    companionFiles: [
      'docker-compose.sqlserver.yml',
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
    ],
    image: 'mcr.microsoft.com/mssql/server',
    laneDescription: lane => `SQL Server ${lane}`,
    laneFromVersion: version => String(version.year),
    laneSortValue: lane => Number(lane),
    listTags: () => fetchRegistryTags('mcr.microsoft.com', 'mssql/server'),
    lockPath: 'containers/sqlserver/image.lock.json',
    name: 'sqlserver',
    parseTag: parseSqlServerTag,
    registryHost: 'mcr.microsoft.com',
    registryRepository: 'mssql/server',
    versionSortValue: version => [version.year, version.cu],
  },
  keycloak: {
    companionFiles: [
      'docker-compose.idp.yml',
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
      'devfile.example.yaml',
      'containers/production/env/release.env.template',
      'docs/development/auth-developer-workflow.md',
      'docs/development/openshift-devspaces.md',
    ],
    image: 'quay.io/keycloak/keycloak',
    laneDescription: lane => `Keycloak ${lane}.x`,
    laneFromVersion: version => String(version.major),
    laneSortValue: lane => Number(lane),
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
    companionFiles: [
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
      'containers/production/env/release.env.template',
    ],
    image: 'docker.io/kong/kong-gateway',
    laneDescription: lane => `Kong Gateway ${lane}.x`,
    laneFromVersion: version => String(version.major),
    laneSortValue: lane => Number(lane),
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

function parseBoolean(value) {
  return /^(?:1|true|yes)$/iu.test(String(value ?? '').trim())
}

export function parseArgs(argv, env) {
  const options = {
    image: readNonEmpty(env.VENDOR_IMAGE_UPDATE_IMAGE) ?? 'all',
    includeCurrent: parseBoolean(env.VENDOR_IMAGE_UPDATE_INCLUDE_CURRENT),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--include-current') {
      options.includeCurrent = true
      continue
    }
    if (arg === '--image') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --image.')
      }
      options.image = value
      index += 1
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }

  if (options.image !== 'all' && !IMAGE_CONFIGS[options.image]) {
    throw new Error(
      `Unsupported image "${options.image}". Expected all, nginx, sqlserver, keycloak or kong.`,
    )
  }

  return options
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

function compareLanes(config, left, right) {
  const leftValue = config.laneSortValue(left)
  const rightValue = config.laneSortValue(right)
  if (leftValue > rightValue) return 1
  if (leftValue < rightValue) return -1
  return 0
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function branchName(config, lane) {
  return `${BRANCH_PREFIX}/${config.name}-${lane}`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function replaceImageRef(filePath, image, replacementRef) {
  const source = fs.readFileSync(filePath, 'utf8')
  const pattern = new RegExp(`${escapeRegExp(image)}:[^\\s"'<>]+`, 'gu')
  let replacements = 0
  const updated = source.replace(pattern, () => {
    replacements += 1
    return replacementRef
  })

  if (replacements === 0) {
    throw new Error(`${filePath} does not contain ${image}:<tag>.`)
  }

  if (updated !== source) fs.writeFileSync(filePath, updated)
}

function normalizeDigest(value, context) {
  const digest = readNonEmpty(value)
  if (!digest || !DIGEST_PATTERN.test(digest)) {
    throw new Error(`${context} did not resolve to a sha256 digest.`)
  }
  return digest
}

function authHeader(headers) {
  const token =
    readNonEmpty(process.env.DOCKERHUB_TOKEN) ??
    readNonEmpty(process.env.DOCKER_HUB_TOKEN)
  if (!token) return headers
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  }
}

async function fetchOk(url, options = {}) {
  const headers = options.headers ?? {}
  let response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    const token = await tokenFromChallenge(
      response.headers.get('www-authenticate'),
    )
    if (token) {
      response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
        },
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

async function fetchDockerHubTags(namespace, repository) {
  const tags = []
  let url =
    `https://hub.docker.com/v2/repositories/${namespace}/${repository}` +
    '/tags?page_size=100'

  while (url) {
    const payload = await fetchJson(url, {
      headers: authHeader({
        Accept: 'application/json',
      }),
    })
    for (const item of payload.results ?? []) {
      if (typeof item.name === 'string') tags.push(item.name)
    }
    url = readNonEmpty(payload.next)
  }

  return tags
}

async function fetchRegistryTags(host, repository) {
  const tags = []
  let url = `https://${host}/v2/${repository}/tags/list?n=1000`

  while (url) {
    const response = await fetchOk(url, {
      headers: {
        Accept: 'application/json',
      },
    })
    const payload = await response.json()
    for (const tag of payload.tags ?? []) {
      if (typeof tag === 'string') tags.push(tag)
    }
    url = nextLink(response.headers.get('link'), host)
  }

  return tags
}

function nextLink(header, host) {
  const link = readNonEmpty(header)
  if (!link) return null

  for (const part of link.split(',')) {
    const match = part.match(/<(?<url>[^>]+)>;\s*rel="?next"?/u)
    if (!match?.groups?.url) continue
    if (match.groups.url.startsWith('http')) return match.groups.url
    return `https://${host}${match.groups.url}`
  }

  return null
}

function isImageIndex(manifest) {
  return Array.isArray(manifest?.manifests)
}

function isImageManifest(manifest) {
  return manifest?.config?.digest
}

async function fetchManifest(config, reference) {
  const url = `https://${config.registryHost}/v2/${config.registryRepository}/manifests/${reference}`
  const response = await fetchOk(url, {
    headers: {
      Accept: ACCEPT_MANIFESTS,
    },
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

async function resolveImageIdentity(config, tag) {
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

function selectCandidates(config, tags, currentLock, includeCurrent) {
  const currentVersion = config.parseTag(currentLock.tag)
  if (!currentVersion) {
    throw new Error(
      `${config.lockPath} tag "${currentLock.tag}" is not supported by the updater.`,
    )
  }

  const currentLane = config.laneFromVersion(currentVersion)
  const latestByLane = new Map()

  for (const tag of tags) {
    const version = config.parseTag(tag)
    if (!version) continue

    const lane = config.laneFromVersion(version)
    if (compareLanes(config, lane, currentLane) < 0) continue

    const comparedToCurrent = compareVersions(config, version, currentVersion)
    if (comparedToCurrent < 0) continue
    if (comparedToCurrent === 0 && !includeCurrent) continue

    const previous = latestByLane.get(lane)
    if (!previous || compareVersions(config, version, previous.version) > 0) {
      latestByLane.set(lane, {
        branch: branchName(config, lane),
        lane,
        version,
      })
    }
  }

  return {
    candidates: [...latestByLane.values()].sort((left, right) =>
      compareLanes(config, left.lane, right.lane),
    ),
    currentLane,
  }
}

function run(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

function tryRun(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: run(command, args, options),
    }
  } catch (error) {
    return {
      error,
      ok: false,
      stdout: '',
    }
  }
}

function configureGit() {
  const token =
    readNonEmpty(process.env.GH_TOKEN) ?? readNonEmpty(process.env.GITHUB_TOKEN)
  const repository = readNonEmpty(process.env.GITHUB_REPOSITORY)
  if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN must be set.')
  if (!repository) throw new Error('GITHUB_REPOSITORY must be set.')

  run('git', ['config', 'user.name', 'github-actions[bot]'])
  run('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ])
  run('git', [
    'remote',
    'set-url',
    'origin',
    `https://x-access-token:${token}@github.com/${repository}.git`,
  ])
  run('git', ['fetch', 'origin', MAIN_BRANCH])
}

function gitStatusPorcelain() {
  return run('git', ['status', '--porcelain']).trim()
}

function changedFiles() {
  const output = run('git', ['diff', '--name-only', 'HEAD']).trim()
  if (!output) return []
  return output.split(/\r?\n/u).filter(Boolean).sort()
}

function checkoutLaneBranch(branch) {
  run('git', ['switch', '--force-create', branch, `origin/${MAIN_BRANCH}`])
}

function pushLaneBranch(branch) {
  run('git', ['push', '--force-with-lease', 'origin', `HEAD:${branch}`], {
    stdio: 'inherit',
  })
}

function deleteRemoteBranch(branch) {
  tryRun('git', ['push', 'origin', '--delete', branch], {
    stdio: 'inherit',
  })
}

function listOpenAutomationPrs(config) {
  const output = run('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,headRefName,title',
    '--limit',
    OPEN_PR_LIST_LIMIT,
  ])
  const prefix = `${BRANCH_PREFIX}/${config.name}-`
  return JSON.parse(output).filter(pr => pr.headRefName?.startsWith(prefix))
}

function findOpenPr(branch) {
  const output = run('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,headRefName,title',
    '--limit',
    OPEN_PR_LIST_LIMIT,
  ])
  return JSON.parse(output).find(pr => pr.headRefName === branch) ?? null
}

function laneFromBranch(config, branch) {
  const prefix = `${BRANCH_PREFIX}/${config.name}-`
  if (!branch.startsWith(prefix)) return null
  const lane = branch.slice(prefix.length)
  return readNonEmpty(lane) ?? null
}

function closePr(pr, branch, comment) {
  const result = tryRun(
    'gh',
    ['pr', 'close', String(pr.number), '--comment', comment, '--delete-branch'],
    { stdio: 'inherit' },
  )
  if (!result.ok) {
    run('gh', ['pr', 'close', String(pr.number), '--comment', comment], {
      stdio: 'inherit',
    })
    deleteRemoteBranch(branch)
  }
}

function closeStalePrs(config, currentLane, expectedBranches, results) {
  for (const pr of listOpenAutomationPrs(config)) {
    const lane = laneFromBranch(config, pr.headRefName)
    if (!lane || expectedBranches.has(pr.headRefName)) continue

    const comparison = compareLanes(config, lane, currentLane)
    const reason =
      comparison < 0
        ? `${config.name} has already advanced past ${config.laneDescription(lane)} on main.`
        : `${config.name} on main already contains this update lane, or the upstream tag is no longer selected.`
    closePr(pr, pr.headRefName, reason)
    results.closed.push(`${config.name} ${lane}: ${reason}`)
  }
}

export function companionImageReference(config, filePath, candidate, identity) {
  const taggedRef = `${config.image}:${candidate.version.tag}`
  if (config.name === 'kong' && filePath.startsWith('.devcontainer/')) {
    return `${taggedRef}@${identity.manifestDigest}`
  }
  return taggedRef
}

function updateFiles(config, currentLock, candidate, identity) {
  const nextLock = {
    ...currentLock,
    imageId: identity.imageId,
    manifestDigest: identity.manifestDigest,
    tag: candidate.version.tag,
  }
  writeJson(config.lockPath, nextLock)

  for (const filePath of config.companionFiles) {
    replaceImageRef(
      filePath,
      config.image,
      companionImageReference(config, filePath, candidate, identity),
    )
  }
}

function prTitle(config, candidate, currentLock) {
  const action =
    candidate.version.tag === currentLock.tag ? 'refresh' : 'update'
  return `chore: ${action} ${config.name} container to ${candidate.version.tag}`
}

function prBody(config, candidate, currentLock, identity, files) {
  return [
    `## ${config.laneDescription(candidate.lane)}`,
    '',
    `Updates the ${config.name} vendor image lock lane from main.`,
    '',
    '| Field | Previous | Proposed |',
    '| --- | --- | --- |',
    `| Tag | \`${currentLock.tag}\` | \`${candidate.version.tag}\` |`,
    `| Manifest digest | \`${currentLock.manifestDigest}\` | \`${identity.manifestDigest}\` |`,
    `| Image ID | \`${currentLock.imageId}\` | \`${identity.imageId}\` |`,
    '',
    `Branch: \`${candidate.branch}\``,
    `Platform: \`${PLATFORM.os}/${PLATFORM.architecture}\``,
    '',
    'Files changed by policy:',
    ...files.map(file => `- \`${file}\``),
    '',
    'Normal pull request CI performs validation for this update.',
    '',
  ].join('\n')
}

function writeBodyFile(body) {
  const filePath = path.join(
    os.tmpdir(),
    `vendor-image-update-${process.pid}-${Date.now()}.md`,
  )
  fs.writeFileSync(filePath, body)
  return filePath
}

function createOrUpdatePr(branch, title, body) {
  const bodyFile = writeBodyFile(body)
  const existingPr = findOpenPr(branch)
  if (existingPr) {
    run(
      'gh',
      [
        'pr',
        'edit',
        String(existingPr.number),
        '--title',
        title,
        '--body-file',
        bodyFile,
      ],
      { stdio: 'inherit' },
    )
    return 'updated'
  }

  run(
    'gh',
    [
      'pr',
      'create',
      '--base',
      MAIN_BRANCH,
      '--head',
      branch,
      '--title',
      title,
      '--body-file',
      bodyFile,
    ],
    { stdio: 'inherit' },
  )
  return 'created'
}

async function processCandidate(config, currentLock, candidate, results) {
  const identity = await resolveImageIdentity(config, candidate.version.tag)

  checkoutLaneBranch(candidate.branch)
  updateFiles(config, currentLock, candidate, identity)

  const files = changedFiles()
  if (files.length === 0) {
    const pr = findOpenPr(candidate.branch)
    if (pr) {
      closePr(
        pr,
        candidate.branch,
        `${config.name} on main already contains ${candidate.version.tag}.`,
      )
      results.closed.push(`${config.name} ${candidate.lane}: already on main`)
    } else {
      deleteRemoteBranch(candidate.branch)
      results.unchanged.push(`${config.name} ${candidate.lane}`)
    }
    return
  }

  run('git', ['add', ...files])
  run('git', ['commit', '-m', prTitle(config, candidate, currentLock)], {
    stdio: 'inherit',
  })
  pushLaneBranch(candidate.branch)

  const body = prBody(config, candidate, currentLock, identity, files)
  const action = createOrUpdatePr(
    candidate.branch,
    prTitle(config, candidate, currentLock),
    body,
  )
  results[action].push(`${config.name}: ${candidate.version.tag}`)
}

async function processImage(config, options, results) {
  const currentLock = readJson(config.lockPath)
  const tags = await config.listTags()
  const { candidates, currentLane } = selectCandidates(
    config,
    tags,
    currentLock,
    options.includeCurrent,
  )
  const expectedBranches = new Set(
    candidates.map(candidate => candidate.branch),
  )

  closeStalePrs(config, currentLane, expectedBranches, results)

  if (candidates.length === 0) {
    results.unchanged.push(config.name)
    return
  }

  for (const candidate of candidates) {
    await processCandidate(config, currentLock, candidate, results)
  }
}

function selectedConfigs(image) {
  if (image === 'all') return Object.values(IMAGE_CONFIGS)
  return [IMAGE_CONFIGS[image]]
}

function appendSummary(results) {
  const summaryPath = readNonEmpty(process.env.GITHUB_STEP_SUMMARY)
  if (!summaryPath) return

  const sections = [
    ['Created PRs', results.created],
    ['Updated PRs', results.updated],
    ['Closed PRs', results.closed],
    ['No Update', results.unchanged],
    ['Failures', results.failed],
  ]
  const lines = ['# Vendor Image Updates', '']

  for (const [title, values] of sections) {
    lines.push(`## ${title}`, '')
    if (values.length === 0) {
      lines.push('- None', '')
    } else {
      lines.push(...values.map(value => `- ${value}`), '')
    }
  }

  fs.appendFileSync(summaryPath, lines.join('\n'))
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env)
  const results = {
    closed: [],
    created: [],
    failed: [],
    unchanged: [],
    updated: [],
  }

  configureGit()

  for (const config of selectedConfigs(options.image)) {
    try {
      await processImage(config, options, results)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`${config.name}: ${message}`)
      results.failed.push(`${config.name}: ${message}`)
    }
  }

  if (gitStatusPorcelain()) {
    console.error('The vendor image updater left uncommitted changes.')
    results.failed.push('The updater left uncommitted changes.')
  }

  appendSummary(results)

  return results.failed.length > 0 ? 1 : 0
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().then(
    exitCode => {
      process.exitCode = exitCode
    },
    error => {
      console.error(error)
      process.exitCode = 1
    },
  )
}
