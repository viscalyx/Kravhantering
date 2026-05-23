import type { FullConfig } from '@playwright/test'
import {
  findMissingRoleFiles as findMissingRoleFilesForRoles,
  getPlaywrightBaseUrl,
  loginAndSaveStorageState,
  type RoleSpec,
} from '@/tests/support/playwright-auth'

export type { RoleSpec } from '@/tests/support/playwright-auth'

/**
 * Default Playwright role used by integration specs that do not opt into a
 * different role explicitly. See `tests/integration/auth-storage.ts` for the
 * role -> storageState mapping.
 */
export const DEFAULT_INTEGRATION_ROLE = 'admin'

export const ROLES: ReadonlyArray<RoleSpec> = [
  {
    role: 'admin',
    username: 'ada.admin',
    password: 'devpass',
    filePath: 'test-results/auth/admin.json',
  },
  {
    role: 'admin-only',
    username: 'only.admin',
    password: 'devpass',
    filePath: 'test-results/auth/admin-only.json',
  },
  {
    role: 'reviewer',
    username: 'rita.reviewer',
    password: 'devpass',
    filePath: 'test-results/auth/reviewer.json',
  },
]

/**
 * Returns the file paths from `roles` whose pinned storage-state JSON does
 * not exist on disk. Exported so unit tests can verify the
 * `PLAYWRIGHT_SKIP_WEBSERVER` pre-flight without touching real files.
 *
 * @param roles role list whose `filePath` entries to probe.
 * @param fileExists existence-check function (defaults to `fs.existsSync`);
 *   the seam exists only so tests can stub the filesystem.
 */
export function findMissingRoleFiles(
  roles: ReadonlyArray<RoleSpec> = ROLES,
  fileExists?: (path: string) => boolean,
): string[] {
  return findMissingRoleFilesForRoles(roles, fileExists)
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_AUTH_SETUP) {
    console.warn(
      '[playwright global-setup] PLAYWRIGHT_SKIP_AUTH_SETUP is set; not seeding storageState. Specs that require auth will fail.',
    )
    return
  }

  // When `PLAYWRIGHT_SKIP_WEBSERVER` is set, Playwright will not boot a
  // web server and the contributor is expected to point the suite at an
  // already-running app (or to reuse cached cookies from a previous run).
  // Driving a real Keycloak login here would either succeed against a
  // foreign IdP/app the contributor did not intend or fail with an opaque
  // ECONNREFUSED. Reuse the pinned storage-state files when they all
  // exist; otherwise fail fast with an actionable message.
  //
  // CI flows that intentionally start their own server (e.g. the
  // `test-prodlike-pruned` job, which boots `start:prodlike-pruned` after
  // `npm prune --omit=dev`) can opt into seeding against that running
  // server by also setting `PLAYWRIGHT_FORCE_AUTH_SETUP=1`. The seed
  // then runs against `PLAYWRIGHT_BASE_URL` instead of bailing out.
  if (process.env.PLAYWRIGHT_SKIP_WEBSERVER) {
    if (process.env.PLAYWRIGHT_FORCE_AUTH_SETUP) {
      console.info(
        '[playwright global-setup] PLAYWRIGHT_SKIP_WEBSERVER is set and PLAYWRIGHT_FORCE_AUTH_SETUP is set — seeding storageState against the externally-managed server.',
      )
    } else {
      const missing = findMissingRoleFiles()
      if (missing.length === 0) {
        console.info(
          '[playwright global-setup] PLAYWRIGHT_SKIP_WEBSERVER is set and all role storageStates already exist — reusing cached cookies; skipping Keycloak login.',
        )
        return
      }
      throw new Error(
        `[playwright global-setup] PLAYWRIGHT_SKIP_WEBSERVER is set but the following pinned storageState file(s) are missing: ${missing.join(', ')}. Bring up the local IdP (\`npm run idp:up\`) and the app (\`npm run dev\` or \`npm run start:prodlike\`), then run Playwright once without PLAYWRIGHT_SKIP_WEBSERVER so global-setup can seed them — or run the suite normally.`,
      )
    }
  }

  const baseUrl = getPlaywrightBaseUrl(config, 'http://localhost:3000')
  for (const spec of ROLES) {
    try {
      await loginAndSaveStorageState(baseUrl, spec, {
        ignoreHTTPSErrors: true,
      })
      console.info(
        `[playwright global-setup] Stored ${spec.role} session at ${spec.filePath}`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Failed to obtain ${spec.role} storageState via Keycloak. Make sure the IdP is running (\`npm run idp:up\`) and the dev server is reachable at ${baseUrl}. Original error: ${message}`,
      )
    }
  }
}
