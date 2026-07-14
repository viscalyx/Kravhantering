import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAdminBundleCheck } from './check-admin-center-bundle.mjs'
import { runRequirementWorkflowBundleCheck } from './check-requirement-workflow-bundle.mjs'
import { runStewardshipBundleCheck } from './check-stewardship-bundle.mjs'
import { runBundleCli } from './lib/client-bundle-budget.mjs'

export function runClientBundleChecks({
  projectRoot,
  reportOnly = false,
  runAdmin = runAdminBundleCheck,
  runRequirementWorkflow = runRequirementWorkflowBundleCheck,
  runStewardship = runStewardshipBundleCheck,
}) {
  const results = {}
  const failures = []
  const checks = [
    ['admin', runAdmin],
    ['requirementWorkflow', runRequirementWorkflow],
    ['stewardship', runStewardship],
  ]

  for (const [surface, runCheck] of checks) {
    try {
      results[surface] = runCheck({ projectRoot, reportOnly })
    } catch (error) {
      failures.push(error)
    }
  }

  if (failures.length > 0) {
    const messages = failures.map(error =>
      error instanceof Error ? error.message : String(error),
    )
    throw new AggregateError(
      failures,
      `Client bundle checks failed:\n${messages.join('\n')}`,
    )
  }

  return results
}

export function runClientBundleCli({
  argv = process.argv,
  cwd = process.cwd(),
  runChecks = runClientBundleChecks,
} = {}) {
  return runBundleCli({ argv, cwd, runCheck: runChecks })
}

const scriptPath = fileURLToPath(import.meta.url)
/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (resolve(process.argv[1] ?? '') === scriptPath) {
  process.exitCode = runClientBundleCli()
}
