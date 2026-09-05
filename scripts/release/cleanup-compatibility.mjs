import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCleanupCompatibilityContract } from './cleanup-compatibility-contract.mjs'

export function runCleanupCompatibilityCli(args) {
  const [command, bundle, evidencePath, sourcesPath] = args
  if (command !== 'seal' || !bundle || !evidencePath || args.length > 4)
    throw new Error(
      'Usage: cleanup-compatibility.mjs seal <bundle> <evidence.json> [source-release-locks.json]',
    )
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
  const result = createCleanupCompatibilityContract({
    manifest: read(path.join(bundle, 'DEPLOYMENT-MANIFEST.json')),
    stackLock: read(path.join(bundle, 'container-stack.lock.json')),
    evidence: read(evidencePath),
    sources: sourcesPath ? read(sourcesPath) : [],
  })
  fs.writeFileSync(
    path.join(bundle, 'cleanup-compatibility.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runCleanupCompatibilityCli(process.argv.slice(2))
  } catch {
    console.error('cleanup compatibility contract rejected')
    process.exitCode = 1
  }
}
