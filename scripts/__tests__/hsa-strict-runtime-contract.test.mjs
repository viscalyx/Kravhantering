import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import {
  loadHsaStrictRuntimeContract,
  validateDormantHsaDeployments,
  validateStrictKongRuntime,
} from '../hsa-strict-runtime-contract.mjs'

async function kongInputs() {
  const [declarativeConfiguration, environment, authorizationInclude] =
    await Promise.all([
      readFile('containers/kong/kong.strict.yml', 'utf8'),
      readFile('containers/kong/strict-runtime.env', 'utf8'),
      readFile('containers/kong/strict-app-client-subject.conf', 'utf8'),
    ])
  return { authorizationInclude, declarativeConfiguration, environment }
}

describe('dormant strict HSA runtime configuration checker', () => {
  it('validates the dormant deployment and strict Kong contracts', async () => {
    expect(await loadHsaStrictRuntimeContract()).toEqual({
      deployments: { deploymentCount: 8 },
      kong: {
        adapterIdentity: 'hsa-person-lookup-adapter',
        appIdentity: 'CN=kravhantering-app',
        routePath: '/hsa/person-records/lookup',
      },
    })
  })

  it('rejects every dormant selector when a deployment selects it', () => {
    for (const contents of [
      'strict-server.mjs',
      'kong.strict.yml',
      'strict-runtime.env',
      'HSA_ADAPTER_INGRESS_CA_PATH',
      'HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER',
    ]) {
      expect(() =>
        validateDormantHsaDeployments([{ contents, path: 'deployment' }]),
      ).toThrow()
    }
  })

  it('rejects invalid service, route, environment, and client authorization', async () => {
    const valid = await kongInputs()
    for (const input of [
      {
        ...valid,
        declarativeConfiguration: valid.declarativeConfiguration.replace(
          'protocol: https',
          'protocol: http',
        ),
      },
      {
        ...valid,
        declarativeConfiguration: valid.declarativeConfiguration.replace(
          '          - POST',
          '          - GET',
        ),
      },
      {
        ...valid,
        environment: valid.environment.replace(
          'KONG_ADMIN_LISTEN=127.0.0.1:8001',
          'KONG_ADMIN_LISTEN=0.0.0.0:8001',
        ),
      },
      {
        ...valid,
        authorizationInclude:
          'if ($ssl_client_s_dn != "CN=another-app") { return 403; }\n',
      },
    ]) {
      expect(() => validateStrictKongRuntime(input)).toThrow()
    }
  })
})
