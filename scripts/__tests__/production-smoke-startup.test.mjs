import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production smoke startup readiness', () => {
  it('enters a private service home only after switching users', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-service-home-'))
    const serviceHome = path.join(root, 'private service home')
    fs.mkdirSync(serviceHome, { mode: 0o700 })
    try {
      const result = spawnSync(
        'bash',
        [
          '-s',
          '--',
          path.resolve('scripts/containers/production-smoke.sh'),
          serviceHome,
        ],
        {
          input: String.raw`
            source "$1"
            SERVICE_HOME="$2"
            SERVICE_USER=fixture-service-user
            service_uid() { printf '12345\n'; }
            cd() {
              if [[ "$1" == "$SERVICE_HOME" ]]; then
                printf 'runner cannot enter private service home\n' >&2
                return 1
              fi
              builtin cd "$@"
            }
            sudo() {
              [[ "$1 $2" == '-u fixture-service-user' ]] || return 1
              shift 2
              "$@"
            }
            as_service bash -c '
              printf "%s\n" "$PWD" "$HOME" "$XDG_RUNTIME_DIR" "$1"
              [[ ! -v CONTAINERS_CONF ]]
              [[ ! -v REGISTRY_AUTH_FILE ]]
            ' service-command 'literal ; $argument'
          `,
          encoding: 'utf8',
          timeout: 10_000,
          env: {
            ...process.env,
            CONTAINERS_CONF: '/runner/containers.conf',
            REGISTRY_AUTH_FILE: '/runner/auth.json',
          },
        },
      )

      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout.trim().split('\n')).toEqual([
        serviceHome,
        serviceHome,
        '/run/user/12345',
        'literal ; $argument',
      ])
      expect(fs.statSync(serviceHome).mode & 0o777).toBe(0o700)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['release', true],
    ['release', false],
    ['core', true],
    ['core', false],
  ])(
    'allows cleanup verification only after full readiness: scope=%s ready=%s',
    (scope, ready) => {
      const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-startup-'))
      try {
        const result = spawnSync(
          'bash',
          ['-s', '--', path.resolve('scripts/containers/production-smoke.sh')],
          {
            input: String.raw`
              source "$1"
              required_env() { :; }
              prepare_service_user() { :; }
              install_archive() { :; }
              jq() { printf '1.0.0\n'; }
              node() { :; }
              render_runtime_configuration() { :; }
              prepare_images() { :; }
              as_service() { :; }
              render_ci_overlay() { :; }
              service_systemctl() { :; }
              assert_generated_quadlet_service() { :; }
              configure_nginx_resolvers() { :; }
              database_job() { :; }
              verify_containment() { printf 'containment-inspected\n' >&2; }
              verify_sqlserver_identity_rejection() { :; }
              wait_for_url() {
                printf 'probe=%s\n' "$1"
                if [[ "$1" == */api/ready ]]; then
                  [[ "$READY" == true ]]
                fi
              }
              sudo() { printf 'fixture_database\n'; }
              sqlserver_query() {
                [[ "$SMOKE_SCOPE" == core ]] && return 0
                printf 'cleanup-verification-started\n' >&2
                exit 0
              }
              up fixture.tar.gz
            `,

            encoding: 'utf8',
            timeout: 10_000,
            env: {
              ...process.env,
              PRODUCTION_SMOKE_EVIDENCE_DIR: evidence,
              DEMO_SEED_IMAGE_REF: 'fixture',
              READY: String(ready),
              PRODUCTION_SMOKE_SCOPE: scope,
            },
          },
        )
        expect(result.error).toBeUndefined()
        expect(result.status, result.stderr).toBe(ready ? 0 : 1)
        expect(result.stdout.trim().split('\n')).toEqual([
          'probe=https://kravhantering.test/api/health',
          'probe=https://kravhantering.test/api/ready',
        ])
        expect(result.stderr).toBe(
          ready
            ? scope === 'core'
              ? 'containment-inspected\n'
              : 'cleanup-verification-started\n'
            : '',
        )
      } finally {
        fs.rmSync(evidence, { recursive: true, force: true })
      }
    },
  )
})
