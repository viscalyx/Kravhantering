import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production smoke startup readiness', () => {
  it.each([true, false])(
    'allows cleanup verification only after full readiness: ready=%s',
    ready => {
      const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-startup-'))
      try {
        const result = spawnSync(
          'bash',
          [
            '-c',
            String.raw`
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
              verify_sqlserver_identity_rejection() { :; }
              wait_for_url() {
                printf 'probe=%s\n' "$1"
                if [[ "$1" == */api/ready ]]; then
                  [[ "$READY" == true ]]
                fi
              }
              sudo() { printf 'fixture_database\n'; }
              sqlserver_query() {
                printf 'cleanup-verification-started\n' >&2
                exit 0
              }
              up fixture.tar.gz
            `,
            'bash',
            path.resolve('scripts/containers/production-smoke.sh'),
          ],
          {
            encoding: 'utf8',
            timeout: 10_000,
            env: {
              ...process.env,
              PRODUCTION_SMOKE_EVIDENCE_DIR: evidence,
              DEMO_SEED_IMAGE_REF: 'fixture',
              READY: String(ready),
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
          ready ? 'cleanup-verification-started\n' : '',
        )
      } finally {
        fs.rmSync(evidence, { recursive: true, force: true })
      }
    },
  )
})
