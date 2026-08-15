export const requirementDetailPrefetchProxySurfaces = [
  'requirements-library:library-requirement',
  'specification-left:library-requirement',
  'specification-left:specification-local-requirement',
  'specification-right:library-requirement',
] as const

export type RequirementDetailPrefetchProxySurface =
  (typeof requirementDetailPrefetchProxySurfaces)[number]

export interface RequirementDetailPrefetchProxySummary {
  classified: number
  duplicateOutcomes: number
  orphanOutcomes: number
  started: number
  unresolved: number
  unused: number
  unusedRate: number | null
  used: number
}

export interface RequirementDetailPrefetchProxySurfaceRun {
  directClickMs: number[]
  directMainRequestCounts: number[]
  intentClickMs: number[]
  intentMainRequestCounts: number[]
  invalidationSafe: boolean
  prefetch: RequirementDetailPrefetchProxySummary
}

export interface RequirementDetailPrefetchProxyRun {
  mode: 'off' | 'on'
  surfaces: Record<
    RequirementDetailPrefetchProxySurface,
    RequirementDetailPrefetchProxySurfaceRun
  >
}

export interface RequirementDetailPrefetchProxySurfaceAssessment {
  baselineEligible: boolean
  baselineP95Ms: number
  completeOutcomes: boolean
  deduplicated: boolean
  directClickPass: boolean
  directNoiseBandMs: number
  directP50DeltaMs: number
  directP95DeltaMs: number
  intentP95Ms: number
  invalidationSafe: boolean
  latencyGainFraction: number
  latencyGainMs: number
  latencyPass: boolean
  pass: boolean
  unusedPass: boolean
  unusedRate: number | null
}

export interface RequirementDetailPrefetchProxyAssessment {
  pass: boolean
  surfaces: Record<
    RequirementDetailPrefetchProxySurface,
    RequirementDetailPrefetchProxySurfaceAssessment
  >
}

export function maximumRequestMultiplicity(paths: string[]): number {
  const counts = new Map<string, number>()
  for (const path of paths) {
    counts.set(path, (counts.get(path) ?? 0) + 1)
  }
  return Math.max(0, ...counts.values())
}

function percentile(values: number[], proportion: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(proportion * sorted.length) - 1)
  return sorted[index]
}

function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const median = percentile(values, 0.5)
  return percentile(
    values.map(value => Math.abs(value - median)),
    0.5,
  )
}

function everyRequestIsDeduplicated(counts: number[]): boolean {
  return counts.length > 0 && counts.every(count => count === 1)
}

function assessSurface(
  off: RequirementDetailPrefetchProxySurfaceRun,
  on: RequirementDetailPrefetchProxySurfaceRun,
): RequirementDetailPrefetchProxySurfaceAssessment {
  const baselineP95Ms = percentile(off.directClickMs, 0.95)
  const intentP95Ms = percentile(on.intentClickMs, 0.95)
  const directOffP50Ms = percentile(off.directClickMs, 0.5)
  const directOffP95Ms = baselineP95Ms
  const directOnP50Ms = percentile(on.directClickMs, 0.5)
  const directOnP95Ms = percentile(on.directClickMs, 0.95)
  const directP50DeltaMs = directOnP50Ms - directOffP50Ms
  const directP95DeltaMs = directOnP95Ms - directOffP95Ms
  const directNoiseBandMs = Math.max(
    25,
    2 *
      Math.max(
        medianAbsoluteDeviation(off.directClickMs),
        medianAbsoluteDeviation(on.directClickMs),
      ),
    directOffP95Ms - directOffP50Ms,
    directOnP95Ms - directOnP50Ms,
  )
  const latencyGainMs = baselineP95Ms - intentP95Ms
  const latencyGainFraction = latencyGainMs / baselineP95Ms
  const completeOutcomes =
    on.prefetch.started > 0 &&
    on.prefetch.classified === on.prefetch.started &&
    on.prefetch.unresolved === 0 &&
    on.prefetch.duplicateOutcomes === 0 &&
    on.prefetch.orphanOutcomes === 0
  const deduplicated =
    everyRequestIsDeduplicated(on.directMainRequestCounts) &&
    everyRequestIsDeduplicated(on.intentMainRequestCounts)
  const directClickPass =
    directP50DeltaMs <= 25 && directP95DeltaMs <= directNoiseBandMs
  const latencyPass = latencyGainMs >= 100 || latencyGainFraction >= 0.5
  const unusedPass =
    on.prefetch.unusedRate !== null && on.prefetch.unusedRate <= 0.25
  const baselineEligible = baselineP95Ms >= 200
  const pass =
    baselineEligible &&
    completeOutcomes &&
    deduplicated &&
    directClickPass &&
    on.invalidationSafe &&
    latencyPass &&
    unusedPass

  return {
    baselineEligible,
    baselineP95Ms,
    completeOutcomes,
    deduplicated,
    directClickPass,
    directNoiseBandMs,
    directP50DeltaMs,
    directP95DeltaMs,
    intentP95Ms,
    invalidationSafe: on.invalidationSafe,
    latencyGainFraction,
    latencyGainMs,
    latencyPass,
    pass,
    unusedPass,
    unusedRate: on.prefetch.unusedRate,
  }
}

export function assessRequirementDetailPrefetchProxy(
  off: RequirementDetailPrefetchProxyRun,
  on: RequirementDetailPrefetchProxyRun,
): RequirementDetailPrefetchProxyAssessment {
  if (off.mode !== 'off' || on.mode !== 'on') {
    throw new Error('Prefetch proxy comparison requires off then on runs')
  }

  const surfaces = Object.fromEntries(
    requirementDetailPrefetchProxySurfaces.map(surface => [
      surface,
      assessSurface(off.surfaces[surface], on.surfaces[surface]),
    ]),
  ) as RequirementDetailPrefetchProxyAssessment['surfaces']

  return {
    pass: Object.values(surfaces).every(surface => surface.pass),
    surfaces,
  }
}
