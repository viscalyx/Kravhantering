import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discoverDockerfileInputs,
  discoverImageLocks,
  discoverPackageProjects,
  discoverRuntimeImageInputs,
  floatingNpmToolchainInstallPaths,
  normalizeImageRepository,
  parseDependabotEntries,
  unreviewedInstallScripts,
  validateDeferrals,
  validateDependencyMaintenance,
  workflowsMissingNpmBootstrap,
  workflowsWithEarlyNpmCache,
} from '../dependency-maintenance.mjs'
import { packageManagerVersion } from '../install-repository-npm.mjs'

const temporaryDirectories = []
const digest = character => `sha256:${character.repeat(64)}`

function temporaryDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dependency-maintenance-test-'),
  )
  temporaryDirectories.push(directory)
  return directory
}

function write(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, contents)
}

function copy(root, relativePath) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(process.cwd(), relativePath), target)
}

function expectedNpmVersion(root) {
  return packageManagerVersion(
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
  )
}

function fixture() {
  const root = temporaryDirectory()
  const registry = JSON.parse(
    fs.readFileSync('.github/dependency-maintenance.json', 'utf8'),
  )
  const packageProjects = discoverPackageProjects(process.cwd())
  const dockerInputs = discoverDockerfileInputs(process.cwd())
  const locks = discoverImageLocks(process.cwd())
  const runtimeInputs = discoverRuntimeImageInputs(process.cwd())
  const files = new Set([
    '.github/dependency-maintenance.json',
    '.github/dependabot.yml',
    '.devcontainer/devcontainer.json',
    '.devcontainer/elevated/devcontainer.json',
    'scripts/azure-dev/templates/bootstrap-host.sh',
    ...registry.units.flatMap(unit => unit.paths ?? []),
    ...packageProjects.flatMap(project =>
      project === '.'
        ? ['package.json', 'package-lock.json', '.npmrc']
        : [
            `${project}/package.json`,
            `${project}/package-lock.json`,
            `${project}/.npmrc`,
          ],
    ),
    ...dockerInputs.map(input => input.path),
    ...locks.map(lock => lock.path),
    ...runtimeInputs.map(input => input.path),
  ])
  for (const workflow of fs.readdirSync(
    path.join(process.cwd(), '.github/workflows'),
  )) {
    if (/\.ya?ml$/u.test(workflow)) {
      files.add(`.github/workflows/${workflow}`)
    }
  }
  for (const relativePath of files) copy(root, relativePath)
  return root
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true })
  }
})

describe('dependency maintenance discovery', () => {
  it('normalizes registry names and ignores variables', () => {
    expect(normalizeImageRepository('node:24')).toBe('docker.io/library/node')
    expect(normalizeImageRepository('kong/kong-gateway:3')).toBe(
      'docker.io/kong/kong-gateway',
    )
    expect(
      normalizeImageRepository('quay.io/keycloak/keycloak:26@sha256:abc'),
    ).toBe('quay.io/keycloak/keycloak')
    expect(normalizeImageRepository('$' + '{IMAGE_REF}')).toBeNull()
    expect(normalizeImageRepository('$IMAGE_REF')).toBeNull()
  })

  it('discovers every active package, Dockerfile, lock, and runtime image', () => {
    expect(discoverPackageProjects(process.cwd())).toEqual([
      '.',
      'containers/hsa-directory-mock',
      'containers/hsa-mtls-provisioner',
      'containers/hsa-person-lookup-adapter',
    ])
    expect(discoverDockerfileInputs(process.cwd())).toEqual(
      expect.arrayContaining([
        {
          image: 'mcr.microsoft.com/devcontainers/base',
          path: '.devcontainer/Dockerfile',
          reference: expect.stringMatching(
            /^mcr\.microsoft\.com\/devcontainers\/base:[^@\s]+$/u,
          ),
        },
        {
          image: 'docker.io/library/node',
          path: 'containers/app/Dockerfile',
          reference: expect.stringMatching(
            /^node:(?!latest@)[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}@sha256:[a-f0-9]{64}$/u,
          ),
        },
      ]),
    )
    expect(discoverImageLocks(process.cwd())).toHaveLength(5)
    expect(discoverRuntimeImageInputs(process.cwd())).toEqual(
      expect.arrayContaining([
        {
          image: 'quay.io/keycloak/keycloak',
          path: 'docker-compose.idp.yml',
        },
      ]),
    )
  })

  it('ignores repositories mounted under the local worktree directory', () => {
    const root = temporaryDirectory()
    write(root, 'package.json', '{}')
    write(root, '.worktrees/feature/package.json', '{}')
    write(root, '.worktrees/feature/Dockerfile', 'FROM node:24\n')

    expect(discoverPackageProjects(root)).toEqual(['.'])
    expect(discoverDockerfileInputs(root)).toEqual([])
  })

  it('ignores build stages, scratch, variables, examples, and local images', () => {
    const root = temporaryDirectory()
    write(
      root,
      'containers/example/Dockerfile',
      [
        '# comment',
        'FROM --platform=linux/amd64 node:24 AS build',
        'FROM build AS packaged',
        'FROM scratch',
        '',
      ].join('\n'),
    )
    write(
      root,
      'docker-compose.example.yml',
      [
        'services:',
        '  variable:',
        '    image: $' + '{IMAGE_REF}',
        '  mirror:',
        '    image: registry.example.internal/image:1',
        '  local:',
        '    image: localhost/project/image:1',
        '',
      ].join('\n'),
    )
    expect(discoverDockerfileInputs(root)).toEqual([
      {
        image: 'docker.io/library/node',
        path: 'containers/example/Dockerfile',
        reference: 'node:24',
      },
    ])
    expect(discoverRuntimeImageInputs(root)).toEqual([])
  })

  it('resolves Docker ARG defaults and reports unresolved base images', () => {
    const root = temporaryDirectory()
    write(
      root,
      'containers/example/Dockerfile',
      [
        'ARG BUILD_IMAGE=node:24',
        `FROM \${BUILD_IMAGE} AS build`,
        'ARG RUNTIME_IMAGE',
        `FROM \${RUNTIME_IMAGE}`,
        'ARG OTHER_IMAGE',
        'FROM $OTHER_IMAGE',
        '',
      ].join('\n'),
    )

    expect(discoverDockerfileInputs(root)).toEqual([
      {
        image: 'docker.io/library/node',
        path: 'containers/example/Dockerfile',
        reference: 'node:24',
      },
      {
        image: null,
        path: 'containers/example/Dockerfile',
        reference: `\${RUNTIME_IMAGE}`,
      },
      {
        image: null,
        path: 'containers/example/Dockerfile',
        reference: '$OTHER_IMAGE',
      },
    ])
  })

  it('parses native Dependabot entries and policy blocks', () => {
    const entries = parseDependabotEntries(`
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    groups:
      all:
        patterns: ['*']
  - package-ecosystem: "docker"
    directory: "/image"
    ignore:
      - dependency-name: node
`)
    expect(entries).toEqual([
      {
        directory: '/',
        ecosystem: 'npm',
        hasGroups: true,
        hasIgnore: false,
        ignoredDependencies: [],
      },
      {
        directory: '/image',
        ecosystem: 'docker',
        hasGroups: false,
        hasIgnore: true,
        ignoredDependencies: ['node'],
      },
    ])
  })
})

describe('dependency maintenance policy', () => {
  it('accepts the repository registry and discovered coverage', () => {
    expect(validateDependencyMaintenance(fixture())).toEqual([])
  })

  it('requires development runtime tags to match the image lock without a digest', () => {
    const root = fixture()
    const quadletPath =
      'scripts/azure-dev/templates/quadlet/krav-kong.container'
    const lock = JSON.parse(
      fs.readFileSync(path.join(root, 'containers/kong/image.lock.json')),
    )
    const expectedReference = `${lock.image}:${lock.tag}`
    write(
      root,
      quadletPath,
      fs
        .readFileSync(path.join(root, quadletPath), 'utf8')
        .replace(expectedReference, `${lock.image}:stale@${digest('f')}`),
    )

    expect(validateDependencyMaintenance(root)).toContain(
      `Development runtime image "${quadletPath}" must use tag-only reference "${expectedReference}".`,
    )
  })

  it('requires the development base image to match its lock and use an exact version tag', () => {
    const root = fixture()
    const dockerfilePath = '.devcontainer/Dockerfile'
    const lockPath = 'containers/devcontainer-base/image.lock.json'
    const lock = JSON.parse(fs.readFileSync(path.join(root, lockPath)))
    const expectedReference = `${lock.image}:${lock.tag}`

    write(
      root,
      dockerfilePath,
      fs
        .readFileSync(path.join(root, dockerfilePath), 'utf8')
        .replace(expectedReference, `${lock.image}:2-ubuntu-24.04`),
    )
    lock.tag = '2-ubuntu-24.04'
    write(root, lockPath, `${JSON.stringify(lock, null, 2)}\n`)

    const errors = validateDependencyMaintenance(root)
    expect(errors).toContain(
      `Development base image lock "${lockPath}" must use an exact semantic version tag for Ubuntu 24.04.`,
    )
  })

  it('requires the development base Dockerfile reference to match its lock', () => {
    const root = fixture()
    const dockerfilePath = '.devcontainer/Dockerfile'
    const lock = JSON.parse(
      fs.readFileSync(
        path.join(root, 'containers/devcontainer-base/image.lock.json'),
      ),
    )
    const expectedReference = `${lock.image}:${lock.tag}`

    write(
      root,
      dockerfilePath,
      fs
        .readFileSync(path.join(root, dockerfilePath), 'utf8')
        .replace(expectedReference, `${lock.image}:9.9.9-ubuntu-24.04`),
    )

    expect(validateDependencyMaintenance(root)).toContain(
      `Development base image "${dockerfilePath}" must use tag-only reference "${expectedReference}".`,
    )
  })

  it('rejects latest as a canonical service image tag', () => {
    const root = fixture()
    const lockPath = 'containers/kong/image.lock.json'
    const lock = JSON.parse(fs.readFileSync(path.join(root, lockPath)))
    const previousReference = `${lock.image}:${lock.tag}`
    lock.tag = 'latest'
    write(root, lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    for (const relativePath of [
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
      'scripts/azure-dev/templates/quadlet/krav-kong.container',
    ]) {
      write(
        root,
        relativePath,
        fs
          .readFileSync(path.join(root, relativePath), 'utf8')
          .replace(previousReference, `${lock.image}:latest`),
      )
    }

    expect(validateDependencyMaintenance(root)).toContain(
      `Development image lock "${lockPath}" must use a valid explicit non-latest tag.`,
    )
  })

  it('rejects digest syntax disguised as a development image-lock tag', () => {
    const root = fixture()
    const lockPath = 'containers/kong/image.lock.json'
    const lock = JSON.parse(fs.readFileSync(path.join(root, lockPath)))
    const previousReference = `${lock.image}:${lock.tag}`
    lock.tag = `named@${digest('a')}`
    write(root, lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    for (const relativePath of [
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
      'scripts/azure-dev/templates/quadlet/krav-kong.container',
    ]) {
      write(
        root,
        relativePath,
        fs
          .readFileSync(path.join(root, relativePath), 'utf8')
          .replace(previousReference, `${lock.image}:${lock.tag}`),
      )
    }

    expect(validateDependencyMaintenance(root)).toContain(
      `Development image lock "${lockPath}" must use a valid explicit non-latest tag.`,
    )
  })

  it.each([
    ['latest', () => 'mcr.microsoft.com/devcontainers/base:latest'],
    ['an implicit latest tag', () => 'mcr.microsoft.com/devcontainers/base'],
    ['a digest', currentReference => `${currentReference}@${digest('a')}`],
  ])(
    'rejects %s for the development base image',
    (_description, invalidReference) => {
      const root = fixture()
      const dockerfilePath = '.devcontainer/Dockerfile'
      const currentReference = discoverDockerfileInputs(root).find(
        input =>
          input.path === dockerfilePath &&
          input.image === 'mcr.microsoft.com/devcontainers/base',
      )?.reference

      expect(currentReference).toBeTruthy()
      write(
        root,
        dockerfilePath,
        fs
          .readFileSync(path.join(root, dockerfilePath), 'utf8')
          .replace(currentReference, invalidReference(currentReference)),
      )

      expect(validateDependencyMaintenance(root)).toContain(
        `Development base image "${dockerfilePath}" must use an explicit non-latest tag without a digest.`,
      )
    },
  )

  it('accepts the exact development base tag recorded by its image lock', () => {
    const root = fixture()
    const dockerfilePath = '.devcontainer/Dockerfile'
    const currentReference = discoverDockerfileInputs(root).find(
      input =>
        input.path === dockerfilePath &&
        input.image === 'mcr.microsoft.com/devcontainers/base',
    )?.reference

    expect(currentReference).toBeTruthy()
    expect(validateDependencyMaintenance(root)).toEqual([])
  })

  it('does not apply the development lock policy to production-only locks', () => {
    const root = fixture()
    const lockPath = 'containers/nginx/image.lock.json'
    const lock = JSON.parse(fs.readFileSync(path.join(root, lockPath)))
    lock.tag = 'latest'
    write(root, lockPath, `${JSON.stringify(lock, null, 2)}\n`)

    expect(validateDependencyMaintenance(root)).toEqual([])
  })

  it('does not apply development tag policy to production runtime references', () => {
    const root = fixture()
    const productionPath = 'containers/production/compose.yml'
    const lock = JSON.parse(
      fs.readFileSync(path.join(root, 'containers/kong/image.lock.json')),
    )
    write(
      root,
      productionPath,
      `services:\n  kong:\n    image: ${lock.image}:${lock.tag}@${lock.manifestDigest}\n`,
    )

    expect(validateDependencyMaintenance(root)).toEqual([])
  })

  it.each([
    'curl -fsSL https://example.test/install.sh | sh',
    'sh -c "$(curl -fsSL https://example.test/install.sh)"',
    'curl -fsSL https://example.test/install.sh | sudo bash',
    'eval "$(wget -qO- https://example.test/install.sh)"',
  ])('rejects direct execution of a network response: %s', unsafeInstaller => {
    const root = fixture()
    const bootstrapPath = 'scripts/azure-dev/templates/bootstrap-host.sh'
    write(
      root,
      bootstrapPath,
      `${fs.readFileSync(path.join(root, bootstrapPath), 'utf8')}\n${unsafeInstaller}\n`,
    )

    expect(validateDependencyMaintenance(root)).toContain(
      `${bootstrapPath} must not execute network responses directly as shell code.`,
    )
  })

  it('catches a new npm project without Dependabot coverage', () => {
    const root = fixture()
    write(root, 'containers/new-service/package.json', '{}\n')
    write(
      root,
      'containers/new-service/package-lock.json',
      '{"packages":{"":{}}}\n',
    )
    write(root, 'containers/new-service/.npmrc', 'strict-allow-scripts=true\n')
    expect(validateDependencyMaintenance(root)).toContain(
      'npm project "containers/new-service" routes to 0 maintenance lanes.',
    )
  })

  it('catches a new Dockerfile and runtime image without a lane', () => {
    const root = fixture()
    write(
      root,
      'containers/new-service/Dockerfile',
      `ARG BASE_IMAGE=alpine:3.23
FROM \${BASE_IMAGE}
`,
    )
    write(
      root,
      'docker-compose.extra.yml',
      'services:\n  extra:\n    image: alpine:3.23\n',
    )
    const errors = validateDependencyMaintenance(root)
    expect(errors).toContain(
      'Docker input "containers/new-service/Dockerfile" (docker.io/library/alpine) routes to 0 maintenance lanes.',
    )
    expect(errors).toContain(
      'Runtime image "docker-compose.extra.yml" (docker.io/library/alpine) routes to 0 maintenance lanes.',
    )
  })

  it('fails coverage for a Dockerfile base image without an ARG default', () => {
    const root = fixture()
    write(
      root,
      'containers/new-service/Dockerfile',
      `ARG BASE_IMAGE
FROM \${BASE_IMAGE}
`,
    )

    expect(validateDependencyMaintenance(root)).toContain(
      `Docker input "containers/new-service/Dockerfile" has unresolved base image "\${BASE_IMAGE}".`,
    )
  })

  it('catches npm version drift and missing fail-closed policy', () => {
    const root = fixture()
    const npmVersion = expectedNpmVersion(root)
    const manifestPath = 'containers/hsa-directory-mock/package.json'
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath)))
    manifest.packageManager = 'npm@12.1.0'
    write(root, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    write(
      root,
      'containers/hsa-person-lookup-adapter/.npmrc',
      'strict-allow-scripts=false\n',
    )
    const errors = validateDependencyMaintenance(root)
    expect(errors).toContain(`${manifestPath} must pin npm@${npmVersion}.`)
    expect(errors).toContain(
      'containers/hsa-person-lookup-adapter/.npmrc must enable strict-allow-scripts.',
    )
  })

  it('catches invalid registry shape and stale registered inputs', () => {
    const root = fixture()
    const registryPath = path.join(root, '.github/dependency-maintenance.json')
    const registry = JSON.parse(fs.readFileSync(registryPath))
    registry.schemaVersion = 2
    const rootManifestPath = path.join(root, 'package.json')
    const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath))
    rootManifest.packageManager = 'npm@latest'
    fs.writeFileSync(
      rootManifestPath,
      `${JSON.stringify(rootManifest, null, 2)}\n`,
    )
    const nodeUnit = registry.units.find(unit => unit.id === 'production-node')
    nodeUnit.detector = 'future-node'
    nodeUnit.runtimeReferencePolicy = 'floating'
    nodeUnit.skill = 'future-skill'
    const lycheeUnit = registry.units.find(
      unit => unit.id === 'lychee-toolchain',
    )
    delete lycheeUnit.repository
    lycheeUnit.paths = []
    registry.units.push(
      { ...registry.units[0] },
      {
        directory: '/missing',
        ecosystem: 'npm',
        id: 'missing-npm',
        kind: 'npm-package',
        lane: 'dependabot',
        path: 'containers/missing',
      },
      {
        id: 'missing-docker',
        image: 'docker.io/library/alpine',
        kind: 'dockerfile-image',
        lane: 'invalid',
        paths: ['containers/missing/Dockerfile'],
      },
      {
        id: 'missing-lock',
        image: 'docker.io/library/alpine',
        kind: 'image-lock',
        lane: 'issue',
        lockPath: 'containers/missing/image.lock.json',
      },
    )
    const errors = validateDependencyMaintenance(root, registry)
    expect(errors).toEqual(
      expect.arrayContaining([
        'dependency-maintenance.json schemaVersion must be 1.',
        'package.json must declare packageManager as an exact npm version.',
        'Maintenance unit id "npm-root" is missing or duplicated.',
        'Maintenance unit "missing-docker" has unsupported lane.',
        'Issue unit "missing-lock" must name a remediation skill.',
        'Issue unit "production-node" has unsupported detector "future-node".',
        'Release toolchain unit "lychee-toolchain" must declare its repository and synchronized paths.',
        'Maintenance unit "production-node" uses the retired runtime reference policy.',
        'Issue unit "missing-lock" has unsupported detector "undefined".',
        'Registered npm project "containers/missing" is not active.',
        'Registered Dockerfile "containers/missing/Dockerfile" is not active.',
        'Registered image lock "containers/missing/image.lock.json" is not active.',
      ]),
    )
  })

  it('catches malformed manifest and stale install surfaces', () => {
    const root = fixture()
    const npmVersion = expectedNpmVersion(root)
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, 'containers/hsa-directory-mock/package.json'),
      ),
    )
    delete manifest.devEngines
    manifest.allowScripts = []
    write(
      root,
      'containers/hsa-directory-mock/package.json',
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
    const devcontainerPath = '.devcontainer/devcontainer.json'
    write(
      root,
      devcontainerPath,
      fs
        .readFileSync(path.join(root, devcontainerPath), 'utf8')
        .replace(`"npmVersion": "${npmVersion}"`, '"npmVersion": "latest"'),
    )
    const dockerfilePath = 'containers/hsa-directory-mock/Dockerfile'
    write(
      root,
      dockerfilePath,
      fs
        .readFileSync(path.join(root, dockerfilePath), 'utf8')
        .replace(/^RUN npm install --global.*\n/mu, ''),
    )
    const azurePath = 'scripts/azure-dev/templates/bootstrap-host.sh'
    write(
      root,
      azurePath,
      fs
        .readFileSync(path.join(root, azurePath), 'utf8')
        .replace('node scripts/install-repository-npm.mjs', 'node --version'),
    )
    write(
      root,
      'docs/development/floating.md',
      'Install npm with `npm@latest`.\n',
    )
    const errors = validateDependencyMaintenance(root)
    expect(errors).toEqual(
      expect.arrayContaining([
        'containers/hsa-directory-mock/package.json must fail on npm version drift.',
        'containers/hsa-directory-mock/package.json must declare allowScripts.',
        `.devcontainer/devcontainer.json must install npm ${npmVersion}.`,
        'containers/hsa-directory-mock/Dockerfile must derive npm from its copied package.json.',
        'Azure bootstrap must install the canonical repository npm as root.',
        'docs/development/floating.md contains a floating npm toolchain install.',
      ]),
    )
  })

  it('reports invalid manifests and missing lockfiles as policy errors', () => {
    const invalidRootManifest = fixture()
    write(invalidRootManifest, 'package.json', '{invalid json\n')
    expect(validateDependencyMaintenance(invalidRootManifest)).toEqual(
      expect.arrayContaining([
        'package.json must declare packageManager as an exact npm version.',
        'package.json must contain valid JSON.',
      ]),
    )

    const invalidManifestRoot = fixture()
    write(
      invalidManifestRoot,
      'containers/hsa-directory-mock/package.json',
      '{invalid json\n',
    )
    expect(validateDependencyMaintenance(invalidManifestRoot)).toContain(
      'containers/hsa-directory-mock/package.json must contain valid JSON.',
    )

    const missingLockRoot = fixture()
    fs.rmSync(
      path.join(
        missingLockRoot,
        'containers/hsa-person-lookup-adapter/package-lock.json',
      ),
    )
    expect(validateDependencyMaintenance(missingLockRoot)).toContain(
      'containers/hsa-person-lookup-adapter/package-lock.json is required for npm project "containers/hsa-person-lookup-adapter".',
    )
  })

  it('normalizes missing registry units before policy validation', () => {
    const root = fixture()
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, '.github/dependency-maintenance.json')),
    )
    delete registry.units

    expect(validateDependencyMaintenance(root, registry)).toContain(
      'npm project "." routes to 0 maintenance lanes.',
    )
  })

  it('accepts shell-safe Docker npm bootstrap formatting variations', () => {
    const root = fixture()
    const dockerfilePath = 'containers/hsa-directory-mock/Dockerfile'
    const source = fs.readFileSync(path.join(root, dockerfilePath), 'utf8')
    write(
      root,
      dockerfilePath,
      source.replace(
        /^RUN npm install --global.*$/mu,
        `RUN npm   install   --global npm@$( node -p "require( './package.json' ).packageManager.slice( 4 )" )`,
      ),
    )

    expect(validateDependencyMaintenance(root)).not.toContain(
      `${dockerfilePath} must derive npm from its copied package.json.`,
    )
  })

  it('catches unreviewed and unpinned lifecycle scripts', () => {
    expect(
      unreviewedInstallScripts(
        { allowScripts: {} },
        {
          packages: {
            'node_modules/example': {
              hasInstallScript: true,
              version: '1.2.3',
            },
          },
        },
      ),
    ).toEqual(['Install script example@1.2.3 is not approved or denied.'])
    expect(
      unreviewedInstallScripts(
        { allowScripts: { example: true } },
        {
          packages: {
            'node_modules/example': {
              hasInstallScript: true,
              version: '1.2.3',
            },
          },
        },
      ),
    ).toEqual(['Install-script approval "example" must pin example@1.2.3.'])
    expect(
      unreviewedInstallScripts(
        {
          allowScripts: {
            'approved@1.0.0': true,
            'denied@1.0.0': false,
            deniedByName: false,
          },
        },
        {
          packages: {
            invalid: { hasInstallScript: true, version: '1.0.0' },
            'node_modules/approved': {
              hasInstallScript: true,
              version: '1.0.0',
            },
            'node_modules/bad-version': {
              hasInstallScript: true,
              version: 'latest',
            },
            'node_modules/denied': {
              hasInstallScript: true,
              version: '1.0.0',
            },
            'node_modules/deniedByName': {
              hasInstallScript: true,
              version: '1.0.0',
            },
            'node_modules/platform-only': {
              hasInstallScript: true,
              os: ['unsupported'],
              version: '1.0.0',
            },
            'node_modules/preview': {
              hasInstallScript: true,
              version: '1.0.0-beta.1',
            },
          },
        },
      ),
    ).toEqual([
      'Install script bad-version has unpinnable lockfile version "latest".',
      'Install script platform-only@1.0.0 is not approved or denied.',
      'Install script preview@1.0.0-beta.1 is not approved or denied.',
      'Install-script lock entry "invalid" has no dependency name.',
    ])
  })

  it('catches floating npm toolchain installs and workflows without npm bootstrap', () => {
    const root = temporaryDirectory()
    write(
      root,
      '.github/workflows/check.yml',
      'jobs:\n  check:\n    steps:\n      - run: npm ci\n',
    )
    write(
      root,
      'docs/development/setup.md',
      'Run `npm install --global npm@latest`.\n',
    )
    expect(workflowsMissingNpmBootstrap(root)).toEqual([
      '.github/workflows/check.yml job 1',
    ])
    expect(floatingNpmToolchainInstallPaths(root)).toEqual([
      'docs/development/setup.md',
    ])
  })

  it('requires setup-node cache discovery to run after the npm bootstrap', () => {
    const root = temporaryDirectory()
    write(
      root,
      '.github/workflows/check.yml',
      `jobs:
  check:
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@pinned
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - name: Install repository npm
        run: node scripts/install-repository-npm.mjs
`,
    )
    write(
      root,
      '.github/workflows/node-only.yml',
      `jobs:
  check:
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@pinned
        with:
          node-version-file: '.nvmrc'
`,
    )
    write(
      root,
      '.github/workflows/safe.yml',
      `jobs:
  check:
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@pinned
        with:
          node-version-file: '.nvmrc'
          package-manager-cache: false
      - name: Install repository npm
        run: node scripts/install-repository-npm.mjs
      - name: Restore npm cache
        uses: actions/setup-node@pinned
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
`,
    )

    expect(workflowsWithEarlyNpmCache(root)).toEqual([
      '.github/workflows/check.yml job 1',
      '.github/workflows/node-only.yml job 1',
    ])
  })

  it('catches unexplained exclusions and expired deferrals', () => {
    const root = fixture()
    fs.appendFileSync(
      path.join(root, '.github/dependabot.yml'),
      "    ignore:\n      - dependency-name: 'example'\n",
    )
    const registryPath = path.join(root, '.github/dependency-maintenance.json')
    const registry = JSON.parse(fs.readFileSync(registryPath))
    registry.deferrals = [
      {
        available: '26.8.0',
        expiresOn: '2026-07-26',
        rationale: 'Reviewed temporary hold.',
        unit: 'keycloak',
      },
    ]
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
    const errors = validateDependencyMaintenance(
      root,
      registry,
      new Date('2026-07-27T00:00:00Z'),
    )
    expect(errors).toContain(
      'Dependabot devcontainers:/ excludes "example" without reviewed policy.',
    )
    expect(errors).toContain('Deferral for "keycloak" expired on 2026-07-26.')
    expect(
      validateDependencyMaintenance(
        root,
        registry,
        new Date('2026-07-27T00:00:00Z'),
        { allowExpiredDeferrals: true },
      ),
    ).not.toContain('Deferral for "keycloak" expired on 2026-07-26.')
  })

  it('requires exclusions to be current, specific, unique, and configured', () => {
    const root = fixture()
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, '.github/dependency-maintenance.json')),
    )
    registry.dependabotExclusions = [
      {
        dependencyName: '',
        directory: '/',
        ecosystem: 'npm',
        expiresOn: 'bad',
        rationale: '',
      },
      {
        dependencyName: 'missing',
        directory: '/',
        ecosystem: 'npm',
        expiresOn: '2026-07-26',
        rationale: 'Reviewed hold.',
      },
      {
        dependencyName: 'missing',
        directory: '/',
        ecosystem: 'npm',
        expiresOn: '2026-08-01',
        rationale: 'Reviewed hold.',
      },
    ]
    const errors = validateDependencyMaintenance(
      root,
      registry,
      new Date('2026-07-27T00:00:00Z'),
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'Dependabot exclusions must identify one dependency.',
        'Dependabot exclusion "npm:/:missing" is duplicated.',
        'Dependabot exclusion "npm:/:missing" expired on 2026-07-26.',
        'Dependabot exclusion "npm:/:missing" is not configured.',
        'Dependabot exclusion "npm:/:missing" references an inactive dependency.',
      ]),
    )
  })

  it('rejects a configured exclusion after its dependency is removed', () => {
    const root = fixture()
    const dependabotPath = path.join(root, '.github/dependabot.yml')
    const dependabot = fs
      .readFileSync(dependabotPath, 'utf8')
      .replace(
        "  - package-ecosystem: 'npm'\n    directory: '/'",
        "  - package-ecosystem: 'npm'\n    directory: '/'\n    ignore:\n      - dependency-name: 'removed-package'",
      )
    fs.writeFileSync(dependabotPath, dependabot)
    const registryPath = path.join(root, '.github/dependency-maintenance.json')
    const registry = JSON.parse(fs.readFileSync(registryPath))
    registry.dependabotExclusions = [
      {
        dependencyName: 'removed-package',
        directory: '/',
        ecosystem: 'npm',
        expiresOn: '2026-08-01',
        rationale: 'Reviewed hold.',
      },
    ]
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)

    expect(
      validateDependencyMaintenance(
        root,
        registry,
        new Date('2026-07-27T00:00:00Z'),
      ),
    ).toContain(
      'Dependabot exclusion "npm:/:removed-package" references an inactive dependency.',
    )
  })

  it('accepts an active GitHub Actions wildcard exclusion', () => {
    const root = fixture()
    const dependabotPath = path.join(root, '.github/dependabot.yml')
    const dependabot = fs
      .readFileSync(dependabotPath, 'utf8')
      .replace(
        "  - package-ecosystem: 'github-actions'\n    directory: '/'",
        "  - package-ecosystem: 'github-actions'\n    directory: '/'\n    ignore:\n      - dependency-name: 'actions/*'",
      )
    fs.writeFileSync(dependabotPath, dependabot)
    const registryPath = path.join(root, '.github/dependency-maintenance.json')
    const registry = JSON.parse(fs.readFileSync(registryPath))
    registry.dependabotExclusions = [
      {
        dependencyName: 'actions/*',
        directory: '/',
        ecosystem: 'github-actions',
        expiresOn: '2026-08-01',
        rationale: 'Reviewed hold.',
      },
    ]
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)

    expect(
      validateDependencyMaintenance(
        root,
        registry,
        new Date('2026-07-27T00:00:00Z'),
      ),
    ).toEqual([])
  })

  it('accepts an active unversioned Dev Container Feature exclusion', () => {
    const root = fixture()
    const dependabotPath = path.join(root, '.github/dependabot.yml')
    const dependabot = fs
      .readFileSync(dependabotPath, 'utf8')
      .replace(
        "  - package-ecosystem: 'devcontainers'\n    directory: '/'",
        "  - package-ecosystem: 'devcontainers'\n    directory: '/'\n    ignore:\n      - dependency-name: 'ghcr.io/devcontainers/features/node'",
      )
    fs.writeFileSync(dependabotPath, dependabot)
    const registryPath = path.join(root, '.github/dependency-maintenance.json')
    const registry = JSON.parse(fs.readFileSync(registryPath))
    registry.dependabotExclusions = [
      {
        dependencyName: 'ghcr.io/devcontainers/features/node',
        directory: '/',
        ecosystem: 'devcontainers',
        expiresOn: '2026-08-01',
        rationale: 'Reviewed hold.',
      },
    ]
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)

    expect(
      validateDependencyMaintenance(
        root,
        registry,
        new Date('2026-07-27T00:00:00Z'),
      ),
    ).toEqual([])
  })

  it('accepts an active transitive npm exclusion from the lockfile', () => {
    const root = fixture()
    const dependabotPath = path.join(root, '.github/dependabot.yml')
    const dependabot = fs
      .readFileSync(dependabotPath, 'utf8')
      .replace(
        "  - package-ecosystem: 'npm'\n    directory: '/'",
        "  - package-ecosystem: 'npm'\n    directory: '/'\n    ignore:\n      - dependency-name: '@adobe/css-tools'",
      )
    fs.writeFileSync(dependabotPath, dependabot)
    const registryPath = path.join(root, '.github/dependency-maintenance.json')
    const registry = JSON.parse(fs.readFileSync(registryPath))
    registry.dependabotExclusions = [
      {
        dependencyName: '@adobe/css-tools',
        directory: '/',
        ecosystem: 'npm',
        expiresOn: '2026-08-01',
        rationale: 'Reviewed hold.',
      },
    ]
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)

    expect(
      validateDependencyMaintenance(
        root,
        registry,
        new Date('2026-07-27T00:00:00Z'),
      ),
    ).toEqual([])
  })

  it('catches missing and duplicate Dependabot routes and npm groups', () => {
    const root = fixture()
    const dependabotPath = path.join(root, '.github/dependabot.yml')
    const source = fs.readFileSync(dependabotPath, 'utf8')
    fs.writeFileSync(
      dependabotPath,
      source
        .replace(
          "  - package-ecosystem: 'npm'\n    directory: '/'",
          "  - package-ecosystem: 'npm'\n    directory: '/'\n    groups:\n      all:\n        patterns: ['*']",
        )
        .replace(
          / {2}- package-ecosystem: 'github-actions'[\s\S]*?(?=\n {2}- package-ecosystem:)/u,
          '',
        ) +
        "\n  - package-ecosystem: 'npm'\n    directory: '/'\n    schedule:\n      interval: 'weekly'\n",
    )
    const errors = validateDependencyMaintenance(root)
    expect(errors).toEqual(
      expect.arrayContaining([
        'Dependabot unit "npm-root" has 2 matching entries.',
        'Dependabot unit "github-actions" has 0 matching entries.',
        'Dependabot npm:/ must keep one dependency per PR.',
      ]),
    )
  })

  it('requires deferral rationale, expiry, uniqueness, and known units', () => {
    const errors = validateDeferrals(
      {
        deferrals: [
          {
            available: '',
            expiresOn: 'bad',
            rationale: '',
            unit: 'missing',
          },
          {
            available: '',
            expiresOn: '2026-08-01',
            rationale: 'Hold.',
            unit: 'missing',
          },
        ],
        units: [],
      },
      new Date('2026-07-27T00:00:00Z'),
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'Deferral references unknown unit "missing".',
        'Deferral for "missing" needs an available target.',
        'Deferral for "missing" needs a rationale.',
        'Deferral for "missing" needs an ISO expiry date.',
        'Deferral "missing:" is duplicated.',
      ]),
    )
  })
})
