#!/usr/bin/env node
import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEVCONTAINER_BASE_TAG_PATTERN,
  validateDependencyMaintenance,
} from '../../scripts/dependency-maintenance.mjs'
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
const LYCHEE_ARCHITECTURES = [
  { architecture: 'amd64', target: 'x86_64-unknown-linux-gnu' },
  { architecture: 'arm64', target: 'aarch64-unknown-linux-gnu' },
]
const LYCHEE_INSPECTED_SURFACES = [
  {
    checksums: true,
    path: '.devcontainer/Dockerfile',
    versionPattern: /^ARG LYCHEE_VERSION=(?<version>v\d+\.\d+\.\d+)$/gmu,
  },
  {
    checksums: true,
    path: 'scripts/azure-dev/templates/bootstrap-host.sh',
    versionPattern: /^LYCHEE_VERSION="(?<version>v\d+\.\d+\.\d+)"$/gmu,
  },
  {
    checksums: false,
    path: '.github/workflows/quality-checks.yml',
    versionPattern: /^\s*lycheeVersion:\s*(?<version>v\d+\.\d+\.\d+)$/gmu,
  },
]
const LYCHEE_AUXILIARY_SURFACES = new Set([
  'tests/unit/github-actions-workflow-security.test.ts',
])

export const IMAGE_CONFIGS = {
  'devcontainer-base': {
    image: 'mcr.microsoft.com/devcontainers/base',
    indexDigest: true,
    listTags: () =>
      fetchRegistryTags('mcr.microsoft.com', 'devcontainers/base'),
    lockPath: 'containers/devcontainer-base/image.lock.json',
    name: 'devcontainer-base',
    parseTag: parseDevcontainerBaseTag,
    registryHost: 'mcr.microsoft.com',
    registryRepository: 'devcontainers/base',
    versionSortValue: version => [version.major, version.minor, version.patch],
  },
  node: {
    image: 'docker.io/library/node',
    listTags: listNodeLtsTags,
    name: 'node',
    parseTag: parseNodeTag,
    paths: [
      'containers/app/Dockerfile',
      'containers/hsa-directory-mock/Dockerfile',
      'containers/hsa-person-lookup-adapter/Dockerfile',
      'containers/hsa-mtls-provisioner/Dockerfile',
      'containers/hsa-mtls-topology/Dockerfile',
    ],
    registryHost: 'registry-1.docker.io',
    registryRepository: 'library/node',
    versionSortValue: version => [version.major],
  },
  nginx: {
    image: 'docker.io/library/nginx',
    listTags: () => fetchRegistryTags('registry-1.docker.io', 'library/nginx'),
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
    listTags: () =>
      fetchRegistryTags('registry-1.docker.io', 'kong/kong-gateway'),
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

export function parseDevcontainerBaseTag(tag) {
  const match = tag.match(DEVCONTAINER_BASE_TAG_PATTERN)
  if (!match?.groups) return null
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    tag,
  }
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

export function parseLycheeVersion(version) {
  const match = String(version).match(
    /^v(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u,
  )
  if (!match?.groups) return null
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    version,
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

async function fetchLatestLycheeRelease(repository) {
  const token = readNonEmpty(process.env.GH_TOKEN)
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetchJson(
    `https://api.github.com/repos/${repository}/releases/latest`,
    { headers },
  )
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
        config.indexDigest ? first.digest : (second.digest ?? platformDigest),
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

function nodeDetectorConfig(config, unit) {
  const registeredPaths = Array.isArray(unit.paths) ? unit.paths : []
  const supportedPaths = config.paths
  if (
    registeredPaths.length !== supportedPaths.length ||
    new Set(registeredPaths).size !== registeredPaths.length ||
    registeredPaths.some(relativePath => !supportedPaths.includes(relativePath))
  ) {
    throw new Error(
      'Production Node registry paths do not match the detector-supported surfaces.',
    )
  }
  return { ...config, paths: registeredPaths }
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
      ? readNodeCurrent(nodeDetectorConfig(config, unit), root)
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

function singleLycheeVersion(source, pattern, context) {
  const versions = [...source.matchAll(pattern)].map(
    match => match.groups.version,
  )
  const unique = [...new Set(versions)]
  if (unique.length !== 1 || !parseLycheeVersion(unique[0])) {
    throw new Error(`${context} must declare one supported Lychee version.`)
  }
  return unique[0]
}

function lycheeChecksums(source, context) {
  const caseMarkers = [
    ...source.matchAll(/^\s*(?<architecture>amd64|arm64)\)/gmu),
  ]
  const checksumsByArchitecture = Object.fromEntries(
    LYCHEE_ARCHITECTURES.map(({ architecture }) => [architecture, []]),
  )
  const sectionCounts = Object.fromEntries(
    LYCHEE_ARCHITECTURES.map(({ architecture }) => [architecture, 0]),
  )
  for (const [index, marker] of caseMarkers.entries()) {
    const architecture = marker.groups.architecture
    sectionCounts[architecture] += 1
    const segment = source.slice(
      marker.index,
      caseMarkers[index + 1]?.index ?? source.length,
    )
    const matches = [
      ...segment.matchAll(/lychee_sha256='(?<checksum>[a-f0-9]{64})'/gu),
    ]
    checksumsByArchitecture[architecture].push(
      ...matches.map(match => match.groups.checksum),
    )
  }
  if (
    LYCHEE_ARCHITECTURES.some(
      ({ architecture }) =>
        sectionCounts[architecture] !== 1 ||
        checksumsByArchitecture[architecture].length !== 1,
    )
  ) {
    throw new Error(
      `${context} must declare both Lychee architecture checksums.`,
    )
  }
  return Object.fromEntries(
    LYCHEE_ARCHITECTURES.map(({ architecture }) => [
      architecture,
      checksumsByArchitecture[architecture][0],
    ]),
  )
}

export function readLycheeCurrent(unit, root = process.cwd()) {
  if (!Array.isArray(unit?.paths)) {
    throw new Error('Lychee registry unit must declare synchronized paths.')
  }
  const registeredPaths = new Set(unit.paths)
  if (registeredPaths.size !== unit.paths.length) {
    throw new Error('Lychee registry unit paths must be unique.')
  }
  const inspectedPaths = new Set(
    LYCHEE_INSPECTED_SURFACES.map(surface => surface.path),
  )
  const unsupportedPaths = unit.paths.filter(
    relativePath =>
      !inspectedPaths.has(relativePath) &&
      !LYCHEE_AUXILIARY_SURFACES.has(relativePath),
  )
  if (
    unsupportedPaths.length > 0 ||
    [...inspectedPaths].some(relativePath => !registeredPaths.has(relativePath))
  ) {
    throw new Error(
      'Lychee registry paths do not match the detector-supported surfaces.',
    )
  }

  const sources = new Map(
    LYCHEE_INSPECTED_SURFACES.map(surface => [
      surface.path,
      fs.readFileSync(path.join(root, surface.path), 'utf8'),
    ]),
  )
  const versions = LYCHEE_INSPECTED_SURFACES.map(surface =>
    singleLycheeVersion(
      sources.get(surface.path),
      surface.versionPattern,
      surface.path,
    ),
  )
  if (new Set(versions).size !== 1) {
    throw new Error(
      'Lychee versions are not aligned across synchronized surfaces.',
    )
  }

  const checksumSurfaces = LYCHEE_INSPECTED_SURFACES.filter(
    surface => surface.checksums,
  )
  const [dockerfileChecksums, bootstrapChecksums] = checksumSurfaces.map(
    surface => lycheeChecksums(sources.get(surface.path), surface.path),
  )
  if (
    LYCHEE_ARCHITECTURES.some(
      ({ architecture }) =>
        dockerfileChecksums[architecture] !== bootstrapChecksums[architecture],
    )
  ) {
    throw new Error(
      'Lychee architecture checksums are not aligned across synchronized installers.',
    )
  }
  return {
    checksums: dockerfileChecksums,
    tool: 'lychee',
    version: versions[0],
  }
}

function lycheeReleaseState(release) {
  const version = String(release?.tag_name ?? '').replace(/^lychee-/u, '')
  if (
    release?.draft === true ||
    release?.prerelease === true ||
    !parseLycheeVersion(version)
  ) {
    throw new Error('GitHub returned an unsupported latest Lychee release.')
  }

  const assets = Array.isArray(release.assets) ? release.assets : []
  const checksums = {}
  for (const { architecture, target } of LYCHEE_ARCHITECTURES) {
    const assetName = `lychee-${target}.tar.gz`
    const matches = assets.filter(asset => asset?.name === assetName)
    if (matches.length !== 1) {
      throw new Error(`Lychee release must contain one ${assetName} asset.`)
    }
    checksums[architecture] = normalizeDigest(
      matches[0].digest,
      `Lychee ${version} ${architecture} asset`,
    ).slice('sha256:'.length)
  }
  return { checksums, tool: 'lychee', version }
}

export async function detectLycheeDrift(
  unit,
  root = process.cwd(),
  dependencies,
) {
  const fetchLatestRelease =
    dependencies?.fetchLatestLycheeRelease ?? fetchLatestLycheeRelease
  const current = readLycheeCurrent(unit, root)
  const available = lycheeReleaseState(
    await fetchLatestRelease(unit.repository),
  )
  const availableVersion = parseLycheeVersion(available.version)
  const currentVersion = parseLycheeVersion(current.version)
  if (
    compareArrays(
      [availableVersion.major, availableVersion.minor, availableVersion.patch],
      [currentVersion.major, currentVersion.minor, currentVersion.patch],
    ) < 0
  ) {
    throw new Error(
      'Latest supported Lychee release is older than current state.',
    )
  }
  const checksumDrift = LYCHEE_ARCHITECTURES.some(
    ({ architecture }) =>
      current.checksums[architecture] !== available.checksums[architecture],
  )
  return {
    available,
    current,
    drift: current.version !== available.version || checksumDrift,
    paths: unit.paths,
    skill: unit.skill,
    unit: unit.id,
  }
}

const ISSUE_METADATA_PREFIX = '<!-- dependency-drift-metadata:v1:'
const SNAPSHOT_METADATA_PREFIX = '<!-- dependency-drift-snapshot:v1:'
const SUPERSESSION_METADATA_PREFIX = '<!-- dependency-drift-supersession:v1:'
const ISSUE_METADATA_PATTERN = new RegExp(
  `${ISSUE_METADATA_PREFIX}(?<encoded>[A-Za-z0-9_-]+) -->`,
  'u',
)
const SNAPSHOT_METADATA_PATTERN = new RegExp(
  `${SNAPSHOT_METADATA_PREFIX}(?<encoded>[A-Za-z0-9_-]+) -->`,
  'u',
)
const SUPERSESSION_RELATIONSHIP = Object.freeze({
  SUPERSEDED_BY: 'superseded-by',
  SUPERSEDES: 'supersedes',
})

function dependencyState(state) {
  if (state.tool === 'lychee') {
    return {
      checksums: Object.fromEntries(
        LYCHEE_ARCHITECTURES.map(({ architecture }) => [
          architecture,
          state.checksums[architecture],
        ]),
      ),
      kind: 'lychee',
      version: state.version,
    }
  }
  if (state.version) return { kind: 'npm', version: state.version }
  return {
    imageId: state.imageId ?? null,
    kind: 'image',
    manifestDigest: state.manifestDigest,
    tag: state.tag,
  }
}

function encodeMetadata(metadata) {
  return Buffer.from(JSON.stringify(metadata)).toString('base64url')
}

function lifecycleMetadata(detection) {
  return {
    current: dependencyState(detection.current),
    target: dependencyState(detection.available),
    unit: detection.unit,
  }
}

function readEncodedMetadata(body, pattern) {
  const marker = readNonEmpty(body)?.match(pattern)
  if (!marker?.groups?.encoded) return null
  try {
    return JSON.parse(
      Buffer.from(marker.groups.encoded, 'base64url').toString('utf8'),
    )
  } catch {
    return null
  }
}

function isLifecycleMetadata(metadata) {
  return (
    typeof metadata?.unit === 'string' &&
    typeof metadata?.target?.kind === 'string' &&
    typeof metadata?.current?.kind === 'string'
  )
}

function readIssueMetadata(body) {
  const metadata = readEncodedMetadata(body, ISSUE_METADATA_PATTERN)
  return isLifecycleMetadata(metadata) ? metadata : null
}

function readSnapshotMetadata(body) {
  const metadata = readEncodedMetadata(body, SNAPSHOT_METADATA_PATTERN)
  return isLifecycleMetadata(metadata) ? metadata : null
}

function issueMarker(detection) {
  return `${ISSUE_METADATA_PREFIX}${encodeMetadata(
    lifecycleMetadata(detection),
  )} -->`
}

export function formatState(state) {
  if (state.tool === 'lychee' || state.kind === 'lychee') {
    return [
      `Lychee ${state.version}`,
      ...LYCHEE_ARCHITECTURES.map(
        ({ architecture }) =>
          `${architecture} sha256:${state.checksums[architecture]}`,
      ),
    ].join('; ')
  }
  if (state.version) return `npm ${state.version}`
  const parts = [`tag ${state.tag}`, `manifest ${state.manifestDigest}`]
  if (state.imageId) parts.push(`image ${state.imageId}`)
  return parts.join('; ')
}

export function renderIssueBody(detection, detectedAt) {
  const lines = [
    issueMarker(detection),
    '',
    `- Maintenance unit: \`${detection.unit}\``,
    `- Current state: \`${formatState(detection.current)}\``,
    `- Available state: \`${formatState(detection.available)}\``,
    `- Skill: \`${detection.skill}\``,
    `- Detected: \`${detectedAt.toISOString()}\``,
  ]
  if (detection.paths?.length) {
    lines.push('', '## Synchronized surfaces', '')
    lines.push(...detection.paths.map(relativePath => `- \`${relativePath}\``))
  }
  lines.push('', '## Completion checklist', '')
  if (detection.current.tool === 'lychee') {
    lines.push(
      '- [ ] Update both installer versions and the workflow `lycheeVersion` together.',
      '- [ ] Update AMD64 and ARM64 asset checksums in both installers.',
      '- [ ] Keep the Lychee action on a compatible full commit SHA and release-tag comment.',
      '- [ ] Keep the version and checksum alignment test relational.',
    )
  } else {
    lines.push(
      '- [ ] Bring the maintenance unit to the available state.',
      '- [ ] Preserve compatibility and immutable identity policy.',
    )
  }
  lines.push(
    '- [ ] Run all dynamically relevant verification.',
    '- [ ] Confirm a successful detector scan reports no drift.',
    '',
  )
  return lines.join('\n')
}

function compactTargetDigest(target) {
  if (target.kind === 'image') {
    return target.manifestDigest.slice(0, 'sha256:'.length + 12)
  }
  if (target.kind === 'lychee') {
    return `sha256:${crypto
      .createHash('sha256')
      .update(JSON.stringify(target))
      .digest('hex')
      .slice(0, 12)}`
  }
  return null
}

function issueTitle(detection) {
  const target = dependencyState(detection.available)
  const version = target.version ?? target.tag
  const compactDigest = compactTargetDigest(target)
  return `Dependency drift: ${detection.unit} → ${version}${
    compactDigest ? ` @ ${compactDigest}` : ''
  }`
}

function run(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

export function listDetectorIssues(runCommand = run) {
  const issues = JSON.parse(
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
      'number,state,title,body,url',
    ]),
  )
  return issues.map(issue => {
    const commentPages = JSON.parse(
      runCommand('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/{owner}/{repo}/issues/${issue.number}/comments?per_page=100`,
      ]),
    )
    return { ...issue, comments: commentPages.flat() }
  })
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
  const legacyMarker = `<!-- dependency-drift:${unit} -->`
  return issues
    .filter(
      issue =>
        readIssueMetadata(issue.body)?.unit === unit ||
        issue.body?.includes(legacyMarker),
    )
    .sort((left, right) => left.number - right.number)
}

function statesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function latestCurrentState(issue, issueMetadata) {
  const comments = Array.isArray(issue.comments) ? issue.comments : []
  for (const comment of comments.toReversed()) {
    const snapshot = readSnapshotMetadata(comment.body)
    if (
      snapshot?.unit === issueMetadata.unit &&
      statesMatch(snapshot.target, issueMetadata.target)
    ) {
      return snapshot.current
    }
  }
  return issueMetadata.current
}

function renderCurrentChangeComment(detection, previous, now) {
  return [
    `${SNAPSHOT_METADATA_PREFIX}${encodeMetadata(
      lifecycleMetadata(detection),
    )} -->`,
    '',
    `Current-state change detected at \`${now.toISOString()}\`.`,
    '',
    `- Previous snapshot: \`${formatState(previous)}\``,
    `- New snapshot: \`${formatState(detection.current)}\``,
    '',
  ].join('\n')
}

function renderResolutionComment(detection, now) {
  return [
    `Dependency drift resolved at \`${now.toISOString()}\`.`,
    '',
    `- Resolved snapshot: \`${formatState(detection.current)}\``,
    '',
  ].join('\n')
}

function renderDeferralComment(detection, deferral, now) {
  return [
    `A reviewed dependency-maintenance deferral applies as of \`${now.toISOString()}\`.`,
    '',
    `- Available target: \`${formatState(detection.available)}\``,
    `- Expires on: \`${deferral.expiresOn}\``,
    `- Rationale: ${deferral.rationale}`,
    '',
  ].join('\n')
}

function renderReconciliationComment(kind, retainedIssue, now) {
  const relationship = kind === 'duplicate' ? 'duplicate of' : 'superseded by'
  return [
    `This active Dependency Drift issue is ${relationship} #${retainedIssue.number} as of \`${now.toISOString()}\`.`,
    '',
    `Retained issue: ${retainedIssue.url ?? `#${retainedIssue.number}`}`,
    '',
  ].join('\n')
}

function issueReference(issue) {
  const issueNumber = issue.issue ?? issue.number
  if (!Number.isInteger(issueNumber)) {
    throw new Error('Dependency Drift issue reference has no issue number.')
  }
  return { issue: issueNumber, url: issue.url }
}

function supersessionMarker(relationship, relatedIssue) {
  const reference = issueReference(relatedIssue)
  return `${SUPERSESSION_METADATA_PREFIX}${encodeMetadata({
    relationship,
    relatedIssue: reference.issue,
  })} -->`
}

function renderSupersessionComment(relationship, relatedIssue) {
  const reference = issueReference(relatedIssue)
  const relationshipText = {
    [SUPERSESSION_RELATIONSHIP.SUPERSEDED_BY]: `Superseded by ${
      reference.url ?? `#${reference.issue}`
    }.`,
    [SUPERSESSION_RELATIONSHIP.SUPERSEDES]: `This issue supersedes ${
      reference.url ?? `#${reference.issue}`
    }.`,
  }[relationship]
  if (!relationshipText) {
    throw new Error(`Unknown supersession relationship: ${relationship}`)
  }
  return [
    supersessionMarker(relationship, reference),
    '',
    relationshipText,
    '',
  ].join('\n')
}

function hasSupersessionComment(issue, relationship, relatedIssue) {
  const marker = supersessionMarker(relationship, relatedIssue)
  return (issue.comments ?? []).some(comment => comment.body?.includes(marker))
}

function issueNumberFromUrl(url) {
  const match = url.match(/\/issues\/(?<issue>\d+)\/?$/u)
  if (!match?.groups?.issue) {
    throw new Error(`GitHub returned an invalid issue URL: ${url}`)
  }
  return Number(match.groups.issue)
}

export function planIssueActions(detections, issues, registry, now) {
  const actions = []
  for (const detection of detections) {
    const firstActionIndex = actions.length
    const matching = issuesForUnit(issues, detection.unit)
    const openIssues = matching.filter(issue => issue.state === 'OPEN')
    const target = dependencyState(detection.available)
    const matchingTargetIssues = openIssues.filter(issue =>
      statesMatch(readIssueMetadata(issue.body)?.target, target),
    )
    const primary = matchingTargetIssues[0] ?? null

    const deferred = activeDeferral(registry, detection, now)
    if (!detection.drift || deferred) {
      if (openIssues.length > 0) {
        for (const activeIssue of openIssues) {
          actions.push({
            comment: deferred
              ? renderDeferralComment(detection, deferred, now)
              : renderResolutionComment(detection, now),
            issue: activeIssue.number,
            reason: deferred ? 'not planned' : 'completed',
            type: 'close',
            unit: detection.unit,
          })
        }
      } else {
        actions.push({ type: 'unchanged', unit: detection.unit })
      }
      continue
    }

    const body = renderIssueBody(detection, now)
    if (!primary) {
      actions.push({
        body,
        supersedes: openIssues.map(issue => ({
          issue: issue.number,
          url: issue.url,
        })),
        title: issueTitle(detection),
        type: 'create',
        unit: detection.unit,
      })
      continue
    }
    const metadata = readIssueMetadata(primary.body)
    for (const duplicate of openIssues.filter(issue => issue !== primary)) {
      const duplicateMetadata = readIssueMetadata(duplicate.body)
      const sameTarget = statesMatch(duplicateMetadata?.target, target)
      if (
        !sameTarget &&
        !hasSupersessionComment(
          primary,
          SUPERSESSION_RELATIONSHIP.SUPERSEDES,
          duplicate,
        )
      ) {
        actions.push({
          body: renderSupersessionComment(
            SUPERSESSION_RELATIONSHIP.SUPERSEDES,
            duplicate,
          ),
          issue: primary.number,
          type: 'comment',
          unit: detection.unit,
        })
      }
      actions.push({
        comment: sameTarget
          ? renderReconciliationComment('duplicate', primary, now)
          : hasSupersessionComment(
                duplicate,
                SUPERSESSION_RELATIONSHIP.SUPERSEDED_BY,
                primary,
              )
            ? undefined
            : renderSupersessionComment(
                SUPERSESSION_RELATIONSHIP.SUPERSEDED_BY,
                primary,
              ),
        issue: duplicate.number,
        reason: 'not planned',
        type: sameTarget ? 'close' : 'supersede',
        unit: detection.unit,
      })
    }
    const previous = latestCurrentState(primary, metadata)
    if (statesMatch(previous, dependencyState(detection.current))) {
      if (actions.length === firstActionIndex) {
        actions.push({ type: 'unchanged', unit: detection.unit })
      }
      continue
    }
    actions.push({
      body: renderCurrentChangeComment(detection, previous, now),
      issue: primary.number,
      type: 'comment',
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

function addIssueComment(issue, body, runCommand) {
  withBodyFile(body, bodyPath => {
    runCommand(
      'gh',
      ['issue', 'comment', String(issue), '--body-file', bodyPath],
      { stdio: 'inherit' },
    )
  })
}

export function executeIssueActions(actions, runCommand = run) {
  const results = {
    closed: [],
    commented: [],
    created: [],
    superseded: [],
    unchanged: [],
  }
  for (const action of actions) {
    if (action.type === 'unchanged') {
      results.unchanged.push(action.unit)
    } else if (action.type === 'close' || action.type === 'supersede') {
      if (action.comment) {
        addIssueComment(action.issue, action.comment, runCommand)
        results.commented.push(`${action.unit} (#${action.issue})`)
      }
      runCommand(
        'gh',
        ['issue', 'close', String(action.issue), '--reason', action.reason],
        { stdio: 'inherit' },
      )
      results.closed.push(`${action.unit} (#${action.issue})`)
      if (action.type === 'supersede') {
        results.superseded.push(`${action.unit} (#${action.issue})`)
      }
    } else if (action.type === 'comment') {
      addIssueComment(action.issue, action.body, runCommand)
      results.commented.push(`${action.unit} (#${action.issue})`)
    } else if (action.type === 'create') {
      const createdUrl = withBodyFile(action.body, bodyPath =>
        readNonEmpty(
          runCommand('gh', [
            'issue',
            'create',
            '--title',
            action.title,
            '--body-file',
            bodyPath,
            '--label',
            ISSUE_LABELS.join(','),
          ]),
        ),
      )
      results.created.push(action.unit)
      const supersededIssues = action.supersedes ?? []
      if (supersededIssues.length > 0 && !createdUrl) {
        throw new Error('GitHub did not return the replacement issue URL.')
      }
      for (const previous of supersededIssues) {
        const replacement = {
          issue: issueNumberFromUrl(createdUrl),
          url: createdUrl,
        }
        addIssueComment(
          createdUrl,
          renderSupersessionComment(
            SUPERSESSION_RELATIONSHIP.SUPERSEDES,
            previous,
          ),
          runCommand,
        )
        results.commented.push(`${action.unit} (${createdUrl})`)
        addIssueComment(
          previous.issue,
          renderSupersessionComment(
            SUPERSESSION_RELATIONSHIP.SUPERSEDED_BY,
            replacement,
          ),
          runCommand,
        )
        results.commented.push(`${action.unit} (#${previous.issue})`)
        runCommand(
          'gh',
          ['issue', 'close', String(previous.issue), '--reason', 'not planned'],
          { stdio: 'inherit' },
        )
        results.superseded.push(`${action.unit} (#${previous.issue})`)
        results.closed.push(`${action.unit} (#${previous.issue})`)
      }
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
    if (unit.kind === 'npm-toolchain') {
      detections.push(
        await (dependencies.detectNpmDrift ?? detectNpmDrift)(
          unit,
          root,
          dependencies,
        ),
      )
    } else if (unit.kind === 'release-toolchain') {
      detections.push(
        await (dependencies.detectLycheeDrift ?? detectLycheeDrift)(
          unit,
          root,
          dependencies,
        ),
      )
    } else {
      detections.push(
        await (dependencies.detectImageDrift ?? detectImageDrift)(
          unit,
          root,
          dependencies,
        ),
      )
    }
  }
  return detections
}

function appendSummary(results, env) {
  const summaryPath = readNonEmpty(env.GITHUB_STEP_SUMMARY)
  if (!summaryPath) return
  const sections = [
    ['Created issues', results.created],
    ['Comments added', results.commented],
    ['Superseded issues', results.superseded],
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
  const issues = (dependencies.listDetectorIssues ?? listDetectorIssues)(
    runCommand,
  )
  const actions = planIssueActions(detections, issues, registry, now)
  if (actions.some(action => action.type === 'create')) {
    ensureAutomationLabel(runCommand)
  }
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
