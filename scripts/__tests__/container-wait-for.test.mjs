import { describe, expect, it, vi } from 'vitest'
import {
  checkJsonStatus,
  checkNginx,
  checkOidcDiscovery,
  createMasterConnectionString,
  createSqlServerWaitEnv,
  decodeChunkedBody,
  parseArgs,
  waitForCheck,
  waitForSqlServerProbe,
} from '../containers/wait-for.mjs'

describe('container wait helpers', () => {
  it('retries until a check succeeds', async () => {
    let now = 0
    let attempts = 0

    const result = await waitForCheck(
      'test-service',
      async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error(`not yet ${attempts}`)
        }
        return { ok: true }
      },
      {
        intervalMs: 100,
        nowImpl: () => now,
        sleepImpl: async delayMs => {
          now += delayMs
        },
        timeoutMs: 1_000,
      },
    )

    expect(result).toEqual({ ok: true })
    expect(attempts).toBe(3)
  })

  it('reports the last wait failure on timeout', async () => {
    let now = 0

    await expect(
      waitForCheck(
        'test-service',
        async () => {
          throw new Error(`still down at ${now}`)
        },
        {
          intervalMs: 100,
          nowImpl: () => now,
          sleepImpl: async delayMs => {
            now += delayMs
          },
          timeoutMs: 250,
        },
      ),
    ).rejects.toThrow('still down at 200')
  })

  it('accepts any HTTP response for nginx readiness after TLS succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('bad gateway', {
        status: 502,
      }),
    )

    await expect(
      checkNginx('https://kravhantering.test/', { fetchImpl }),
    ).resolves.toEqual({
      status: 502,
      url: 'https://kravhantering.test/',
    })
  })

  it('checks OIDC discovery JSON and app probe statuses', async () => {
    const discoveryFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          issuer: 'https://kravhantering.test/auth/realms/kravhantering-test',
        }),
        { status: 200 },
      ),
    )
    const healthFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))

    await expect(
      checkOidcDiscovery('https://issuer.example/.well-known', {
        fetchImpl: discoveryFetch,
      }),
    ).resolves.toMatchObject({
      issuer: 'https://kravhantering.test/auth/realms/kravhantering-test',
    })
    await expect(
      checkJsonStatus('https://app.example/api/health', 'ok', {
        fetchImpl: healthFetch,
      }),
    ).resolves.toEqual({
      status: 'ok',
      url: 'https://app.example/api/health',
    })
  })

  it('decodes chunked HTTP bodies from raw resolved-host probes', () => {
    expect(decodeChunkedBody('f\r\n{"status":"ok"}\r\n0\r\n\r\n')).toBe(
      '{"status":"ok"}',
    )
  })

  it('rejects unhealthy JSON probes and invalid OIDC metadata', async () => {
    await expect(
      checkJsonStatus('https://app.example/api/ready', 'ready', {
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ status: 'not_ready' })),
          ),
      }),
    ).rejects.toThrow('expected "ready"')

    await expect(
      checkOidcDiscovery('https://issuer.example/.well-known', {
        fetchImpl: vi.fn().mockResolvedValue(new Response('[]')),
      }),
    ).rejects.toThrow('non-object metadata')
  })

  it('builds SQL Server wait configuration for a fresh local stack', async () => {
    expect(
      createSqlServerWaitEnv({
        MSSQL_SA_PASSWORD: 'YourStrong!Passw0rd',
      }),
    ).toMatchObject({
      DB_HOST: '127.0.0.1',
      DB_NAME: 'master',
      DB_PASSWORD: 'YourStrong!Passw0rd',
      DB_TRUST_SERVER_CERTIFICATE: 'true',
      DB_USER: 'sa',
    })
    expect(
      createMasterConnectionString(
        'mssql://sa:secret@127.0.0.1:1433/kravhantering?encrypt=true',
      ),
    ).toBe('mssql://sa:secret@127.0.0.1:1433/master?encrypt=true')
  })

  it('waits for SQL Server through the shared admin health check', async () => {
    const seenConnections = []

    const result = await waitForSqlServerProbe({
      env: {
        MSSQL_SA_PASSWORD: 'YourStrong!Passw0rd',
      },
      healthCheckImpl: async connectionString => {
        seenConnections.push(connectionString)
        return { ok: true }
      },
      timeoutMs: 10,
    })

    expect(result).toEqual({ ok: true })
    expect(seenConnections[0]).toContain('/master?')
    expect(seenConnections[0]).toContain('sa:YourStrong!Passw0rd')
  })

  it('parses wait CLI arguments', () => {
    expect(
      parseArgs([
        'ready',
        '--url',
        'https://example.test/api/ready',
        '--timeout-ms',
        '1000',
        '--interval-ms',
        '50',
        '--resolve-host-to',
        '127.0.0.1',
      ]),
    ).toMatchObject({
      command: 'ready',
      intervalMs: 50,
      resolveHostTo: '127.0.0.1',
      timeoutMs: 1000,
      url: 'https://example.test/api/ready',
    })
    expect(() => parseArgs(['ready', '--timeout-ms', 'nope'])).toThrow(
      'positive integer',
    )
  })
})
