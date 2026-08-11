import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.KRAVHANTERING_NGINX_INTEGRATION === '1'
const nginxImage = 'nginx:1.31.3-alpine'
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

function startLoadBalancedEdge(trustedProxyConfig) {
  const name = `${runId}-lb-${edgeContainers.length}`
  const trustedProxyPath = path.join(
    temporaryDirectory,
    `${name}-trusted-proxies.conf`,
  )
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
    `${trustedProxyPath}:/etc/nginx/snippets/trusted-proxies.conf:ro`,
    nginxImage,
  )
  edgeContainers.push(name)
  return { name, port: publishedPort(name, 8080) }
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
        '    return 204;',
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
})
