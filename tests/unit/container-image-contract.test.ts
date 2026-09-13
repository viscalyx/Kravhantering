import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { parseJsonc } from './test-helpers'

const disabledSystemSkillPaths = [
  '/home/vscode/.codex/skills/.system/plugin-creator/SKILL.md',
  '/home/vscode/.codex/skills/.system/review-agent/SKILL.md',
  '/home/vscode/.codex/skills/.system/skill-creator/SKILL.md',
  '/home/vscode/.codex/skills/.system/skill-installer/SKILL.md',
]
const disabledPluginNames = ['openai-templates', 'plugin-management']

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function listPublicPngFiles() {
  const publicRoot = path.join(process.cwd(), 'public')

  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        const relativeDirectory = path
          .relative(publicRoot, absolutePath)
          .replaceAll(path.sep, '/')
        if (relativeDirectory === 'api-docs') {
          return []
        }
        return walk(absolutePath)
      }
      if (!entry.isFile() || !entry.name.endsWith('.png')) {
        return []
      }
      return [path.relative(publicRoot, absolutePath).replaceAll(path.sep, '/')]
    })
  }

  return walk(publicRoot).sort()
}

function dockerignorePatterns(content: string) {
  return new Set(
    content
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')),
  )
}

function dockerfileInstructions(content: string) {
  return content
    .replace(/\\\r?\n\s*/gu, ' ')
    .split(/\r?\n/u)
    .flatMap(line => {
      const match = line.match(/^([A-Z]+)\s+(.+)$/u)
      return match ? [{ keyword: match[1], value: match[2] }] : []
    })
}

function workflowRunCommands(relativePath: string) {
  const workflow = parseYaml(readWorkspaceFile(relativePath)) as {
    jobs?: Record<string, { steps?: Array<{ run?: string }> }>
  }
  return Object.values(workflow.jobs ?? {}).flatMap(job =>
    (job.steps ?? []).flatMap(step => (step.run ? [step.run] : [])),
  )
}

function expectDisabledSystemSkills(content: string) {
  for (const pluginName of disabledPluginNames) {
    expect(content).toMatch(
      new RegExp(
        `\\[plugins\\.(?:"${pluginName}"|${pluginName})\\]\\nenabled = false`,
        'u',
      ),
    )
  }
  expect(content).not.toContain('/plugins/cache/')
  expect(content.match(/\[\[skills\.config\]\]/gu)).toHaveLength(4)
  for (const skillPath of disabledSystemSkillPaths) {
    expect(content).toContain(`path = "${skillPath}"`)
  }
}

describe('container image contract', () => {
  it('runs the isolated HSA test-PKI provisioner without runtime npm', () => {
    for (const relativePath of [
      '.devcontainer/docker-compose.yml',
      '.devcontainer/elevated/docker-compose.yml',
    ]) {
      const compose = parseYaml(readWorkspaceFile(relativePath)) as {
        services?: Record<string, { command?: string[] }>
      }

      expect(compose.services?.['hsa-mtls-provisioner']?.command).toEqual([
        'activate',
        '--lifetime',
        'persistent',
      ])
    }

    const azureQuadlet = readWorkspaceFile(
      'scripts/azure-dev/templates/quadlet/krav-hsa-mtls-provisioner.container',
    )
    expect(azureQuadlet).toContain('Exec=activate --lifetime persistent')
    expect(azureQuadlet).not.toContain('Exec=npm')
  })

  it('keeps public PNG assets limited to deployed application content', () => {
    const publicPngFiles = listPublicPngFiles()

    expect(publicPngFiles).toEqual(['logo-small.png'])
  })

  it('uses a Dockerfile-specific ignore file for production builds', () => {
    const dockerignore = readWorkspaceFile(
      'containers/app/Dockerfile.dockerignore',
    )

    expect(dockerignore).toContain('docs/')
    expect(dockerignore).toContain('tests/')
    expect(dockerignore).toContain('.github/')
    expect(dockerignore).toContain('.devcontainer/')
    expect(dockerignore).toContain('public/api-docs/')
    expect(dockerignore).not.toContain('typeorm/seed.mjs')
    expect(dockerignore).not.toContain(
      'typeorm/seed-specification-agreements.mjs',
    )
    expect(dockerignore).not.toContain('typeorm/seed-dogfood.mjs')
    expect(dockerignore).not.toContain(
      'typeorm/seed-playwright-manual-cases-build.mjs',
    )
    expect(dockerignore).not.toContain(
      'typeorm/seed-archiving-retention-build.mjs',
    )
    expect(dockerignore).not.toContain('typeorm/seed-required.mjs')
    expect(dockerignore).not.toContain('typeorm/ai-safety-seed-data.mjs')
  })

  it('excludes developer credentials and SSH state from production build contexts', () => {
    for (const relativePath of [
      'containers/app/Dockerfile.dockerignore',
      'containers/hsa-directory-mock/Dockerfile.dockerignore',
      'containers/hsa-person-lookup-adapter/Dockerfile.dockerignore',
    ]) {
      const patterns = dockerignorePatterns(readWorkspaceFile(relativePath))

      expect([...patterns]).toEqual(
        expect.arrayContaining([
          '.auth/',
          '.codex/',
          '.ssh/',
          '.env',
          '.env.*',
        ]),
      )
    }

    const sensitiveEnvironmentNames = new Set([
      'CODEX_HOME',
      'COPILOT_GITHUB_TOKEN',
      'GH_TOKEN',
      'SSH_AUTH_SOCK',
    ])
    for (const relativePath of [
      'containers/app/Dockerfile',
      'containers/hsa-directory-mock/Dockerfile',
      'containers/hsa-person-lookup-adapter/Dockerfile',
    ]) {
      const declaredNames = dockerfileInstructions(
        readWorkspaceFile(relativePath),
      )
        .filter(instruction => ['ARG', 'ENV'].includes(instruction.keyword))
        .flatMap(instruction =>
          instruction.value
            .split(/\s+/u)
            .map(assignment => assignment.split('=', 1)[0]),
        )
      expect(
        declaredNames.filter(name => sensitiveEnvironmentNames.has(name)),
      ).toEqual([])
    }

    const packageJson = JSON.parse(readWorkspaceFile('package.json')) as {
      scripts: Record<string, string>
    }
    const productionBuildCommands = [
      ...Object.values(packageJson.scripts),
      ...workflowRunCommands('.github/workflows/container-pr-smoke.yml'),
      ...workflowRunCommands('.github/workflows/container-release.yml'),
    ].filter(command => command.includes('docker buildx build'))
    expect(productionBuildCommands.length).toBeGreaterThan(0)
    for (const command of productionBuildCommands) {
      expect(command).not.toMatch(/--(?:secret|ssh)(?:[=\s]|$)/u)
    }
  })

  it('declares Docker outside-of-Docker with Buildx in both devcontainers', () => {
    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      const devcontainer = parseJsonc(readWorkspaceFile(relativePath)) as {
        features: Record<string, Record<string, unknown>>
      }
      const dockerFeatureKeys = Object.keys(devcontainer.features).filter(key =>
        key.startsWith(
          'ghcr.io/devcontainers/features/docker-outside-of-docker:',
        ),
      )

      expect(dockerFeatureKeys).toHaveLength(1)
      const dockerFeature = devcontainer.features[dockerFeatureKeys[0]]

      expect(dockerFeature).toMatchObject({
        dockerDashComposeVersion: 'v2',
        installDockerBuildx: true,
        installDockerComposeSwitch: true,
        moby: true,
        mobyBuildxVersion: 'latest',
        version: 'latest',
      })
    }
  })

  it('exports HSA topology candidates as archives Docker can load', () => {
    const workflow = readWorkspaceFile(
      '.github/workflows/container-pr-smoke.yml',
    )

    expect(workflow.match(/--output type=docker,dest=/gu)).toHaveLength(2)
    expect(workflow).not.toContain('--output type=oci,dest=')
    expect(workflow.match(/docker load --input/gu)).toHaveLength(2)
    expect(workflow.match(/skopeo copy/gu)).toHaveLength(2)
    expect(workflow.match(/test "\$actual" = "\$expected"/gu)).toHaveLength(2)
    expect(workflow).not.toContain(
      '--file containers/hsa-directory-mock/Dockerfile .',
    )
    expect(workflow).not.toContain(
      '--file containers/hsa-person-lookup-adapter/Dockerfile .',
    )
  })

  it('keeps Codex devcontainer permissions in the user config template', () => {
    const codexConfig = readWorkspaceFile('.devcontainer/codex-config.toml')

    expect(codexConfig).toContain('approval_policy = "never"')
    expect(codexConfig).toContain(
      'default_permissions = "kravhantering-development"',
    )
    expect(codexConfig).toContain('[projects."/workspace"]')
    expect(codexConfig).toContain('trust_level = "trusted"')
    expect(codexConfig).toContain(
      '[permissions.kravhantering-development.filesystem]',
    )
    expect(codexConfig).toContain('"~/.codex/skills" = "write"')
    expect(codexConfig).toContain(
      '[permissions.kravhantering-development.filesystem.":workspace_roots"]',
    )
    expect(codexConfig).toContain('".codex" = "write"')
    expect(codexConfig).toContain('".git" = "write"')
    expect(codexConfig).toContain(
      '[permissions.kravhantering-development.network.domains]',
    )
    expect(codexConfig).not.toContain('[mcp_servers.playwright]')
    expect(codexConfig).not.toContain('[tui]')
    expectDisabledSystemSkills(codexConfig)

    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      expect(readWorkspaceFile(relativePath)).toContain(
        'python3 scripts/azure-dev/templates/merge-codex-config.py .devcontainer/codex-config.toml /home/vscode/.codex/config.toml',
      )
      expect(readWorkspaceFile(relativePath)).not.toContain(
        'if [ ! -f /home/vscode/.codex/config.toml ]',
      )
    }
  })

  it('starts the shared Codex app-server before devcontainer terminals are used', () => {
    const dockerfile = readWorkspaceFile('.devcontainer/Dockerfile')

    expect(dockerfile).toContain('CODEX_HOME=/home/vscode/.codex')

    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      const devcontainer = parseJsonc(readWorkspaceFile(relativePath)) as {
        postStartCommand: string
      }

      expect(devcontainer.postStartCommand).toMatch(
        /^bash -lc 'codex app-server daemon start \|\| \{ echo "Codex shared app-server daemon failed to start\." >&2; exit 1; \};/u,
      )
    }
  })

  it('installs Podman tooling for the local container stack', () => {
    const dockerfile = readWorkspaceFile('.devcontainer/Dockerfile')
    const defaultCompose = readWorkspaceFile('.devcontainer/docker-compose.yml')
    const elevatedCompose = readWorkspaceFile(
      '.devcontainer/elevated/docker-compose.yml',
    )

    for (const packageName of [
      'podman',
      'podman-compose',
      'aardvark-dns',
      'fuse-overlayfs',
      'netavark',
      'slirp4netns',
      'uidmap',
    ]) {
      expect(dockerfile).toContain(packageName)
    }
    expect(dockerfile).toContain('ENV STORAGE_DRIVER=vfs')
    expect(dockerfile).toContain('network_backend = "netavark"')
    expect(defaultCompose).toContain('/dev/fuse:/dev/fuse')
    expect(defaultCompose).toContain('/dev/net/tun:/dev/net/tun')
    expect(elevatedCompose).toContain('/dev/fuse:/dev/fuse')
    expect(elevatedCompose).toContain('/dev/net/tun:/dev/net/tun')
  })

  it('exposes local Buildx commands for image targets', () => {
    const packageJson = JSON.parse(readWorkspaceFile('package.json'))

    expect(packageJson.scripts['container:build:app-runtime']).toBe(
      'docker buildx build --file containers/app/Dockerfile --target app-runtime --tag localhost/kravhantering/app-runtime:local --load .',
    )
    expect(packageJson.scripts['container:build:app-runtime:no-cache']).toBe(
      'docker buildx build --no-cache --file containers/app/Dockerfile --target app-runtime --tag localhost/kravhantering/app-runtime:local --load .',
    )
    expect(packageJson.scripts['container:build:db-job']).toBe(
      'docker buildx build --file containers/app/Dockerfile --target db-job --tag localhost/kravhantering/db-job:local --load .',
    )
    expect(packageJson.scripts['container:build:db-job:no-cache']).toBe(
      'docker buildx build --no-cache --file containers/app/Dockerfile --target db-job --tag localhost/kravhantering/db-job:local --load .',
    )
    expect(packageJson.scripts['container:build:demo-seed']).toBe(
      'docker buildx build --file containers/app/Dockerfile --target demo-seed --tag localhost/kravhantering/demo-seed:local --load .',
    )
    expect(packageJson.scripts['container:build:demo-seed:no-cache']).toBe(
      'docker buildx build --no-cache --file containers/app/Dockerfile --target demo-seed --tag localhost/kravhantering/demo-seed:local --load .',
    )
    expect(packageJson.scripts['container:build:hsa-directory-mock']).toBe(
      'docker buildx build --file containers/hsa-directory-mock/Dockerfile --tag localhost/kravhantering/hsa-directory-mock:local --load .',
    )
    expect(
      packageJson.scripts['container:build:hsa-person-lookup-adapter'],
    ).toBe(
      'docker buildx build --file containers/hsa-person-lookup-adapter/Dockerfile --tag localhost/kravhantering/hsa-person-lookup-adapter:local --load .',
    )
    expect(packageJson.scripts['container:build:hsa-mtls-provisioner']).toBe(
      'docker buildx build --file containers/hsa-mtls-provisioner/Dockerfile --tag localhost/kravhantering/hsa-mtls-provisioner:local --load .',
    )
  })

  it('keeps nginx scoped to TLS, app proxying, and Keycloak forwarding', () => {
    const nginxConf = readWorkspaceFile('containers/nginx/nginx.conf')
    const siteConf = readWorkspaceFile(
      'containers/nginx/conf.d/kravhantering.test.conf',
    )

    expect(nginxConf).toContain('include /etc/nginx/conf.d/*.conf;')
    expect(siteConf).toContain('server_name kravhantering.test;')
    expect(siteConf).toContain(
      'ssl_certificate /etc/nginx/tls/kravhantering.test.crt;',
    )
    expect(siteConf).toContain(
      'ssl_certificate_key /etc/nginx/tls/kravhantering.test.key;',
    )
    expect(siteConf).toContain('proxy_pass http://app-runtime:3000;')
    expect(siteConf).toContain('proxy_pass http://keycloak:8080/;')
    for (const header of [
      'Host $host',
      'X-Forwarded-Proto https',
      'X-Forwarded-Host $host',
      'X-Forwarded-Port 443',
    ]) {
      expect(siteConf).toContain(`proxy_set_header ${header};`)
    }
  })

  it('grants the bounded generated-output routes the extended timeout', () => {
    const generatedOutputConfig = readWorkspaceFile(
      'containers/production/nginx/templates/generated-output-locations.conf',
    )
    const locationExpression = generatedOutputConfig.match(
      /^location ~ (\S+) \{$/m,
    )?.[1]

    expect(locationExpression).toBeDefined()
    const generatedOutputRoute = new RegExp(locationExpression ?? '')
    expect(generatedOutputRoute.test('/api/requirements/export')).toBe(true)
    expect(
      generatedOutputRoute.test(
        '/api/requirements-specifications/920008/exports',
      ),
    ).toBe(true)
    expect(generatedOutputRoute.test('/sv/requirements/reports/pdf/list')).toBe(
      true,
    )
    expect(
      generatedOutputRoute.test(
        '/api/requirements-specifications/920008/rfi-list/export',
      ),
    ).toBe(false)
    expect(generatedOutputConfig).toContain('proxy_read_timeout 660s;')
  })

  it('keeps SQL Server example env scoped to the vendor database engine', () => {
    const sqlServerEnv = readWorkspaceFile(
      'containers/sqlserver/.env.sqlserver.example',
    )

    expect(sqlServerEnv).toContain('ACCEPT_EULA=Y')
    expect(sqlServerEnv).toContain('MSSQL_PID=Developer')
    expect(sqlServerEnv).toContain('MSSQL_SA_PASSWORD=YourStrong!Passw0rd')
    expect(sqlServerEnv).toContain('SQLSERVER_HOST_PORT=1433')
    expect(sqlServerEnv).not.toMatch(/^DB_/m)
    expect(sqlServerEnv).not.toMatch(/^AUTH_/m)
    expect(sqlServerEnv).not.toMatch(/^DATABASE_/m)
    expect(sqlServerEnv).not.toMatch(/^NEXT_PUBLIC_/m)
    expect(sqlServerEnv).not.toMatch(/^KEYCLOAK_/m)
  })

  it('keeps local container stack bootstrap explicit before app startup', () => {
    const compose = readWorkspaceFile(
      'containers/compose/container-stack.template.yml',
    )
    const dbJobEnv = readWorkspaceFile('containers/db-job/.env.db-job.example')

    expect(compose).toContain('db-bootstrap:')
    expect(compose).toContain('command: ["bootstrap"]')
    expect(compose).toContain(
      'db-bootstrap:\n        condition: service_completed_successfully',
    )
    expect(compose).toContain('image: "{{demoSeedImage}}"')
    expect(compose).not.toContain('./typeorm/seed.mjs')
    expect(compose).toContain('name: "{{sqlServerVolumeName}}"')
    expect(dbJobEnv).toContain('DB_BOOTSTRAP_ADMIN_USER=sa')
    expect(dbJobEnv).toContain('DB_BOOTSTRAP_APP_USER=kravhantering_app')
  })

  it('keeps the generated test network parameterized', () => {
    const generatedTemplate = readWorkspaceFile(
      'containers/compose/container-stack.template.yml',
    )

    expect(generatedTemplate).toContain('name: "{{networkName}}"')
  })
})
