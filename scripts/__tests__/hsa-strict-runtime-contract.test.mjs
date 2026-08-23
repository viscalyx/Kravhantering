import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import {
  loadHsaStrictRuntimeContract,
  validateActiveHsaDeployments,
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

describe('active strict HSA runtime configuration checker', () => {
  it('validates the selected deployment and strict Kong contracts', async () => {
    expect(await loadHsaStrictRuntimeContract()).toEqual({
      deployments: { deploymentCount: 7 },
      kong: {
        adapterIdentity: 'hsa-person-lookup-adapter',
        appIdentity: 'CN=kravhantering-app',
        routePath: '/hsa/person-records/lookup',
      },
    })
  })

  it('rejects missing strict activation and every legacy selector', () => {
    for (const contents of [
      'unrelated deployment',
      'strict-server.mjs HSA_MOCK_AUTH_MODE=disabled',
      'kong.strict.yml NODE_TLS_REJECT_UNAUTHORIZED=0',
      'strict-runtime.env hsa-mtls-cert-generator',
    ]) {
      expect(() =>
        validateActiveHsaDeployments([{ contents, path: 'deployment' }]),
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
