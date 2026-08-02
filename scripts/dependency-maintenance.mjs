#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  'coverage',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  'tmp',
])
const PINNABLE_PACKAGE_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const PACKAGE_MANAGER_PATTERN = /^npm@(\d+\.\d+\.\d+)$/u
const DOCKER_NPM_BOOTSTRAP_PATTERN =
  /\bnpm\s+install\s+--global\s+"?npm@\$\(\s*node\s+-p\s+(?:'require\(\s*"\.\/package\.json"\s*\)\s*\.packageManager\s*\.slice\(\s*4\s*\)'|"require\(\s*'\.\/package\.json'\s*\)\s*\.packageManager\s*\.slice\(\s*4\s*\)")\s*\)"?/u
export const DEVCONTAINER_BASE_TAG_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)-ubuntu-24\.04$/u
const DEPENDENCY_DRIFT_SKILL = 'resolve-dependency-drift'
const DEPENDABOT_KIND_ECOSYSTEMS = {
  'devcontainer-features': 'devcontainers',
  'dockerfile-image': 'docker',
  'github-actions': 'github-actions',
  'npm-package': 'npm',
}
const ISSUE_DETECTOR_CONTRACTS = {
  'devcontainer-base': {
    kind: 'image-lock',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  keycloak: {
    kind: 'image-lock',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  lychee: {
    kind: 'release-toolchain',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  kong: {
    kind: 'image-lock',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  nginx: {
    kind: 'image-lock',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  node: {
    kind: 'dockerfile-image',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  npm: {
    kind: 'npm-toolchain',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
  sqlserver: {
    kind: 'image-lock',
    skill: DEPENDENCY_DRIFT_SKILL,
  },
}

function slashPath(value) {
  return value.split(path.sep).join('/')
}

function walkFiles(root, predicate, directory = root) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      continue
    }
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, predicate, absolutePath))
    } else if (entry.isFile() && predicate(entry.name, absolutePath)) {
      files.push(slashPath(path.relative(root, absolutePath)))
    }
  }
  return files.sort()
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

export function normalizeImageRepository(reference) {
  const trimmed = String(reference ?? '')
    .trim()
    .replace(/^['"]|['"]$/gu, '')
  if (
    !trimmed ||
    trimmed === 'scratch' ||
    /\$(?:\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*)/u.test(trimmed) ||
    trimmed.includes('{{')
  ) {
    return null
  }

  const withoutDigest = trimmed.split('@', 1)[0]
  const lastSlash = withoutDigest.lastIndexOf('/')
  const lastColon = withoutDigest.lastIndexOf(':')
  const repository =
    lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest
  const parts = repository.split('/')

  if (parts.length === 1) return `docker.io/library/${repository}`
  if (
    !parts[0].includes('.') &&
    !parts[0].includes(':') &&
    parts[0] !== 'localhost'
  ) {
    return `docker.io/${repository}`
  }
  return repository
}

function expandDockerArgs(reference, args) {
  let expanded = reference
  for (let pass = 0; pass < 10; pass += 1) {
    const next = expanded.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu,
      (match, braced, plain) => args.get(braced ?? plain) ?? match,
    )
    if (next === expanded) return expanded
    expanded = next
  }
  return expanded
}

export function discoverPackageProjects(root) {
  return walkFiles(root, name => name === 'package.json')
    .filter(relativePath => !relativePath.startsWith('docs/'))
    .map(relativePath => {
      const directory = slashPath(path.posix.dirname(relativePath))
      return directory === '.' ? '.' : directory
    })
    .sort()
}

export function discoverDockerfileInputs(root) {
  const dockerfiles = walkFiles(
    root,
    name => name === 'Dockerfile' || name.endsWith('.Dockerfile'),
  )
  const inputs = []

  for (const relativePath of dockerfiles) {
    const args = new Map()
    const stages = new Set()
    for (const line of readText(root, relativePath).split(/\r?\n/u)) {
      const argMatch = line.match(
        /^\s*ARG\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)(?:=(?<value>.*))?\s*$/u,
      )
      if (argMatch?.groups) {
        if (argMatch.groups.value !== undefined) {
          args.set(
            argMatch.groups.name,
            argMatch.groups.value.trim().replace(/^['"]|['"]$/gu, ''),
          )
        }
        continue
      }
      const match = line.match(
        /^\s*FROM(?:\s+--platform=\S+)?\s+(?<reference>\S+)(?:\s+AS\s+(?<stage>\S+))?\s*$/iu,
      )
      if (!match?.groups) continue
      const originalReference = match.groups.reference
      const reference = expandDockerArgs(originalReference, args)
      if (!stages.has(reference)) {
        const image = normalizeImageRepository(reference)
        if (image) {
          inputs.push({ image, path: relativePath, reference })
        } else if (originalReference.includes('$') && reference.includes('$')) {
          inputs.push({
            image: null,
            path: relativePath,
            reference: originalReference,
          })
        }
      }
      if (match.groups.stage) stages.add(match.groups.stage)
    }
  }

  return inputs.sort((left, right) =>
    `${left.path}:${left.image}`.localeCompare(`${right.path}:${right.image}`),
  )
}

function isNamedTagOnlyImageReference(reference) {
  if (!reference || reference.includes('@')) return false
  const lastSlash = reference.lastIndexOf('/')
  const lastColon = reference.lastIndexOf(':')
  if (lastColon <= lastSlash) return false
  const tag = reference.slice(lastColon + 1)
  return tag.length > 0 && !/^latest$/iu.test(tag)
}

function isValidNamedImageTag(tag) {
  return (
    /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u.test(tag) && !/^latest$/iu.test(tag)
  )
}

function isNarrowDevcontainerBaseTag(tag) {
  return DEVCONTAINER_BASE_TAG_PATTERN.test(tag)
}

export function discoverImageLocks(root) {
  return walkFiles(root, name => name === 'image.lock.json')
    .filter(relativePath => relativePath.startsWith('containers/'))
    .map(relativePath => ({
      image: normalizeImageRepository(readJson(root, relativePath).image),
      path: relativePath,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

function isRuntimeImageFile(relativePath) {
  return (
    /^(?:docker-compose(?:\.[^/]+)?\.ya?ml)$/u.test(relativePath) ||
    isDevelopmentRuntimeImageFile(relativePath) ||
    /^containers\/production\/.*\.ya?ml$/u.test(relativePath)
  )
}

function isDevelopmentRuntimeImageFile(relativePath) {
  return (
    /^\.devcontainer\/.*\.ya?ml$/u.test(relativePath) ||
    /^scripts\/azure-dev\/templates\/quadlet\/.*\.container$/u.test(
      relativePath,
    )
  )
}

function discoverRuntimeImageReferences(root) {
  const candidates = walkFiles(root, name =>
    /\.(?:container|ya?ml)$/u.test(name),
  ).filter(isRuntimeImageFile)
  const inputs = []

  for (const relativePath of candidates) {
    for (const line of readText(root, relativePath).split(/\r?\n/u)) {
      const match =
        line.match(/^\s*image:\s*(?<reference>\S+)\s*(?:#.*)?$/iu) ??
        line.match(/^Image=(?<reference>\S+)\s*$/u)
      const reference = String(match?.groups?.reference ?? '')
        .trim()
        .replace(/^['"]|['"]$/gu, '')
      const image = normalizeImageRepository(reference)
      if (
        image &&
        !image.includes('example.') &&
        !image.startsWith('localhost/')
      ) {
        inputs.push({ image, path: relativePath, reference })
      }
    }
  }

  return inputs.sort((left, right) =>
    `${left.path}:${left.image}`.localeCompare(`${right.path}:${right.image}`),
  )
}

export function discoverRuntimeImageInputs(root) {
  return discoverRuntimeImageReferences(root).map(({ image, path }) => ({
    image,
    path,
  }))
}

function unquoteYaml(value) {
  return value.trim().replace(/^['"]|['"]$/gu, '')
}

export function parseDependabotEntries(source) {
  const starts = [...source.matchAll(/^ {2}- package-ecosystem:\s*(.+)$/gmu)]
  return starts.map((match, index) => {
    const start = match.index ?? 0
    const end = starts[index + 1]?.index ?? source.length
    const block = source.slice(start, end)
    const directory = block.match(/^\s+directory:\s*(.+)$/mu)?.[1]
    const ignoredDependencies = [
      ...block.matchAll(/^\s+- dependency-name:\s*(.+)$/gmu),
    ].map(dependencyMatch => unquoteYaml(dependencyMatch[1]))
    return {
      directory: directory ? unquoteYaml(directory) : '',
      ecosystem: unquoteYaml(match[1]),
      hasGroups: /^\s+groups:\s*$/mu.test(block),
      hasIgnore: /^\s+ignore:\s*$/mu.test(block),
      ignoredDependencies,
    }
  })
}

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null
}

function validateReviewedException(
  exception,
  { allowExpired = false, identifier, now },
) {
  const errors = []
  if (!String(exception.rationale ?? '').trim()) {
    errors.push(`${identifier} needs a rationale.`)
  }
  const expiresOn = isoDate(String(exception.expiresOn ?? ''))
  if (!expiresOn) {
    errors.push(`${identifier} needs an ISO expiry date.`)
  } else if (expiresOn < now.toISOString().slice(0, 10) && !allowExpired) {
    errors.push(`${identifier} expired on ${expiresOn}.`)
  }
  return errors
}

export function validateDeferrals(registry, now = new Date(), options = {}) {
  const errors = []
  const unitIds = new Set((registry.units ?? []).map(unit => unit.id))
  const seen = new Set()

  for (const deferral of registry.deferrals ?? []) {
    if (!unitIds.has(deferral.unit)) {
      errors.push(`Deferral references unknown unit "${deferral.unit}".`)
    }
    if (!String(deferral.available ?? '').trim()) {
      errors.push(`Deferral for "${deferral.unit}" needs an available target.`)
    }
    const key = `${deferral.unit}:${deferral.available}`
    if (seen.has(key)) {
      errors.push(`Deferral "${key}" is duplicated.`)
    }
    seen.add(key)
    errors.push(
      ...validateReviewedException(deferral, {
        allowExpired: options.allowExpired,
        identifier: `Deferral for "${deferral.unit}"`,
        now,
      }),
    )
  }
  return errors
}

function packageNameFromLockPath(packagePath) {
  const marker = 'node_modules/'
  const index = packagePath.lastIndexOf(marker)
  return index === -1 ? null : packagePath.slice(index + marker.length)
}

export function unreviewedInstallScripts(packageJson, packageLock) {
  const allowScripts = packageJson.allowScripts ?? {}
  const errors = []

  for (const [packagePath, record] of Object.entries(
    packageLock.packages ?? {},
  )) {
    if (!record?.hasInstallScript) continue
    const name = packageNameFromLockPath(packagePath)
    const version = record.version
    if (!name) {
      errors.push(
        `Install-script lock entry "${packagePath}" has no dependency name.`,
      )
      continue
    }
    if (!PINNABLE_PACKAGE_VERSION_PATTERN.test(String(version ?? ''))) {
      errors.push(
        `Install script ${name} has unpinnable lockfile version "${String(version ?? '')}".`,
      )
      continue
    }
    const exactKey = `${name}@${version}`
    if (allowScripts[exactKey] === true || allowScripts[exactKey] === false) {
      continue
    }
    if (allowScripts[name] === false) continue
    if (allowScripts[name] === true) {
      errors.push(`Install-script approval "${name}" must pin ${exactKey}.`)
      continue
    }
    errors.push(`Install script ${exactKey} is not approved or denied.`)
  }
  return errors.sort()
}

function workflowJobBlocks(source) {
  const jobsStart = source.search(/^jobs:\s*$/mu)
  if (jobsStart === -1) return []
  const jobsSource = source.slice(jobsStart)
  const starts = [...jobsSource.matchAll(/^ {2}[A-Za-z0-9_-]+:\s*$/gmu)]
  return starts.map((match, index) => {
    const start = match.index ?? 0
    const end = starts[index + 1]?.index ?? jobsSource.length
    return jobsSource.slice(start, end)
  })
}

export function workflowsMissingNpmBootstrap(root) {
  const failures = []
  const workflows = walkFiles(path.join(root, '.github', 'workflows'), name =>
    /\.ya?ml$/u.test(name),
  )

  for (const workflowPath of workflows) {
    const relativePath = `.github/workflows/${workflowPath}`
    for (const [index, job] of workflowJobBlocks(
      readText(root, relativePath),
    ).entries()) {
      if (!/\bnpm\s+(?:ci|install)\b/u.test(job)) continue
      if (!job.includes('node scripts/install-repository-npm.mjs')) {
        failures.push(`${relativePath} job ${index + 1}`)
      }
    }
  }
  return failures
}

export function workflowsWithEarlyNpmCache(root) {
  const failures = []
  const workflows = walkFiles(path.join(root, '.github', 'workflows'), name =>
    /\.ya?ml$/u.test(name),
  )

  for (const workflowPath of workflows) {
    const relativePath = `.github/workflows/${workflowPath}`
    for (const [index, job] of workflowJobBlocks(
      readText(root, relativePath),
    ).entries()) {
      const bootstrapIndex = job.indexOf(
        'node scripts/install-repository-npm.mjs',
      )
      for (const match of job.matchAll(
        /^\s+- name:[^\n]*\n\s+uses: actions\/setup-node@[^\n]*\n\s+with:\n(?<inputs>(?:\s{10,}\S[^\n]*\n)*)/gmu,
      )) {
        const inputs = match.groups?.inputs ?? ''
        const setupIndex = match.index ?? 0
        const runsBeforeBootstrap =
          bootstrapIndex === -1 || setupIndex < bootstrapIndex
        if (
          runsBeforeBootstrap &&
          (!inputs.includes('package-manager-cache: false') ||
            inputs.includes("cache: 'npm'"))
        ) {
          failures.push(`${relativePath} job ${index + 1}`)
        }
      }
    }
  }
  return failures
}

function activePolicyFiles(root) {
  const roots = [
    '.github/workflows',
    '.devcontainer',
    'containers',
    'docs/development',
    'scripts/azure-dev/templates',
  ]
  return roots.flatMap(relativeRoot => {
    const absoluteRoot = path.join(root, relativeRoot)
    if (!fs.existsSync(absoluteRoot)) return []
    return walkFiles(absoluteRoot, name =>
      /\.(?:container|json|md|mjs|sh|ya?ml)$/u.test(name),
    ).map(relativePath => `${relativeRoot}/${relativePath}`)
  })
}

export function floatingNpmToolchainInstallPaths(root) {
  return activePolicyFiles(root).filter(relativePath => {
    if (
      relativePath.includes('/__tests__/') ||
      relativePath.startsWith('docs/research/')
    ) {
      return false
    }
    return /\bnpm@(?:latest|next)\b/u.test(readText(root, relativePath))
  })
}

function validateRegistryShape(root, registry) {
  const errors = []
  if (registry.schemaVersion !== 1) {
    errors.push('dependency-maintenance.json schemaVersion must be 1.')
  }
  const ids = new Set()
  for (const unit of registry.units ?? []) {
    if (!unit.id || ids.has(unit.id)) {
      errors.push(`Maintenance unit id "${unit.id}" is missing or duplicated.`)
    }
    ids.add(unit.id)
    if (!['dependabot', 'issue'].includes(unit.lane)) {
      errors.push(`Maintenance unit "${unit.id}" has unsupported lane.`)
    }
    if (unit.lane === 'dependabot') {
      const ecosystem = DEPENDABOT_KIND_ECOSYSTEMS[unit.kind]
      if (!ecosystem || ecosystem !== unit.ecosystem) {
        errors.push(
          `Dependabot unit "${unit.id}" has unsupported kind or ecosystem.`,
        )
      }
    }
    if (unit.lane === 'issue') {
      if (!unit.skill) {
        errors.push(`Issue unit "${unit.id}" must name a remediation skill.`)
      }
      const contract = ISSUE_DETECTOR_CONTRACTS[unit.detector]
      if (!contract) {
        errors.push(
          `Issue unit "${unit.id}" has unsupported detector "${unit.detector}".`,
        )
      } else if (unit.kind !== contract.kind || unit.skill !== contract.skill) {
        errors.push(
          `Issue unit "${unit.id}" does not match the "${unit.detector}" detector contract.`,
        )
      }
      if (unit.kind === 'release-toolchain') {
        if (
          !unit.repository ||
          !Array.isArray(unit.paths) ||
          !unit.paths.length
        ) {
          errors.push(
            `Release toolchain unit "${unit.id}" must declare its repository and synchronized paths.`,
          )
        } else {
          for (const relativePath of unit.paths) {
            if (
              typeof relativePath !== 'string' ||
              !fs.existsSync(path.join(root, relativePath))
            ) {
              errors.push(
                `Registered release toolchain path "${relativePath}" is not active.`,
              )
            }
          }
        }
      }
    }
    if (unit.runtimeReferencePolicy !== undefined) {
      errors.push(
        `Maintenance unit "${unit.id}" uses the retired runtime reference policy.`,
      )
    }
  }
  return errors
}

function canonicalNpmVersion(root) {
  try {
    return readJson(root, 'package.json').packageManager?.match(
      PACKAGE_MANAGER_PATTERN,
    )?.[1]
  } catch {
    return undefined
  }
}

function readNpmProjectJson(root, relativePath, missingMessage) {
  try {
    return { value: readJson(root, relativePath) }
  } catch (error) {
    return {
      error:
        error?.code === 'ENOENT'
          ? missingMessage
          : `${relativePath} must contain valid JSON.`,
    }
  }
}

function validateNpmProjects(root, registry, expectedVersion) {
  const errors = []
  if (!expectedVersion) {
    errors.push(
      'package.json must declare packageManager as an exact npm version.',
    )
  }
  const packageUnits = registry.units.filter(
    unit => unit.kind === 'npm-package',
  )
  const discovered = discoverPackageProjects(root)

  for (const projectPath of discovered) {
    const matches = packageUnits.filter(unit => unit.path === projectPath)
    if (matches.length !== 1) {
      errors.push(
        `npm project "${projectPath}" routes to ${matches.length} maintenance lanes.`,
      )
      continue
    }
    const manifestPath =
      projectPath === '.' ? 'package.json' : `${projectPath}/package.json`
    const lockPath =
      projectPath === '.'
        ? 'package-lock.json'
        : `${projectPath}/package-lock.json`
    const npmrcPath = projectPath === '.' ? '.npmrc' : `${projectPath}/.npmrc`
    const manifestResult = readNpmProjectJson(
      root,
      manifestPath,
      `${manifestPath} is required for npm project "${projectPath}".`,
    )
    if (manifestResult.error) {
      errors.push(manifestResult.error)
      continue
    }
    const lockResult = readNpmProjectJson(
      root,
      lockPath,
      `${lockPath} is required for npm project "${projectPath}".`,
    )
    if (lockResult.error) {
      errors.push(lockResult.error)
      continue
    }
    const packageJson = manifestResult.value
    const packageLock = lockResult.value
    const packageManagerMatch = packageJson.packageManager?.match(
      PACKAGE_MANAGER_PATTERN,
    )
    if (expectedVersion && packageManagerMatch?.[1] !== expectedVersion) {
      errors.push(`${manifestPath} must pin npm@${expectedVersion}.`)
    }
    const devEngine = packageJson.devEngines?.packageManager
    if (
      devEngine?.name !== 'npm' ||
      devEngine?.version !== expectedVersion ||
      devEngine?.onFail !== 'error'
    ) {
      errors.push(`${manifestPath} must fail on npm version drift.`)
    }
    if (
      !fs.existsSync(path.join(root, npmrcPath)) ||
      !/^strict-allow-scripts=true$/mu.test(readText(root, npmrcPath))
    ) {
      errors.push(`${npmrcPath} must enable strict-allow-scripts.`)
    }
    if (
      !packageJson.allowScripts ||
      Array.isArray(packageJson.allowScripts) ||
      typeof packageJson.allowScripts !== 'object'
    ) {
      errors.push(`${manifestPath} must declare allowScripts.`)
    } else {
      errors.push(
        ...unreviewedInstallScripts(packageJson, packageLock).map(
          error => `${manifestPath}: ${error}`,
        ),
      )
    }
  }

  for (const unit of packageUnits) {
    if (!discovered.includes(unit.path)) {
      errors.push(`Registered npm project "${unit.path}" is not active.`)
    }
  }
  return errors
}

function validateImageCoverage(root, registry) {
  const errors = []
  const dockerUnits = registry.units.filter(
    unit =>
      unit.kind === 'dockerfile-image' ||
      (unit.kind === 'image-lock' && Array.isArray(unit.paths)),
  )
  const lockUnits = registry.units.filter(unit => unit.kind === 'image-lock')
  const developmentLockPaths = new Set()

  for (const input of discoverDockerfileInputs(root)) {
    if (!input.image) {
      errors.push(
        `Docker input "${input.path}" has unresolved base image "${input.reference}".`,
      )
      continue
    }
    const matches = dockerUnits.filter(
      unit => unit.image === input.image && unit.paths?.includes(input.path),
    )
    if (matches.length !== 1) {
      errors.push(
        `Docker input "${input.path}" (${input.image}) routes to ${matches.length} maintenance lanes.`,
      )
      continue
    }
    if (
      input.path.startsWith('.devcontainer/') &&
      !isNamedTagOnlyImageReference(input.reference)
    ) {
      errors.push(
        `Development base image "${input.path}" must use an explicit non-latest tag without a digest.`,
      )
    }
    const [unit] = matches
    if (
      unit?.kind === 'image-lock' &&
      input.path.startsWith('.devcontainer/')
    ) {
      developmentLockPaths.add(unit.lockPath)
      const lock = readJson(root, unit.lockPath)
      const expectedReference = `${unit.image}:${lock.tag}`
      if (input.reference !== expectedReference) {
        errors.push(
          `Development base image "${input.path}" must use tag-only reference "${expectedReference}".`,
        )
      }
    }
  }

  for (const input of discoverImageLocks(root)) {
    const matches = lockUnits.filter(
      unit => unit.lockPath === input.path && unit.image === input.image,
    )
    if (matches.length !== 1) {
      errors.push(
        `Image lock "${input.path}" (${input.image}) routes to ${matches.length} maintenance lanes.`,
      )
    }
  }

  const imageUnits = [...new Set([...dockerUnits, ...lockUnits])]
  for (const input of discoverRuntimeImageReferences(root)) {
    const matches = imageUnits.filter(unit => unit.image === input.image)
    if (matches.length !== 1) {
      errors.push(
        `Runtime image "${input.path}" (${input.image}) routes to ${matches.length} maintenance lanes.`,
      )
      continue
    }
    const [unit] = matches
    if (
      unit.kind === 'image-lock' &&
      isDevelopmentRuntimeImageFile(input.path)
    ) {
      developmentLockPaths.add(unit.lockPath)
      const lock = readJson(root, unit.lockPath)
      const expectedReference = `${unit.image}:${lock.tag}`
      if (input.reference !== expectedReference) {
        errors.push(
          `Development runtime image "${input.path}" must use tag-only reference "${expectedReference}".`,
        )
      }
    }
  }

  for (const unit of dockerUnits) {
    for (const dockerfilePath of unit.paths ?? []) {
      if (!fs.existsSync(path.join(root, dockerfilePath))) {
        errors.push(`Registered Dockerfile "${dockerfilePath}" is not active.`)
      }
    }
  }
  for (const unit of lockUnits) {
    if (!fs.existsSync(path.join(root, unit.lockPath))) {
      errors.push(`Registered image lock "${unit.lockPath}" is not active.`)
      continue
    }
    const lock = readJson(root, unit.lockPath)
    const lockTag = String(lock.tag ?? '').trim()
    if (
      developmentLockPaths.has(unit.lockPath) &&
      !isValidNamedImageTag(lockTag)
    ) {
      errors.push(
        `Development image lock "${unit.lockPath}" must use a valid explicit non-latest tag.`,
      )
    }
    if (
      unit.detector === 'devcontainer-base' &&
      !isNarrowDevcontainerBaseTag(lockTag)
    ) {
      errors.push(
        `Development base image lock "${unit.lockPath}" must use an exact semantic version tag for Ubuntu 24.04.`,
      )
    }
  }
  return errors
}

function dependabotDirectory(root, directory) {
  const relativePath = String(directory ?? '').replace(/^\/+/u, '') || '.'
  const absolutePath = path.resolve(root, relativePath)
  if (
    absolutePath !== path.resolve(root) &&
    !absolutePath.startsWith(`${path.resolve(root)}${path.sep}`)
  ) {
    return null
  }
  return { absolutePath, relativePath }
}

function dependabotDependencyNames(root, exclusion) {
  const directory = dependabotDirectory(root, exclusion.directory)
  if (!directory || !fs.existsSync(directory.absolutePath)) return []

  if (exclusion.ecosystem === 'npm') {
    const manifestPath = path.join(directory.absolutePath, 'package.json')
    const lockPath = path.join(directory.absolutePath, 'package-lock.json')
    if (!fs.existsSync(manifestPath)) return []
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const packageLock = fs.existsSync(lockPath)
      ? JSON.parse(fs.readFileSync(lockPath, 'utf8'))
      : {}
    return [
      ...new Set(
        [
          'dependencies',
          'devDependencies',
          'optionalDependencies',
          'peerDependencies',
        ]
          .flatMap(section => Object.keys(manifest[section] ?? {}))
          .concat(
            Object.keys(packageLock.dependencies ?? {}),
            Object.keys(packageLock.packages ?? {}).flatMap(packagePath =>
              packageNameFromLockPath(packagePath)
                ? [packageNameFromLockPath(packagePath)]
                : [],
            ),
          ),
      ),
    ]
  }

  if (exclusion.ecosystem === 'github-actions') {
    const workflowsRoot = path.join(root, '.github/workflows')
    if (!fs.existsSync(workflowsRoot)) return []
    return walkFiles(workflowsRoot, name => /\.ya?ml$/u.test(name)).flatMap(
      relativePath =>
        [
          ...readText(workflowsRoot, relativePath).matchAll(
            /^\s*(?:-\s+)?uses:\s*['"]?(?<action>[^'"\s@]+)@[^'"\s#]+['"]?(?:\s+#.*)?$/gmu,
          ),
        ].flatMap(match => match.groups?.action ?? []),
    )
  }

  if (exclusion.ecosystem === 'docker') {
    return discoverDockerfileInputs(root).flatMap(input => {
      const inputDirectory = slashPath(path.posix.dirname(input.path))
      return input.image && inputDirectory === slashPath(directory.relativePath)
        ? [input.image]
        : []
    })
  }

  if (exclusion.ecosystem === 'devcontainers') {
    return walkFiles(directory.absolutePath, name =>
      name.endsWith('.json'),
    ).flatMap(relativePath =>
      [
        ...readText(directory.absolutePath, relativePath).matchAll(
          /"(?<feature>[^"]+\/features\/[^"]+)"\s*:/gu,
        ),
      ].flatMap(match =>
        match.groups?.feature
          ? [match.groups.feature.replace(/:[^/]+$/u, '')]
          : [],
      ),
    )
  }

  return []
}

function matchesDependabotPattern(dependencyName, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`, 'u').test(
    dependencyName,
  )
}

function dependabotDependencyExists(root, exclusion) {
  let pattern = exclusion.dependencyName
  if (exclusion.ecosystem === 'docker') {
    pattern = normalizeImageRepository(pattern) ?? pattern
  }
  return dependabotDependencyNames(root, exclusion).some(dependencyName =>
    matchesDependabotPattern(dependencyName, pattern),
  )
}

function validateDependabotExclusions(root, registry, entries, now) {
  const errors = []
  const exclusions = registry.dependabotExclusions ?? []
  const seen = new Set()

  for (const exclusion of exclusions) {
    const key = `${exclusion.ecosystem}:${exclusion.directory}:${exclusion.dependencyName}`
    if (seen.has(key)) {
      errors.push(`Dependabot exclusion "${key}" is duplicated.`)
    }
    seen.add(key)
    if (
      !exclusion.ecosystem ||
      !exclusion.directory ||
      !exclusion.dependencyName
    ) {
      errors.push('Dependabot exclusions must identify one dependency.')
    }
    errors.push(
      ...validateReviewedException(exclusion, {
        identifier: `Dependabot exclusion "${key}"`,
        now,
      }),
    )
    const configured = entries.some(
      entry =>
        entry.ecosystem === exclusion.ecosystem &&
        entry.directory === exclusion.directory &&
        entry.ignoredDependencies.includes(exclusion.dependencyName),
    )
    if (!configured) {
      errors.push(`Dependabot exclusion "${key}" is not configured.`)
    }
    if (
      exclusion.dependencyName &&
      !dependabotDependencyExists(root, exclusion)
    ) {
      errors.push(
        `Dependabot exclusion "${key}" references an inactive dependency.`,
      )
    }
  }
  return errors
}

function validateDependabot(root, registry, now) {
  const errors = []
  const entries = parseDependabotEntries(
    readText(root, '.github/dependabot.yml'),
  )
  const expected = registry.units.filter(
    unit => unit.lane === 'dependabot' && unit.ecosystem && unit.directory,
  )

  for (const unit of expected) {
    const matches = entries.filter(
      entry =>
        entry.ecosystem === unit.ecosystem &&
        entry.directory === unit.directory,
    )
    if (matches.length !== 1) {
      errors.push(
        `Dependabot unit "${unit.id}" has ${matches.length} matching entries.`,
      )
    }
  }
  for (const entry of entries) {
    const matches = expected.filter(
      unit =>
        unit.ecosystem === entry.ecosystem &&
        unit.directory === entry.directory,
    )
    if (matches.length !== 1) {
      errors.push(
        `Dependabot ${entry.ecosystem}:${entry.directory} is not routed exactly once.`,
      )
    }
    if (entry.ecosystem === 'npm' && entry.hasGroups) {
      errors.push(
        `Dependabot npm:${entry.directory} must keep one dependency per PR.`,
      )
    }
    if (entry.hasIgnore && entry.ignoredDependencies.length === 0) {
      errors.push(
        `Dependabot ${entry.ecosystem}:${entry.directory} has an empty exclusion block.`,
      )
    }
    for (const dependencyName of entry.ignoredDependencies) {
      const explained = (registry.dependabotExclusions ?? []).some(
        exclusion =>
          exclusion.ecosystem === entry.ecosystem &&
          exclusion.directory === entry.directory &&
          exclusion.dependencyName === dependencyName,
      )
      if (!explained) {
        errors.push(
          `Dependabot ${entry.ecosystem}:${entry.directory} excludes "${dependencyName}" without reviewed policy.`,
        )
      }
    }
  }
  return [
    ...errors,
    ...validateDependabotExclusions(root, registry, entries, now),
  ]
}

function validateInstallSurfaces(root, expectedVersion) {
  const errors = []

  for (const workflow of workflowsMissingNpmBootstrap(root)) {
    errors.push(`${workflow} uses npm without the canonical npm bootstrap.`)
  }
  for (const workflow of workflowsWithEarlyNpmCache(root)) {
    errors.push(
      `${workflow} must disable setup-node npm caching before the canonical npm bootstrap.`,
    )
  }
  for (const relativePath of floatingNpmToolchainInstallPaths(root)) {
    errors.push(`${relativePath} contains a floating npm toolchain install.`)
  }

  if (expectedVersion) {
    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      const source = readText(root, relativePath)
      if (!source.includes(`"npmVersion": "${expectedVersion}"`)) {
        errors.push(`${relativePath} must install npm ${expectedVersion}.`)
      }
    }
  }

  for (const { path: dockerfilePath } of discoverDockerfileInputs(root)) {
    const source = readText(root, dockerfilePath)
    if (
      /\bnpm ci\b/u.test(source) &&
      !DOCKER_NPM_BOOTSTRAP_PATTERN.test(source)
    ) {
      errors.push(
        `${dockerfilePath} must derive npm from its copied package.json.`,
      )
    }
  }

  const azureBootstrap = readText(
    root,
    'scripts/azure-dev/templates/bootstrap-host.sh',
  )
  if (
    !azureBootstrap.includes('node scripts/install-repository-npm.mjs') ||
    /run_as_vscode[^\n]*node scripts\/install-repository-npm\.mjs/u.test(
      azureBootstrap,
    )
  ) {
    errors.push(
      'Azure bootstrap must install the canonical repository npm as root.',
    )
  }

  for (const relativePath of [
    '.devcontainer/Dockerfile',
    'scripts/azure-dev/templates/bootstrap-host.sh',
  ]) {
    const source = readText(root, relativePath).replace(/\\\r?\n\s*/gu, ' ')
    const executesNetworkResponse = [
      /\b(?:curl|wget)\b[^|\n]*\|\s*(?:(?:sudo|env)(?:\s+(?:--?\S+|[A-Za-z_][A-Za-z0-9_]*=\S+))*\s+|[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:(?:ba|da|k|z)?sh)\b/iu,
      /\b(?:(?:ba|da|k|z)?sh)\s+-c\s+["']?(?:\$\(|`)\s*(?:curl|wget)\b/iu,
      /\b(?:eval|source)\b[^\n]*(?:\$\(|`|<\()\s*(?:curl|wget)\b/iu,
      /(?:^|[;&|]\s*)\.\s+(?:\$\(|`|<\()\s*(?:curl|wget)\b/imu,
      /(?:^|[;&]\s*)`\s*(?:curl|wget)\b[^`\n]*`/imu,
    ].some(pattern => pattern.test(source))
    if (executesNetworkResponse) {
      errors.push(
        `${relativePath} must not execute network responses directly as shell code.`,
      )
    }
  }
  return errors
}

export function validateDependencyMaintenance(
  root,
  registry = readJson(root, '.github/dependency-maintenance.json'),
  now = new Date(),
  options = {},
) {
  const normalizedRegistry = {
    ...registry,
    units: registry.units ?? [],
  }
  const expectedNpmVersion = canonicalNpmVersion(root)
  return [
    ...validateRegistryShape(root, normalizedRegistry),
    ...validateDeferrals(normalizedRegistry, now, {
      allowExpired: options.allowExpiredDeferrals,
    }),
    ...validateNpmProjects(root, normalizedRegistry, expectedNpmVersion),
    ...validateImageCoverage(root, normalizedRegistry),
    ...validateDependabot(root, normalizedRegistry, now),
    ...validateInstallSurfaces(root, expectedNpmVersion),
  ]
}

export function main(root = process.cwd()) {
  const errors = validateDependencyMaintenance(root)
  if (errors.length > 0) {
    console.error('Dependency maintenance validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    return 1
  }
  console.log('Dependency maintenance coverage and policy are valid.')
  return 0
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) process.exitCode = main()
