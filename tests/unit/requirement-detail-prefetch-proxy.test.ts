import { describe, expect, it } from 'vitest'
import {
  assessRequirementDetailPrefetchProxy,
  maximumRequestMultiplicity,
  type RequirementDetailPrefetchProxyRun,
} from '@/tests/integration/requirement-detail-prefetch-proxy'

const surfaceNames = [
  'requirements-library:library-requirement',
  'specification-left:library-requirement',
  'specification-left:specification-local-requirement',
  'specification-right:library-requirement',
] as const

function run(mode: 'off' | 'on'): RequirementDetailPrefetchProxyRun {
  return {
    mode,
    surfaces: Object.fromEntries(
      surfaceNames.map(surface => [
        surface,
        {
          directClickMs:
            mode === 'off'
              ? [200, 220, 210, 230, 240]
              : [205, 225, 215, 235, 245],
          directMainRequestCounts: [1, 1, 1, 1, 1],
          intentClickMs: mode === 'on' ? [80, 90, 85, 100] : [],
          intentMainRequestCounts: mode === 'on' ? [1, 1, 1, 1] : [],
          invalidationSafe: mode === 'on',
          prefetch: {
            classified: mode === 'on' ? 4 : 0,
            duplicateOutcomes: 0,
            orphanOutcomes: 0,
            started: mode === 'on' ? 4 : 0,
            unresolved: 0,
            unused: mode === 'on' ? 1 : 0,
            unusedRate: mode === 'on' ? 0.25 : null,
            used: mode === 'on' ? 3 : 0,
          },
        },
      ]),
    ) as RequirementDetailPrefetchProxyRun['surfaces'],
  }
}

describe('requirement detail prefetch prodlike proxy', () => {
  it('counts duplicates per canonical main-resource path', () => {
    expect(maximumRequestMultiplicity(['/requirements/1', '/local/2'])).toBe(1)
    expect(
      maximumRequestMultiplicity([
        '/requirements/1',
        '/local/2',
        '/requirements/1',
      ]),
    ).toBe(2)
  })

  it('applies the locked latency, noise, request, invalidation, and outcome rules', () => {
    const off = run('off')
    off.surfaces[
      'specification-left:library-requirement'
    ].directMainRequestCounts = [3, 1, 1, 1, 1]
    const assessment = assessRequirementDetailPrefetchProxy(off, run('on'))

    expect(assessment.pass).toBe(true)
    for (const surface of surfaceNames) {
      expect(assessment.surfaces[surface]).toMatchObject({
        baselineEligible: true,
        completeOutcomes: true,
        deduplicated: true,
        directClickPass: true,
        directNoiseBandMs: 25,
        directP95DeltaMs: 5,
        invalidationSafe: true,
        latencyGainMs: 140,
        latencyPass: true,
        unusedPass: true,
      })
    }
  })

  it('treats an isolated p95 tail as noise but catches a shifted median', () => {
    const off = run('off')
    const on = run('on')
    const surface = 'requirements-library:library-requirement'
    off.surfaces[surface].directClickMs = [100, 100, 100, 100, 100]
    on.surfaces[surface].directClickMs = [100, 100, 100, 100, 140]

    expect(
      assessRequirementDetailPrefetchProxy(off, on).surfaces[surface],
    ).toMatchObject({
      directClickPass: true,
      directNoiseBandMs: 40,
      directP50DeltaMs: 0,
      directP95DeltaMs: 40,
    })

    on.surfaces[surface].directClickMs = [140, 140, 140, 140, 140]
    expect(
      assessRequirementDetailPrefetchProxy(off, on).surfaces[surface]
        .directClickPass,
    ).toBe(false)
  })
})
