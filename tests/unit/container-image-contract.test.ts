import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

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

function parseJsoncWithLineComments(content: string) {
  return JSON.parse(
    content
      .split('\n')
      .filter(line => !line.trimStart().startsWith('//'))
      .join('\n'),
  )
}

function dockerfileTarget(name: string) {
  const dockerfile = readWorkspaceFile('containers/app/Dockerfile')
  const marker = new RegExp(`^FROM .+ AS ${name}$`, 'm')
  const match = dockerfile.match(marker)
  expect(match).not.toBeNull()
  const start = match?.index ?? 0
  const rest = dockerfile.slice(start)
  const nextTarget = rest.slice(1).search(/^FROM /m)
  return nextTarget === -1 ? rest : rest.slice(0, nextTarget + 1)
}

describe('container image contract', () => {
  it('pins every Node base image by tag and digest', () => {
    const dockerfile = readWorkspaceFile('containers/app/Dockerfile')
    const fromLines = dockerfile
      .split('\n')
      .filter(line => line.startsWith('FROM node:24-bookworm-slim@sha256:'))

    expect(fromLines).toHaveLength(4)
    expect(fromLines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS dependencies$/,
        ),
        expect.stringMatching(
          /^FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS db-job-dependencies$/,
        ),
        expect.stringMatching(
          /^FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS app-runtime$/,
        ),
        expect.stringMatching(
          /^FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS db-job$/,
        ),
      ]),
    )
  })

  it('keeps app-runtime to standalone output and public assets', () => {
    const target = dockerfileTarget('app-runtime')

    expect(target).toContain('/workspace/.next/standalone')
    expect(target).toContain('/workspace/.next/static')
    expect(target).toContain('/workspace/public')
    expect(target).toContain('USER node')
    expect(target).toContain('CMD ["node", "server.js"]')
    expect(target).not.toContain('COPY . .')
    expect(target).not.toContain('typeorm/')
    expect(target).not.toContain('tests/')
    expect(target).not.toContain('docs/')
  })

  it('keeps public PNG assets limited to deployed application content', () => {
    const publicPngFiles = listPublicPngFiles()

    expect(publicPngFiles).toEqual(['logo-small.png'])
  })

  it('sets the public site URL during the standalone app build', () => {
    const target = dockerfileTarget('app-build')
    const siteUrlEnv = 'ENV NEXT_PUBLIC_SITE_URL=$' + '{NEXT_PUBLIC_SITE_URL}'

    expect(target).toContain('ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000')
    expect(target).toContain(siteUrlEnv)
  })

  it('keeps db-job to migrations and required seed code', () => {
    const target = dockerfileTarget('db-job')

    expect(target).toContain('COPY --from=db-job-dependencies')
    expect(target).toContain('scripts/db-sqlserver-admin.mjs')
    expect(target).toContain('typeorm/migrations')
    expect(target).toContain('typeorm/seed-required.mjs')
    expect(target).toContain('typeorm/seed-runner.mjs')
    expect(target).toContain('USER node')
    expect(target).toContain(
      'ENTRYPOINT ["node", "scripts/db-sqlserver-admin.mjs"]',
    )
    expect(target).not.toContain('typeorm/seed.mjs')
    expect(target).not.toContain('seed-dogfood')
    expect(target).not.toContain('seed-archiving-retention-build')
    expect(target).not.toContain('tests/')
    expect(target).not.toContain('docs/')
  })

  it('installs only the database job dependency subset', () => {
    const target = dockerfileTarget('db-job-dependencies')

    expect(target).toContain(
      "const dbJobDependencies = ['mssql', 'reflect-metadata', 'typeorm']",
    )
    expect(target).toContain(
      'npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund',
    )
    expect(target).not.toContain('next')
    expect(target).not.toContain('react')
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
    expect(dockerignore).toContain('typeorm/seed.mjs')
    expect(dockerignore).toContain('typeorm/seed-dogfood.mjs')
    expect(dockerignore).toContain('typeorm/seed-archiving-retention-build.mjs')
    expect(dockerignore).not.toContain('typeorm/seed-required.mjs')
  })

  it('declares Docker outside-of-Docker with Buildx in both devcontainers', () => {
    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      const devcontainer = parseJsoncWithLineComments(
        readWorkspaceFile(relativePath),
      )
      const dockerFeature =
        devcontainer.features[
          'ghcr.io/devcontainers/features/docker-outside-of-docker:1'
        ]

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
    expect(packageJson.scripts['container:build:hsa-directory-mock']).toBe(
      'docker buildx build --file containers/hsa-directory-mock/Dockerfile --tag localhost/kravhantering/hsa-directory-mock:local --load containers/hsa-directory-mock',
    )
    expect(
      packageJson.scripts['container:build:hsa-person-lookup-adapter'],
    ).toBe(
      'docker buildx build --file containers/hsa-person-lookup-adapter/Dockerfile --tag localhost/kravhantering/hsa-person-lookup-adapter:local --load containers/hsa-person-lookup-adapter',
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
      'X-Forwarded-For $proxy_add_x_forwarded_for',
    ]) {
      expect(siteConf).toContain(`proxy_set_header ${header};`)
    }
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
    expect(compose).toContain(
      './typeorm/seed.mjs:/workspace/typeorm/seed.mjs:ro',
    )
    expect(compose).toContain('name: "{{sqlServerVolumeName}}"')
    expect(dbJobEnv).toContain('DB_BOOTSTRAP_ADMIN_USER=sa')
    expect(dbJobEnv).toContain('DB_BOOTSTRAP_APP_USER=kravhantering_app')
  })

  it('uses the short internal network name for release and generated stacks', () => {
    const productionComposeFiles = [
      'containers/production/compose/app-node-http.compose.yml',
      'containers/production/compose/app-node-tls.compose.yml',
      'containers/production/compose/single-node.compose.yml',
    ]

    for (const relativePath of productionComposeFiles) {
      const compose = readWorkspaceFile(relativePath)

      expect(compose).toContain('name: kravhantering-internal')
      expect(compose).not.toContain(
        'kravhantering-app-node_kravhantering-internal',
      )
      expect(compose).not.toContain(
        'kravhantering-single-node_kravhantering-internal',
      )
    }

    const generatedTemplate = readWorkspaceFile(
      'containers/compose/container-stack.template.yml',
    )

    expect(generatedTemplate).toContain('name: "{{networkName}}"')
  })
})
