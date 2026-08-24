import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parse } from 'yaml'

const DEPLOYMENT_SELECTORS = [
  '.devcontainer/docker-compose.yml',
  '.devcontainer/elevated/docker-compose.yml',
  'containers/hsa-directory-mock/Dockerfile',
  'containers/hsa-person-lookup-adapter/Dockerfile',
  'scripts/azure-dev/templates/quadlet/krav-hsa-directory-mock.container',
  'scripts/azure-dev/templates/quadlet/krav-hsa-person-lookup-adapter.container',
  'scripts/azure-dev/templates/quadlet/krav-kong.container',
]

const ACTIVE_SELECTORS = [
  'strict-server.mjs',
  'kong.strict.yml',
  'strict-runtime.env',
  'HSA_ADAPTER_INGRESS_CA_PATH',
  'HSA_MOCK_TLS_EXPECTED_CLIENT_SERIAL_NUMBER',
]

const KONG_DEPLOYMENT_PATHS = new Set([
  '.devcontainer/docker-compose.yml',
  '.devcontainer/elevated/docker-compose.yml',
  'scripts/azure-dev/templates/quadlet/krav-kong.container',
])

const EXPECTED_KONG_ENVIRONMENT = {
  KONG_ADMIN_LISTEN: '127.0.0.1:8001',
  KONG_CLIENT_SSL: 'on',
  KONG_CLIENT_SSL_CERT: '/run/kravhantering/hsa-mtls/kong-client.crt',
  KONG_CLIENT_SSL_CERT_KEY: '/run/kravhantering/hsa-mtls/kong-client.key',
  KONG_DATABASE: 'off',
  KONG_DECLARATIVE_CONFIG: '/kong/declarative/kong.strict.yml',
  KONG_NGINX_PROXY_PROXY_SSL_TRUSTED_CERTIFICATE:
    '/run/kravhantering/hsa-mtls/adapter-server-ca.crt',
  KONG_NGINX_PROXY_SSL_CLIENT_CERTIFICATE:
    '/run/kravhantering/hsa-mtls/app-client-ca.crt',
  KONG_NGINX_PROXY_SSL_VERIFY_CLIENT: 'on',
  KONG_PROXY_LISTEN: '0.0.0.0:8443 ssl',
  KONG_SSL_CERT: '/run/kravhantering/hsa-mtls/kong-server.crt',
  KONG_SSL_CERT_KEY: '/run/kravhantering/hsa-mtls/kong-server.key',
  KONG_SSL_PROTOCOLS: 'TLSv1.2 TLSv1.3',
  KONG_TLS_CERTIFICATE_VERIFY: 'on',
}

function invariant(value, message) {
  if (!value) throw new Error(message)
}

function stripSurroundingQuotes(value) {
  const first = value[0]
  if (
    value.length >= 2 &&
    (first === "'" || first === '"') &&
    value.at(-1) === first
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseEnvironment(contents) {
  return Object.fromEntries(
    contents
      .trim()
      .split('\n')
      .map(line => {
        const [name, value = ''] = line.split(/=(.*)/u).slice(0, 2)
        return [name, stripSurroundingQuotes(value)]
      }),
  )
}

function deploymentKongEnvironment(deployment) {
  if (!KONG_DEPLOYMENT_PATHS.has(deployment.path)) return null
  if (deployment.path.endsWith('.yml')) {
    return parse(deployment.contents).services?.kong?.environment ?? {}
  }
  return Object.fromEntries(
    deployment.contents
      .split('\n')
      .filter(line => line.startsWith('Environment='))
      .map(line => {
        const assignment = stripSurroundingQuotes(
          line.slice('Environment='.length),
        )
        const separator = assignment.indexOf('=')
        return [assignment.slice(0, separator), assignment.slice(separator + 1)]
      }),
  )
}

export function validateActiveHsaDeployments(deployments) {
  for (const deployment of deployments) {
    invariant(
      ACTIVE_SELECTORS.some(selector => deployment.contents.includes(selector)),
      `Strict HSA runtime is not selected in ${deployment.path}.`,
    )
    invariant(
      !deployment.contents.includes('HSA_MOCK_AUTH_MODE') &&
        !deployment.contents.includes('NODE_TLS_REJECT_UNAUTHORIZED') &&
        !deployment.contents.includes('hsa-mtls-cert-generator'),
      `Legacy HSA runtime selector remains in ${deployment.path}.`,
    )
    const environment = deploymentKongEnvironment(deployment)
    if (environment) {
      for (const [name, value] of Object.entries(EXPECTED_KONG_ENVIRONMENT)) {
        invariant(
          String(environment[name]) === value,
          `Strict Kong setting ${name} is invalid in ${deployment.path}.`,
        )
      }
    }
  }
  return Object.freeze({ deploymentCount: deployments.length })
}

export function validateStrictKongRuntime({
  authorizationInclude,
  declarativeConfiguration,
  environment,
}) {
  const config = parse(declarativeConfiguration)
  const [service] = config.services ?? []
  const [route] = service?.routes ?? []
  invariant(
    config.services?.length === 1 &&
      service.name === 'hsa-person-lookup-adapter' &&
      service.host === 'hsa-person-lookup-adapter' &&
      service.port === 8443 &&
      service.protocol === 'https' &&
      service.tls_verify === true &&
      service.tls_verify_depth === 1 &&
      service.tls_sans === undefined,
    'Strict Kong Adapter service contract is invalid.',
  )
  invariant(
    service.routes.length === 1 &&
      JSON.stringify(route.protocols) === JSON.stringify(['https']) &&
      JSON.stringify(route.methods) === JSON.stringify(['POST']) &&
      JSON.stringify(route.paths) ===
        JSON.stringify(['/hsa/person-records/lookup']),
    'Strict Kong HTTPS route contract is invalid.',
  )
  const env = parseEnvironment(environment)
  for (const [name, value] of Object.entries(EXPECTED_KONG_ENVIRONMENT)) {
    invariant(env[name] === value, `Strict Kong setting ${name} is invalid.`)
  }
  const authorization = authorizationInclude.match(
    /^if \(\$ssl_client_s_dn != "([^"]+)"\) \{ return 403; \}\s*$/u,
  )
  invariant(
    authorization?.[1] === 'CN=kravhantering-app',
    'Strict Kong App client authorization is invalid.',
  )
  return Object.freeze({
    adapterIdentity: service.host,
    appIdentity: authorization[1],
    routePath: route.paths[0],
  })
}

export async function loadHsaStrictRuntimeContract(root = process.cwd()) {
  const deployments = await Promise.all(
    DEPLOYMENT_SELECTORS.map(async deploymentPath => ({
      contents: await readFile(path.join(root, deploymentPath), 'utf8'),
      path: deploymentPath,
    })),
  )
  const [declarativeConfiguration, environment, authorizationInclude] =
    await Promise.all([
      readFile(path.join(root, 'containers/kong/kong.strict.yml'), 'utf8'),
      readFile(path.join(root, 'containers/kong/strict-runtime.env'), 'utf8'),
      readFile(
        path.join(root, 'containers/kong/strict-app-client-subject.conf'),
        'utf8',
      ),
    ])
  return Object.freeze({
    deployments: validateActiveHsaDeployments(deployments),
    kong: validateStrictKongRuntime({
      authorizationInclude,
      declarativeConfiguration,
      environment,
    }),
  })
}
