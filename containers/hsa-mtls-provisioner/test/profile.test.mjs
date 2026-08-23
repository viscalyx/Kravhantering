import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadCertificateProfile } from '../src/profile.mjs'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const profilePath = path.resolve(
  packageDir,
  '../hsa-mtls/certificate-profile.json',
)

describe('certificate profile', () => {
  it('defines the settled trust and bundle contract', async () => {
    const profile = await loadCertificateProfile(profilePath)

    assert.deepEqual(Object.keys(profile.trustDomains), [
      'app-to-kong',
      'kong-to-adapter',
      'adapter-to-hsa',
    ])
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(profile.trustDomains).map(([name, domain]) => [
          name,
          {
            client: domain.client.authorization,
            server: domain.server.authorization,
            wrongServer: domain.wrongServer.authorization,
          },
        ]),
      ),
      {
        'app-to-kong': {
          client: {
            type: 'subject-rfc2253',
            value: 'CN=kravhantering-app',
          },
          server: {
            allowCommonNameFallback: false,
            allowWildcard: false,
            type: 'dns-san',
            value: 'kong',
          },
          wrongServer: {
            allowCommonNameFallback: false,
            allowWildcard: false,
            type: 'dns-san',
            value: 'kong-wrong',
          },
        },
        'kong-to-adapter': {
          client: {
            type: 'subject-rfc2253',
            value: 'CN=kravhantering-kong',
          },
          server: {
            allowCommonNameFallback: false,
            allowWildcard: false,
            type: 'dns-san',
            value: 'hsa-person-lookup-adapter',
          },
          wrongServer: {
            allowCommonNameFallback: false,
            allowWildcard: false,
            type: 'dns-san',
            value: 'hsa-person-lookup-adapter-wrong',
          },
        },
        'adapter-to-hsa': {
          client: {
            field: 'serialNumber',
            type: 'subject-field',
            value: 'SE5560000000-MOCK001',
          },
          server: {
            allowCommonNameFallback: false,
            allowWildcard: false,
            type: 'dns-san',
            value: 'hsa-directory-mock',
          },
          wrongServer: {
            allowCommonNameFallback: false,
            allowWildcard: false,
            type: 'dns-san',
            value: 'hsa-directory-mock-wrong',
          },
        },
      },
    )
    assert.deepEqual(profile.runtimeBundles.app.files, {
      'app-client.crt': 'app-client-certificate',
      'app-client.key': 'app-client-private-key',
      'kong-server-ca.crt': 'app-to-kong-ca',
    })
    assert.deepEqual(
      Object.values(profile.runtimeBundles).map(bundle => bundle.owner),
      [
        { gid: 1000, uid: 1000 },
        { gid: 1001, uid: 1001 },
        { gid: 1000, uid: 1000 },
        { gid: 1000, uid: 1000 },
        { gid: 1000, uid: 1000 },
      ],
    )
  })

  it('rejects server identity fallbacks and dual-purpose leaves', async () => {
    const raw = JSON.parse(
      await (await import('node:fs/promises')).readFile(profilePath, 'utf8'),
    )
    raw.trustDomains['app-to-kong'].server.dnsSans.push('localhost')

    await assert.rejects(
      loadCertificateProfile(undefined, { rawProfile: raw }),
      error => error.category === 'PROFILE_INVALID',
    )

    raw.trustDomains['app-to-kong'].server.dnsSans = ['kong']
    raw.trustDomains['app-to-kong'].server.extendedKeyUsage.push('clientAuth')
    await assert.rejects(
      loadCertificateProfile(undefined, { rawProfile: raw }),
      error => error.category === 'PROFILE_INVALID',
    )
  })
})
