import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// Run after the repository's container:build:db-job and container:build:demo-seed scripts.
describe.skipIf(process.env.KRAVHANTERING_SEED_IMAGE_INTEGRATION !== '1')(
  'packaged seed commands',
  () => {
    it.each(['db-job', 'demo-seed'])(
      'loads all profiles and dispatches optional initialization in %s',
      image => {
        const script = `
      const { loadSeedProfile, main } = await import('./scripts/db-sqlserver-admin.mjs');
      await loadSeedProfile('required');
      await loadSeedProfile('optional');
      await import('./typeorm/default-evolution-v1.mjs');
      ${image === 'demo-seed' ? "await loadSeedProfile('demo');" : ''}
      const code = await main(['seed:optional', '--json'], {
        env: { KRAVHANTERING_DB_ADMIN_IMAGE: '${image}', DATABASE_URL: 'invalid' },
      });
      process.exit(code === 1 ? 0 : 2);
    `
        const stdout = execFileSync(
          'docker',
          [
            'run',
            '--rm',
            '--network=none',
            '--entrypoint=node',
            `localhost/kravhantering/${image}:local`,
            '--input-type=module',
            '-e',
            script,
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
        expect(JSON.parse(stdout)).toMatchObject({
          version: 1,
          operation: 'seed:optional',
          status: 'failed',
          optional: { transaction: 'not_started' },
          error: { code: 'SEED_CONFIGURATION_FAILED' },
        })
      },
    )
    it.each(['db-job', 'demo-seed'])(
      'emits parseable migration failure evidence from %s',
      image => {
        const result = execFileSync(
          'docker',
          [
            'run',
            '--rm',
            '--network=none',
            '--entrypoint=node',
            `localhost/kravhantering/${image}:local`,
            '--input-type=module',
            '-e',
            `const { main } = await import('./scripts/db-sqlserver-admin.mjs');
           const exit = await main(['migrate', '--json'], { env: { DATABASE_URL: 'invalid' } });
           process.exit(exit === 1 ? 0 : 2);`,
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
        expect(JSON.parse(result)).toMatchObject({
          version: 1,
          operation: 'migrate',
          status: 'failed',
          migration: { transaction: 'not_started', applied: [] },
        })
      },
    )
  },
)
