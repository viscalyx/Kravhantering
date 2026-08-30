import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.KRAVHANTERING_NGINX_INTEGRATION === '1'
const nginxImage = 'nginx:1.31.4-alpine'
const workspace = process.cwd()
const runId = `kh-client-ip-${process.pid}`
const networkName = `${runId}-network`
const upstreamName = `${runId}-upstream`
const temporaryDirectory = path.join(os.tmpdir(), runId)
const edgeContainers = []

function docker(...args) {
  return childProcess.execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

function removeContainer(name) {
  childProcess.spawnSync('docker', ['rm', '--force', name], {
    encoding: 'utf8',
  })
}

function publishedPort(containerName, containerPort) {
  const output = docker('port', containerName, `${containerPort}/tcp`)
  const match = output.match(/127\.0\.0\.1:(\d+)$/u)
  if (!match) throw new Error(`Cannot parse Docker port output: ${output}`)
  return match[1]
}

function requestHeaders(port, protocol, forwardedFor, canonicalIp) {
  return childProcess.execFileSync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--insecure',
      '--retry',
      '10',
      '--retry-all-errors',
      '--retry-delay',
      '0',
      '--dump-header',
      '-',
      '--output',
      '/dev/null',
      '--header',
      `X-Forwarded-For: ${forwardedFor}`,
      '--header',
      `X-Kravhantering-Client-IP: ${canonicalIp}`,
      '--header',
      'Forwarded: for=203.0.113.88;proto=http',
      '--header',
      'Referer: https://attacker.example/?referrer-secret=1',
      `${protocol}://127.0.0.1:${port}/probe?query-secret=1`,
    ],
    { encoding: 'utf8' },
  )
}

function observedClientIp(headers) {
  return headers.match(/^X-Observed-Client-IP:\s*(\S+)/imu)?.[1]
}

function observedForwardedFor(headers) {
  return headers.match(/^X-Observed-Forwarded-For:\s*(\S+)/imu)?.[1]
}

function observedForwarded(headers) {
  return headers.match(/^X-Observed-Forwarded:\s*(\S+)/imu)?.[1]
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function expectRedactedAccessLog(
  containerName,
  expectedClientAddress,
  rawForwardedFor,
) {
  const logs = docker('logs', containerName)
  const probeLines = logs
    .split(/\r?\n/u)
    .filter(line => /"GET \/probe HTTP\/(?:1\.1|2\.0)"/u.test(line))
  expect(probeLines).toHaveLength(1)
  const accessLogLine = probeLines[0]
  expect(accessLogLine).toMatch(
    new RegExp(
      `^${escapeRegularExpression(expectedClientAddress)} - - \\[[^\\]]+\\] ` +
        `"GET \\/probe HTTP\\/(?:1\\.1|2\\.0)" 204 0 "curl\\/[^"\\s]+"` +
        '(?: upstream="[^"\\s]+")?$',
      'u',
    ),
  )
  expect(accessLogLine).not.toContain('query-secret')
  expect(accessLogLine).not.toContain('referrer-secret')
  expect(accessLogLine).not.toContain(`"${rawForwardedFor}"`)
  expect(accessLogLine).not.toContain('203.0.113.77')
  expect(accessLogLine).not.toContain('203.0.113.88')
}

function startLoadBalancedEdge(
  trustedProxyConfig,
  readinessProbeConfig = `allow 127.0.0.1/32;\n`,
) {
  const name = `${runId}-lb-${edgeContainers.length}`
  const readinessProbePath = path.join(
    temporaryDirectory,
    `${name}-readiness-probes.conf`,
  )
  const trustedProxyPath = path.join(
    temporaryDirectory,
    `${name}-trusted-proxies.conf`,
  )
  fs.writeFileSync(readinessProbePath, readinessProbeConfig)
  fs.writeFileSync(trustedProxyPath, trustedProxyConfig)
  docker(
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    networkName,
    '--publish',
    '127.0.0.1::8080',
    '--env',
    'NGINX_RESOLVER=127.0.0.11',
    '--volume',
    `${workspace}/containers/production/nginx/nginx.conf:/etc/nginx/nginx.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/app-node-http.conf.template:/etc/nginx/templates/default.conf.template:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/api-docs-security-headers.conf:/etc/nginx/snippets/api-docs-security-headers.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/generated-output-locations.conf:/etc/nginx/snippets/generated-output-locations.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/readiness-locations.conf:/etc/nginx/snippets/readiness-locations.conf:ro`,
    '--volume',
    `${readinessProbePath}:/etc/nginx/snippets/readiness-probes.conf:ro`,
    '--volume',
    `${trustedProxyPath}:/etc/nginx/snippets/trusted-proxies.conf:ro`,
    nginxImage,
  )
  edgeContainers.push(name)
  return { name, port: publishedPort(name, 8080) }
}

function startTlsEdge(templateName, readinessProbeConfig) {
  const name = `${runId}-tls-${edgeContainers.length}`
  const readinessProbePath = path.join(
    temporaryDirectory,
    `${name}-readiness-probes.conf`,
  )
  fs.writeFileSync(readinessProbePath, readinessProbeConfig)
  docker(
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    networkName,
    '--publish',
    '127.0.0.1::8443',
    '--env',
    'NGINX_RESOLVER=127.0.0.11',
    '--env',
    'NGINX_IDENTITY_RESOLVER=127.0.0.11',
    '--volume',
    `${workspace}/containers/production/nginx/nginx.conf:/etc/nginx/nginx.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/${templateName}:/etc/nginx/templates/default.conf.template:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/api-docs-security-headers.conf:/etc/nginx/snippets/api-docs-security-headers.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/generated-output-locations.conf:/etc/nginx/snippets/generated-output-locations.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/keycloak-proxy-headers.conf:/etc/nginx/snippets/keycloak-proxy-headers.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/keycloak-management-proxy-headers.conf:/etc/nginx/snippets/keycloak-management-proxy-headers.conf:ro`,
    '--volume',
    `${workspace}/containers/production/nginx/templates/readiness-locations.conf:/etc/nginx/snippets/readiness-locations.conf:ro`,
    '--volume',
    `${readinessProbePath}:/etc/nginx/snippets/readiness-probes.conf:ro`,
    '--volume',
    `${workspace}/tmp/container-tls/kravhantering.test.crt:/etc/nginx/tls/fullchain.pem:ro`,
    '--volume',
    `${workspace}/tmp/container-tls/kravhantering.test.key:/etc/nginx/tls/privkey.pem:ro`,
    '--volume',
    `${workspace}/tmp/container-tls/kravhantering.test.crt:/etc/nginx/keycloak-management-tls/fullchain.pem:ro`,
    '--volume',
    `${workspace}/tmp/container-tls/kravhantering.test.key:/etc/nginx/keycloak-management-tls/privkey.pem:ro`,
    '--volume',
    `${workspace}/tmp/container-tls/ca.crt:/etc/nginx/keycloak-management-tls/client-ca.crt:ro`,
    nginxImage,
  )
  edgeContainers.push(name)
  const port = publishedPort(name, 8443)
  childProcess.execFileSync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--insecure',
      '--retry',
      '10',
      '--retry-all-errors',
      '--retry-delay',
      '0',
      `https://127.0.0.1:${port}/probe`,
    ],
    { encoding: 'utf8' },
  )
  return { name, port }
}

function readinessRequest(edge, method, forwardedFor, protocol = 'http') {
  const responseHeadersPath = path.join(
    temporaryDirectory,
    `${edge.name}-${method}-${Date.now()}-${Math.random()}.headers`,
  )
  const responseBodyPath = `${responseHeadersPath}.body`
  const args = [
    '--silent',
    '--show-error',
    '--insecure',
    '--dump-header',
    responseHeadersPath,
    '--output',
    responseBodyPath,
    '--header',
    `X-Forwarded-For: ${forwardedFor}`,
  ]
  if (method === 'HEAD') args.push('--head')
  else if (method !== 'GET') args.push('--request', method)
  args.push(`${protocol}://127.0.0.1:${edge.port}/api/ready`)
  childProcess.execFileSync('curl', args, { encoding: 'utf8' })

  const headers = fs.readFileSync(responseHeadersPath, 'utf8')
  const body =
    method === 'HEAD' ? '' : fs.readFileSync(responseBodyPath, 'utf8')
  const status = Number(
    Array.from(headers.matchAll(/^HTTP\/\S+\s+(\d{3})/gimu)).at(-1)?.[1],
  )
  return { body, headers, status }
}

function upstreamReadinessRequests() {
  return docker('logs', upstreamName)
    .split(/\r?\n/u)
    .filter(line => /"(?:GET|HEAD) \/api\/ready /u.test(line))
}

describe.runIf(enabled)('nginx trusted client-IP boundary', () => {
  let gateway

  beforeAll(() => {
    fs.mkdirSync(temporaryDirectory, { recursive: true })
    const upstreamConfigPath = path.join(
      temporaryDirectory,
      'upstream-nginx.conf',
    )
    fs.writeFileSync(
      upstreamConfigPath,
      [
        'events {}',
        'http {',
        '  server {',
        '    listen 3000;',
        '    add_header X-Observed-Client-IP $http_x_kravhantering_client_ip always;',
        '    add_header X-Observed-Forwarded-For $http_x_forwarded_for always;',
        '    add_header X-Observed-Forwarded $http_forwarded always;',
        '    location = /api/ready {',
        '      default_type application/json;',
        '      add_header X-Upstream-Readiness true always;',
        '      return 200 \'{"status":"ready"}\';',
        '    }',
        '    location / { return 204; }',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    docker('network', 'create', networkName)
    gateway = docker(
      'network',
      'inspect',
      networkName,
      '--format',
      '{{(index .IPAM.Config 0).Gateway}}',
    )
    docker(
      'run',
      '--detach',
      '--name',
      upstreamName,
      '--network',
      networkName,
      '--network-alias',
      'app-runtime',
      '--network-alias',
      'keycloak',
      '--volume',
      `${upstreamConfigPath}:/etc/nginx/nginx.conf:ro`,
      nginxImage,
    )
  })

  afterAll(() => {
    for (const name of edgeContainers) removeContainer(name)
    removeContainer(upstreamName)
    childProcess.spawnSync('docker', ['network', 'rm', networkName], {
      encoding: 'utf8',
    })
    fs.rmSync(temporaryDirectory, { force: true, recursive: true })
  })

  it('direct ingress overwrites spoofed forwarding evidence with its peer', () => {
    const name = `${runId}-direct`
    docker(
      'run',
      '--detach',
      '--name',
      name,
      '--network',
      networkName,
      '--publish',
      '127.0.0.1::443',
      '--volume',
      `${workspace}/containers/nginx/nginx.conf:/etc/nginx/nginx.conf:ro`,
      '--volume',
      `${workspace}/containers/nginx/conf.d/kravhantering.test.conf:/etc/nginx/conf.d/default.conf:ro`,
      '--volume',
      `${workspace}/containers/production/nginx/templates/api-docs-security-headers.conf:/etc/nginx/snippets/api-docs-security-headers.conf:ro`,
      '--volume',
      `${workspace}/containers/production/nginx/templates/readiness-locations.conf:/etc/nginx/snippets/readiness-locations.conf:ro`,
      '--volume',
      `${workspace}/containers/nginx/readiness-probes.conf:/etc/nginx/snippets/readiness-probes.conf:ro`,
      '--volume',
      `${workspace}/tmp/container-tls/kravhantering.test.crt:/etc/nginx/tls/kravhantering.test.crt:ro`,
      '--volume',
      `${workspace}/tmp/container-tls/kravhantering.test.key:/etc/nginx/tls/kravhantering.test.key:ro`,
      nginxImage,
    )
    edgeContainers.push(name)

    const forwardedFor = '203.0.113.66, 198.51.100.8'
    const headers = requestHeaders(
      publishedPort(name, 443),
      'https',
      forwardedFor,
      '203.0.113.77',
    )

    expect(observedClientIp(headers)).toBe(gateway)
    expect(observedForwardedFor(headers)).toBe(gateway)
    expect(observedForwarded(headers)).toBeUndefined()
    expectRedactedAccessLog(name, gateway, forwardedFor)
  })

  it.each([
    {
      forwardedFor: '198.51.100.8',
      name: 'one trusted proxy',
      additionalTrust: '',
      expected: '198.51.100.8',
    },
    {
      forwardedFor: '198.51.100.8, 10.20.0.5',
      name: 'multiple trusted proxies',
      additionalTrust: 'set_real_ip_from 10.20.0.0/16;\n',
      expected: '198.51.100.8',
    },
    {
      forwardedFor: '203.0.113.66, 192.0.2.5',
      name: 'an untrusted intermediary with a prepended spoof',
      additionalTrust: '',
      expected: '192.0.2.5',
    },
  ])('resolves $name from the configured boundary', scenario => {
    const edge = startLoadBalancedEdge(
      `set_real_ip_from ${gateway}/32;\n${scenario.additionalTrust}`,
    )
    const headers = requestHeaders(
      edge.port,
      'http',
      scenario.forwardedFor,
      '203.0.113.77',
    )

    expect(observedClientIp(headers)).toBe(scenario.expected)
    expect(observedForwardedFor(headers)).toBe(scenario.expected)
    expect(observedForwarded(headers)).toBeUndefined()
    expectRedactedAccessLog(edge.name, scenario.expected, scenario.forwardedFor)
  })

  it('does not promote a malformed forwarded chain to the canonical header', () => {
    const edge = startLoadBalancedEdge(`set_real_ip_from ${gateway}/32;\n`)
    const headers = requestHeaders(
      edge.port,
      'http',
      '203.0.113.66, not-an-ip',
      '203.0.113.77',
    )

    expect(observedClientIp(headers)).toBe(gateway)
    expect(observedForwardedFor(headers)).toBe(gateway)
    expect(observedForwarded(headers)).toBeUndefined()
    expectRedactedAccessLog(edge.name, gateway, '203.0.113.66, not-an-ip')
  })

  it('enforces IPv4 and IPv6 probe boundaries before methods and upstream work', () => {
    const edge = startLoadBalancedEdge(
      `set_real_ip_from ${gateway}/32;\n`,
      'allow 198.51.100.8/32;\nallow 2001:db8::10/128;\n',
    )
    const upstreamBefore = upstreamReadinessRequests().length

    for (const method of [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ]) {
      const denied = readinessRequest(edge, method, '203.0.113.50')
      expect(denied.status).toBe(403)
      expect(denied.body).toBe('')
      expect(denied.headers).toMatch(/^Cache-Control:\s*no-store\s*$/imu)
      expect(denied.headers).not.toMatch(/^WWW-Authenticate:/imu)
    }
    expect(upstreamReadinessRequests()).toHaveLength(upstreamBefore)

    for (const allowedAddress of ['198.51.100.8', '2001:db8::10']) {
      const get = readinessRequest(edge, 'GET', allowedAddress)
      expect(get.status).toBe(200)
      expect(get.body).toBe('{"status":"ready"}')
      expect(get.headers).toMatch(/^X-Upstream-Readiness:\s*true\s*$/imu)
      expect(get.headers).toMatch(/^Cache-Control:\s*no-store\s*$/imu)

      const head = readinessRequest(edge, 'HEAD', allowedAddress)
      expect(head.status).toBe(200)
      expect(head.body).toBe('')
      expect(head.headers).toMatch(/^X-Upstream-Readiness:\s*true\s*$/imu)
    }

    const beforeMethodRejection = upstreamReadinessRequests().length
    const rejectedMethod = readinessRequest(edge, 'POST', '198.51.100.8')
    expect(rejectedMethod.status).toBe(405)
    expect(rejectedMethod.body).toBe('')
    expect(rejectedMethod.headers).toMatch(/^Allow:\s*GET, HEAD\s*$/imu)
    expect(upstreamReadinessRequests()).toHaveLength(beforeMethodRejection)
  })

  it('rate-limits by canonical client before upstream readiness work', () => {
    const allowedAddress = '198.51.100.27'
    const edge = startLoadBalancedEdge(
      `set_real_ip_from ${gateway}/32;\n`,
      `allow ${allowedAddress}/32;\n`,
    )
    const upstreamBefore = upstreamReadinessRequests().length
    const responses = Array.from({ length: 8 }, () =>
      readinessRequest(edge, 'GET', allowedAddress),
    )
    const limited = responses.filter(response => response.status === 503)

    expect(limited.length).toBeGreaterThan(0)
    for (const response of limited) {
      expect(response.body).toBe('{"status":"not_ready"}')
      expect(response.headers).toMatch(/^Retry-After:\s*1\s*$/imu)
      expect(response.headers).toMatch(/^Cache-Control:\s*no-store\s*$/imu)
      expect(response.headers).not.toMatch(/^X-Upstream-Readiness:/imu)
    }
    expect(upstreamReadinessRequests().length - upstreamBefore).toBe(
      responses.length - limited.length,
    )
  })

  it.each([
    'app-node-tls.conf.template',
    'single-node-tls.conf.template',
    'single-node-external-oidc-tls.conf.template',
    'single-node-hardened-keycloak-tls.conf.template',
  ])('enforces readiness through shipped TLS template %s', templateName => {
    const edge = startTlsEdge(templateName, `allow ${gateway}/32;\n`)

    const allowed = readinessRequest(edge, 'GET', gateway, 'https')
    expect(allowed).toMatchObject({
      body: '{"status":"ready"}',
      status: 200,
    })
    expect(allowed.headers).toMatch(/^Cache-Control:\s*no-store\s*$/imu)

    const rejectedMethod = readinessRequest(edge, 'POST', gateway, 'https')
    expect(rejectedMethod).toMatchObject({ body: '', status: 405 })
    expect(rejectedMethod.headers).toMatch(/^Allow:\s*GET, HEAD\s*$/imu)
  })
})
