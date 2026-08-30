import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface KongEvidence {
  image: string
  imageId: string
  manifestDigest: string
  probe: string
  results: Record<string, boolean | number | string | string[]>
  schemaVersion: number
  verifiedAt: string
  version: string
}

describe('pinned Kong mTLS capability evidence', () => {
  it('records the strict chain and exact-identity proof for the immutable lock', () => {
    const lock = JSON.parse(
      readFileSync('containers/kong/image.lock.json', 'utf8'),
    ) as {
      image: string
      imageId: string
      manifestDigest: string
      tag: string
    }
    const evidence = JSON.parse(
      readFileSync(
        'containers/kong/pinned-mtls-capability-evidence.json',
        'utf8',
      ),
    ) as KongEvidence
    expect(evidence.schemaVersion).toBe(1)
    expect(evidence.image).toBe(lock.image)
    expect(evidence.imageId).toBe(lock.imageId)
    expect(evidence.manifestDigest).toBe(lock.manifestDigest)
    expect(evidence.version).toBe(lock.tag.split('-', 1)[0])
    expect(evidence.verifiedAt).toMatch(/^20\d{2}-\d{2}-\d{2}$/u)
    expect(evidence.results).toMatchObject({
      adminApiPostConfigStatus: 403,
      adminApiReachability: 'loopback-only',
      downstreamClientChainRequired: true,
      downstreamExactRfc2253SubjectRequired: true,
      generatedUpstreamClientCertificate: true,
      generatedUpstreamServerName: '$upstream_host',
      generatedUpstreamTrustAnchor: true,
      listenerDirectiveInjection: true,
      upstreamClientCertificatePresented: true,
      upstreamServerChainVerified: true,
      upstreamServerDnsIdentityVerified: true,
    })
    expect(evidence.probe).toBe(
      'containers/kong/verify-pinned-mtls-capabilities.mjs',
    )
  })
})
