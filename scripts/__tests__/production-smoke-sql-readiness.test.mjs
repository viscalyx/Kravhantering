import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function run(shell, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-sql-'))
  directories.push(directory)
  const result = spawnSync(
    'bash',
    ['-s', '--', path.resolve('scripts/containers/production-smoke.sh')],
    {
      input: `source "$1"\n${shell}`,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PRODUCTION_SMOKE_EVIDENCE_DIR: directory,
        DB_JOB_IMAGE_REF: 'fixture-db-job',
        ...env,
      },
    },
  )
  expect(result.error).toBeUndefined()
  return { directory, result }
}

describe('production smoke SQL Server readiness', () => {
  it.each([
    ['wait', '3', '0', 0, '3'],
    ['wait', '100', '0', 1, undefined],
    ['wait', '3', '1', 1, '3'],
    ['health', '100', '0', 0, '0'],
  ])(
    'runs %s with engine readiness at %s and verified probe result %s',
    (command, readyAt, probeStatus, expectedStatus, expectedAttempts) => {
      const { result } = run(
        String.raw`
          engine_probes=0
          sleep() { :; }
          sqlserver_query() {
            [[ "$1" == kravhantering-sqlserver && "$2" == 'SELECT 1' ]]
            engine_probes=$((engine_probes + 1))
            (( engine_probes >= READY_AT ))
          }
          as_service() {
            if [[ "$1" == */kravhantering-quadlet.sh ]]; then
              printf 'database-network\n'
            elif [[ "$1 $2" == 'podman run' ]]; then
              printf 'engine-attempts=%s\n' "$engine_probes"
              printf '%s\n' "$@"
              return "$PROBE_STATUS"
            fi
          }
          database_job "$JOB_COMMAND"
        `,
        {
          JOB_COMMAND: command,
          READY_AT: readyAt,
          PROBE_STATUS: probeStatus,
        },
      )
      expect(result.status, result.stderr).toBe(expectedStatus)
      if (expectedAttempts === undefined) {
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain(
          'timed out waiting for kravhantering-sqlserver',
        )
      } else {
        expect(result.stdout.trim().split('\n')).toEqual([
          `engine-attempts=${expectedAttempts}`,
          'podman',
          'run',
          '--rm',
          '--pull=never',
          '--network',
          'database-network',
          '--env-file',
          '/etc/kravhantering/db-job.env',
          '--volume',
          '/etc/kravhantering/tls/ca.crt:/run/kravhantering/sqlserver-ca.crt:ro',
          'fixture-db-job',
          command,
        ])
      }
    },
  )

  it('gives scheduled cleanup its own login and database credentials', () => {
    const { result, directory } = run(`
      CONFIG_ROOT="$EVIDENCE_DIR"
      cat >"$CONFIG_ROOT/app.env" <<'ENV'
DB_HOST=sqlserver
DB_NAME=fixture
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
DB_USER=web-app
DB_PASSWORD=web-secret
DB_RUNTIME_USER=web-app
DATABASE_URL=mssql://web-app:web-secret@override/fixture
AUTH_OIDC_CLIENT_SECRET=oidc-secret
ENV
      openssl() { printf 'synthetic-key'; }
      as_service() {
        [[ "$1 $2 $3 $4" == 'podman exec -i kravhantering-sqlserver' ]]
        cat >"$CONFIG_ROOT/login.sql"
      }
      sudo() {
        if [[ "$1" == install ]]; then
          shift 5
          install "$@"
        else
          "$@"
        fi
      }
      configure_cleanup_login
    `)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('')
    expect(fs.readFileSync(path.join(directory, 'login.sql'), 'utf8')).toBe(
      "CREATE LOGIN [kravhantering_cleanup] WITH PASSWORD = 'Smoke1!synthetic-key';\nGO\n",
    )
    expect(fs.readFileSync(path.join(directory, 'cleanup.env'), 'utf8')).toBe(
      'DB_HOST=sqlserver\nDB_NAME=fixture\nDB_ENCRYPT=true\n' +
        'DB_TRUST_SERVER_CERTIFICATE=false\n' +
        'DB_USER=kravhantering_cleanup\nDB_PASSWORD=Smoke1!synthetic-key\n',
    )
  })

  it('captures control-character journal messages while redacting configured secrets', () => {
    const { result, directory } = run(String.raw`
      as_service() {
        if [[ "$1" == test ]]; then
          [[ "$2" == -f && "$3" == */cleanup.env ]]
        elif [[ "$1" == cat && "$2" == */cleanup.env ]]; then
          printf 'DB_PASSWORD=synthetic-cleanup-secret\n'
        elif [[ "$1" == cat ]]; then
          printf 'MSSQL_SA_PASSWORD=synthetic-fixture-secret\n'
        elif [[ " $* " == *' --all '* ]]; then
          printf '\rSQL Server certificate loaded; credential synthetic-fixture-secret\n'
          printf 'Cleanup connection used credential synthetic-cleanup-secret\n'
        else
          printf '[80B blob data]\n'
        fi
      }
      collect_redacted_journal
    `)
    expect(result.status, result.stderr).toBe(0)
    expect(
      fs.readFileSync(path.join(directory, 'journal.redacted.txt'), 'utf8'),
    ).toBe(
      '\rSQL Server certificate loaded; credential [redacted]\n' +
        'Cleanup connection used credential [redacted]\n',
    )
  })
})
