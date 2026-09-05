import childProcess from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const productionSmokePath = path.resolve(
  process.cwd(),
  'scripts/containers/production-smoke.sh',
)

function inspectFixture() {
  return {
    'kravhantering-app-runtime': {
      Mounts: [],
      HostConfig: {
        Tmpfs: { '/run/kravhantering/export': 'rw', '/tmp': 'rw' },
      },
    },
    'kravhantering-nginx': {
      Mounts: [],
      HostConfig: {
        Tmpfs: {
          '/etc/nginx/conf.d': 'rw',
          '/run': 'rw',
          '/var/cache/nginx': 'rw',
        },
      },
    },
    'kravhantering-keycloak': {
      Mounts: [{ Destination: '/opt/keycloak/data', RW: true }],
      HostConfig: {
        Tmpfs: { '/opt/keycloak/lib/quarkus': 'rw', '/tmp': 'rw' },
      },
    },
    'kravhantering-sqlserver': {
      Mounts: [
        { Destination: '/var/opt/mssql', RW: true },
        { Destination: '/var/opt/mssql/mssql.conf', RW: false },
        { Destination: '/etc/kravhantering/sqlserver-tls', RW: false },
      ],
      HostConfig: { Tmpfs: { '/.system': 'rw', '/tmp': 'rw' } },
    },
  }
}

function verifyMounts(fixture) {
  return childProcess.spawnSync(
    'bash',
    [
      '-c',
      `
        source "$1"
        as_service() {
          [[ "$1" == podman && "$2" == inspect && $# == 3 ]] || return 1
          jq --arg name "$3" '[.[$name]]' <<<"$INSPECT_FIXTURE"
        }
        verify_writable_mounts
      `,
      'bash',
      productionSmokePath,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, INSPECT_FIXTURE: JSON.stringify(fixture) },
    },
  )
}

describe('production smoke writable mount containment', () => {
  it('accepts the documented service mounts including SQL Server startup scratch', () => {
    const result = verifyMounts(inspectFixture())

    expect(result.status, result.stderr).toBe(0)
  })

  it.each(['/.system', '/tmp', '/var/opt/mssql'])(
    'rejects a missing SQL Server writable path: %s',
    destination => {
      const fixture = inspectFixture()
      const sqlserver = fixture['kravhantering-sqlserver']
      delete sqlserver.HostConfig.Tmpfs[destination]
      sqlserver.Mounts = sqlserver.Mounts.filter(
        mount => mount.Destination !== destination,
      )

      const result = verifyMounts(fixture)

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'SQL Server writable mount allow-list did not match the contract',
      )
    },
  )

  it.each(Object.keys(inspectFixture()))(
    'rejects an unexpected writable tmpfs in %s',
    name => {
      const fixture = inspectFixture()
      fixture[name].HostConfig.Tmpfs['/unexpected'] = 'rw'

      const result = verifyMounts(fixture)

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('writable mount allow-list')
    },
  )

  it('rejects a writable SQL Server configuration bind mount', () => {
    const fixture = inspectFixture()
    fixture['kravhantering-sqlserver'].Mounts[1].RW = true

    const result = verifyMounts(fixture)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'SQL Server writable mount allow-list did not match the contract',
    )
  })
})
