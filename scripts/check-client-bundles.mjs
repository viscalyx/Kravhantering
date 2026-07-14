import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAdminBundleCheck } from './check-admin-center-bundle.mjs'
import { runStewardshipBundleCheck } from './check-stewardship-bundle.mjs'

export function runClientBundleChecks({
  projectRoot,
  reportOnly = false,
  runAdmin = runAdminBundleCheck,
  runStewardship = runStewardshipBundleCheck,
}) {
  return {
    admin: runAdmin({ projectRoot, reportOnly }),
    stewardship: runStewardship({ projectRoot, reportOnly }),
  }
}

export function runClientBundleCli({
  argv = process.argv,
  cwd = process.cwd(),
  runChecks = runClientBundleChecks,
} = {}) {
  try {
    runChecks({
      projectRoot: resolve(cwd),
      reportOnly: argv.includes('--report'),
    })
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const scriptPath = fileURLToPath(import.meta.url)
/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (resolve(process.argv[1] ?? '') === scriptPath) {
  process.exitCode = runClientBundleCli()
}
