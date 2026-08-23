import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = process.cwd()

describe('dormant strict Kong runtime contract', () => {
  it('defines one HTTPS-only route and strict canonical Adapter upstream', () => {
    const config = parse(
      readFileSync(path.join(root, 'containers/kong/kong.strict.yml'), 'utf8'),
    )
    const [service] = config.services

    expect(service).toMatchObject({
      host: 'hsa-person-lookup-adapter',
      name: 'hsa-person-lookup-adapter',
      port: 8443,
      protocol: 'https',
      tls_verify: true,
      tls_verify_depth: 1,
    })
    expect(service.routes).toEqual([
      expect.objectContaining({
        methods: ['POST'],
        paths: ['/hsa/person-records/lookup'],
        protocols: ['https'],
      }),
    ])
    expect(service.tls_sans).toBeUndefined()
  })

  it('pins listener-wide peer identities, isolated bundles, and loopback Admin API', () => {
    const env = Object.fromEntries(
      readFileSync(
        path.join(root, 'containers/kong/strict-runtime.env'),
        'utf8',
      )
        .trim()
        .split('\n')
        .map(line => line.split(/=(.*)/u).slice(0, 2)),
    )
    const include = readFileSync(
      path.join(root, 'containers/kong/strict-app-client-subject.conf'),
      'utf8',
    )

    expect(env).toMatchObject({
      KONG_ADMIN_LISTEN: '127.0.0.1:8001',
      KONG_CLIENT_SSL: 'on',
      KONG_CLIENT_SSL_CERT: '/run/kravhantering/hsa-mtls/kong-client.crt',
      KONG_CLIENT_SSL_CERT_KEY: '/run/kravhantering/hsa-mtls/kong-client.key',
      KONG_NGINX_PROXY_PROXY_SSL_TRUSTED_CERTIFICATE:
        '/run/kravhantering/hsa-mtls/adapter-server-ca.crt',
      KONG_NGINX_PROXY_SSL_CLIENT_CERTIFICATE:
        '/run/kravhantering/hsa-mtls/app-client-ca.crt',
      KONG_NGINX_PROXY_SSL_VERIFY_CLIENT: 'on',
      KONG_PROXY_LISTEN: '0.0.0.0:8443 ssl',
      KONG_SSL_CERT: '/run/kravhantering/hsa-mtls/kong-server.crt',
      KONG_SSL_CERT_KEY: '/run/kravhantering/hsa-mtls/kong-server.key',
      KONG_TLS_CERTIFICATE_VERIFY: 'on',
    })
    expect(include).toBe(
      'if ($ssl_client_s_dn != "CN=kravhantering-app") { return 403; }\n',
    )
  })
})
