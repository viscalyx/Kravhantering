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

  it.each([
    [
      'plaintext upstream service',
      valid => ({
        ...valid,
        declarativeConfiguration: valid.declarativeConfiguration.replace(
          'protocol: https',
          'protocol: http',
        ),
      }),
    ],
    [
      'non-POST route',
      valid => ({
        ...valid,
        declarativeConfiguration: valid.declarativeConfiguration.replace(
          '          - POST',
          '          - GET',
        ),
      }),
    ],
    [
      'disabled upstream TLS verification',
      valid => ({
        ...valid,
        declarativeConfiguration: valid.declarativeConfiguration.replace(
          'tls_verify: true',
          'tls_verify: false',
        ),
      }),
    ],
    [
      'unbounded upstream TLS depth',
      valid => ({
        ...valid,
        declarativeConfiguration: valid.declarativeConfiguration.replace(
          'tls_verify_depth: 1',
          'tls_verify_depth: 0',
        ),
      }),
    ],
    [
      'public Admin API listener',
      valid => ({
        ...valid,
        environment: valid.environment.replace(
          'KONG_ADMIN_LISTEN=127.0.0.1:8001',
          'KONG_ADMIN_LISTEN=0.0.0.0:8001',
        ),
      }),
    ],
    [
      'disabled downstream client verification',
      valid => ({
        ...valid,
        environment: valid.environment.replace(
          'KONG_NGINX_PROXY_SSL_VERIFY_CLIENT=on',
          'KONG_NGINX_PROXY_SSL_VERIFY_CLIENT=off',
        ),
      }),
    ],
    [
      'wrong client authorization subject',
      valid => ({
        ...valid,
        authorizationInclude:
          'if ($ssl_client_s_dn != "CN=another-app") { return 403; }\n',
      }),
    ],
  ])('rejects %s', async (_name, mutate) => {
    const valid = await kongInputs()
    expect(() => validateStrictKongRuntime(mutate(valid))).toThrow()
  })

  it.each([
    ['KONG_DATABASE', 'off', 'postgres'],
    [
      'KONG_DECLARATIVE_CONFIG',
      '/kong/declarative/kong.strict.yml',
      '/tmp/kong.yml',
    ],
    ['KONG_NGINX_PROXY_SSL_VERIFY_CLIENT', 'on', 'off'],
    ['KONG_TLS_CERTIFICATE_VERIFY', 'on', 'off'],
    [
      'KONG_SSL_CERT',
      '/run/kravhantering/hsa-mtls/kong-server.crt',
      '/tmp/kong-server.crt',
    ],
  ])(
    'rejects invalid %s in every Kong deployment',
    async (name, secure, insecure) => {
      for (const deploymentPath of [
        '.devcontainer/docker-compose.yml',
        '.devcontainer/elevated/docker-compose.yml',
        'scripts/azure-dev/templates/quadlet/krav-kong.container',
      ]) {
        const contents = await readFile(deploymentPath, 'utf8')
        const pattern = new RegExp(
          `(${name}(?::\\s*|=))(["']?)${secure.replaceAll('/', '\\/')}\\2`,
          'u',
        )
        const mutated = contents.replace(pattern, `$1$2${insecure}$2`)
        expect(mutated).not.toBe(contents)
        expect(() =>
          validateActiveHsaDeployments([
            { contents: mutated, path: deploymentPath },
          ]),
        ).toThrow()
      }
    },
  )
})
