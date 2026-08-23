import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const deploymentSelectors = [
  '.devcontainer/docker-compose.yml',
  '.devcontainer/elevated/docker-compose.yml',
  'containers/hsa-directory-mock/Dockerfile',
  'containers/hsa-person-lookup-adapter/Dockerfile',
  'containers/compose/container-stack.template.yml',
  'scripts/azure-dev/templates/quadlet/krav-hsa-directory-mock.container',
  'scripts/azure-dev/templates/quadlet/krav-hsa-person-lookup-adapter.container',
  'scripts/azure-dev/templates/quadlet/krav-kong.container',
]

describe('dormant strict HSA runtime paths', () => {
  it('leaves every deployed topology on its existing entrypoints', () => {
    const selectedConfiguration = deploymentSelectors
      .map(file => readFileSync(path.join(process.cwd(), file), 'utf8'))
      .join('\n')

    for (const dormantSelector of [
      'strict-server.mjs',
      'kong.strict.yml',
      'strict-runtime.env',
      'HSA_ADAPTER_INGRESS_CA_PATH',
      'HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER',
    ]) {
      expect(selectedConfiguration).not.toContain(dormantSelector)
    }
  })
})
