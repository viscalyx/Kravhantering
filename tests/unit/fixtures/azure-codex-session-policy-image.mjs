import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import registry from '../../../.github/dependency-maintenance.json' with {
  type: 'json',
}

const baseImage = registry.units.find(
  unit => unit.id === 'ubi-node-runtime',
)?.selectedReference
if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(baseImage ?? '')) {
  throw new Error('The maintained UBI runtime image must be digest-pinned')
}

const dockerfile = `FROM ${baseImage}
USER 0:0
RUN microdnf install -y --setopt=install_weak_deps=0 shadow-utils util-linux && microdnf clean all
ENTRYPOINT []
`
const recipeHash = createHash('sha256').update(dockerfile).digest('hex')
export const policyFixtureImage = `kravhantering/azure-codex-session-policy-fixture:${recipeHash}`

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = spawnSync(
    'docker',
    ['build', '--tag', policyFixtureImage, '-'],
    {
      input: dockerfile,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
