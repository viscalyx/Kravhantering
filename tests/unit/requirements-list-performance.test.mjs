import { describe, expect, it } from 'vitest'
import {
  applyBaselineProfileUpdate,
  buildPerformanceFixtureStatusSql,
  buildReferencePreconditionSql,
  buildSeedPerformanceFixtureSql,
  compareAgainstBaseline,
  createBaselineFromResults,
  createPerformanceFixtureConfig,
  createRequirementListPerformanceScenarios,
  extractExecutionPlanFindings,
  extractShowPlanXmls,
  formatBaselineComparisonTable,
  formatMissingReferenceRows,
  main,
  parseStatisticsIoMessages,
  selectBaselineThresholds,
  summarizeSamples,
} from '../../scripts/requirements-list-performance.mjs'

describe('requirements-list-performance.mjs', () => {
  it('builds a dedicated medium fixture without touching canonical seed rows', () => {
    const config = createPerformanceFixtureConfig({ requirementCount: 12 })
    const scenarios = createRequirementListPerformanceScenarios(config)
    const seedSql = buildSeedPerformanceFixtureSql()

    expect(config.requirementCount).toBe(12)
    expect(config.requirementIdBase).toBeLessThan(0)
    expect(config.versionIdBase).toBeLessThan(0)
    expect(scenarios.map(scenario => scenario.name)).toEqual([
      'default-published',
      'status-sort-review',
      'classification-filters',
      'text-search',
      'join-table-filters',
      'deep-pagination',
      'archived-included',
    ])
    expect(seedSql).toContain('WHERE unique_id LIKE @uniqueIdLike')
    expect(seedSql).toContain("CONCAT(@uniqueIdPrefix, N'-'")
    expect(seedSql).toContain('INSERT INTO requirement_responsibility_people')
    expect(
      seedSql.indexOf('INSERT INTO requirement_responsibility_people'),
    ).toBeLessThan(seedSql.indexOf('INSERT INTO requirement_areas'))
    expect(seedSql).toContain("CONCAT(N'SE5560000001-perf', area.area_index)")
    expect(seedSql).toContain('SET IDENTITY_INSERT requirements ON')
    expect(seedSql).toContain('published_version_number')
    expect(seedSql).not.toContain('WHEN v.version_number = 1 THEN 3')
    expect(seedSql).toContain(
      'Performance fixture generated duplicate Published requirement_versions rows.',
    )
    expect(seedSql).toContain('requirement_version_norm_references')
    expect(buildPerformanceFixtureStatusSql()).toContain(
      'COUNT(*) AS requirementCount',
    )
    expect(buildReferencePreconditionSql()).toContain(
      "N'categoryIds' AS optionKey",
    )
    expect(buildReferencePreconditionSql()).toContain(
      "N'requirementPackageIds' AS optionKey",
    )
  })

  it('parses SQL Server logical reads from STATISTICS IO messages', () => {
    const parsed = parseStatisticsIoMessages([
      "Table 'requirements'. Scan count 1, logical reads 42, physical reads 0",
      "Table 'requirement_versions'. Scan count 3, logical reads 100",
      'SQL Server parse and compile time: CPU time = 0 ms',
    ])

    expect(parsed.logicalReads).toBe(142)
  })

  it('summarizes warm-cache samples with median, p95, and logical reads', () => {
    expect(
      summarizeSamples([
        { durationMs: 20, logicalReads: 200 },
        { durationMs: 10, logicalReads: 100 },
        { durationMs: 50, logicalReads: 300 },
      ]),
    ).toEqual({
      maxDurationMs: 50,
      maxLogicalReads: 300,
      medianDurationMs: 20,
      p95DurationMs: 50,
      sampleCount: 3,
    })
  })

  it('returns safe summary values when no samples were measured', () => {
    expect(summarizeSamples([])).toEqual({
      maxDurationMs: null,
      maxLogicalReads: null,
      medianDurationMs: null,
      p95DurationMs: null,
      sampleCount: 0,
    })
  })

  it('extracts showplan XML and warning findings', () => {
    const result = {
      recordsets: [
        [{ value: 'not a plan' }],
        [
          {
            plan: '<ShowPlanXML><MissingIndexes><MissingIndexGroup Impact="88.4" /></MissingIndexes><SpillToTempDb /></ShowPlanXML>',
          },
        ],
      ],
    }

    const xmls = extractShowPlanXmls(result)
    expect(xmls).toHaveLength(1)
    expect(extractExecutionPlanFindings(xmls)).toEqual({
      hasMissingIndex: true,
      hasSpill: true,
      maxMissingIndexImpact: 88.4,
      showPlanCount: 1,
    })
  })

  it('ignores non-missing-index impact attributes in execution plans', () => {
    expect(
      extractExecutionPlanFindings(
        '<ShowPlanXML><RelOp Impact="99" /><MissingIndexGroup Impact="12.5" /></ShowPlanXML>',
      ),
    ).toEqual({
      hasMissingIndex: true,
      hasSpill: false,
      maxMissingIndexImpact: 12.5,
      showPlanCount: 1,
    })
  })

  it('formats missing fixture reference rows for clear precondition errors', () => {
    expect(
      formatMissingReferenceRows([
        {
          id: 3,
          optionKey: 'requirementPackageIds',
          tableName: 'requirement_packages',
        },
        {
          id: 1,
          optionKey: 'requirementPackageIds',
          tableName: 'requirement_packages',
        },
        {
          id: 23,
          optionKey: 'qualityCharacteristicIds',
          tableName: 'quality_characteristics',
        },
      ]),
    ).toBe(
      'requirementPackageIds (requirement_packages): 1, 3; qualityCharacteristicIds (quality_characteristics): 23',
    )
  })

  it('compares measured results against threshold baselines', () => {
    const results = {
      scenarios: [
        {
          name: 'default-published',
          plan: { hasSpill: false, maxMissingIndexImpact: 10 },
          summary: {
            maxLogicalReads: 300,
            medianDurationMs: 120,
            p95DurationMs: 150,
          },
        },
        {
          name: 'text-search',
          plan: { hasSpill: true, maxMissingIndexImpact: 80 },
          summary: {
            maxLogicalReads: 900,
            medianDurationMs: 400,
            p95DurationMs: 900,
          },
        },
        {
          name: 'deep-pagination',
          plan: { hasSpill: true, maxMissingIndexImpact: 10 },
          summary: {
            maxLogicalReads: 300,
            medianDurationMs: 120,
            p95DurationMs: 150,
          },
        },
      ],
    }
    const baseline = {
      thresholds: {
        'default-published': {
          allowSpills: false,
          maxLogicalReads: 500,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 500,
        },
        'text-search': {
          allowSpills: false,
          maxLogicalReads: 500,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 500,
        },
        'deep-pagination': {
          allowSpills: true,
          maxLogicalReads: 500,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 500,
        },
      },
    }

    const comparison = compareAgainstBaseline(results, baseline)
    expect(comparison.ok).toBe(false)
    expect(comparison.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('text-search: median'),
        expect.stringContaining('text-search: p95'),
        expect.stringContaining('text-search: logical reads'),
        expect.stringContaining('text-search: execution plan contains a spill'),
        expect.stringContaining('text-search: missing-index impact'),
      ]),
    )
    expect(comparison.failures).not.toEqual(
      expect.arrayContaining([expect.stringContaining('deep-pagination')]),
    )
  })

  it('uses the requested threshold profile when comparing and formatting', () => {
    const results = {
      scenarios: [
        {
          name: 'default-published',
          plan: { hasSpill: false, maxMissingIndexImpact: 10 },
          summary: {
            maxLogicalReads: 800,
            medianDurationMs: 120,
            p95DurationMs: 150,
          },
        },
      ],
    }
    const baseline = {
      thresholds: {
        'default-published': {
          allowSpills: false,
          maxLogicalReads: 500,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 500,
        },
      },
      thresholdProfiles: {
        developer: {
          'default-published': {
            allowSpills: false,
            maxLogicalReads: 1000,
            maxMedianDurationMs: 250,
            maxMissingIndexImpact: 75,
            maxP95DurationMs: 500,
          },
        },
      },
    }

    expect(
      compareAgainstBaseline(results, baseline, { profile: 'ci' }).ok,
    ).toBe(false)
    expect(
      compareAgainstBaseline(results, baseline, { profile: 'developer' }).ok,
    ).toBe(true)
    expect(
      selectBaselineThresholds(baseline, { profile: 'developer' }).thresholds[
        'default-published'
      ].maxLogicalReads,
    ).toBe(1000)
    expect(
      formatBaselineComparisonTable(results, baseline, {
        profile: 'developer',
      }),
    ).toContain(
      'Requirement-list performance actuals vs baseline (developer profile):',
    )
  })

  it('updates only the active local threshold profile', () => {
    const generatedBaseline = {
      fixture: { requirementCount: 10_000 },
      generatedAt: '2026-05-09T00:00:00.000Z',
      measurement: { sampleCount: 5, warmupCount: 2 },
      thresholds: {
        'default-published': {
          allowSpills: false,
          maxLogicalReads: 1000,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 500,
        },
      },
    }
    const existingBaseline = {
      fixture: { requirementCount: 10_000 },
      generatedAt: '2026-05-01T00:00:00.000Z',
      measurement: { sampleCount: 5, warmupCount: 2 },
      thresholds: {
        'default-published': {
          allowSpills: false,
          maxLogicalReads: 500,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 500,
        },
      },
      thresholdProfiles: {
        developer: {
          'default-published': {
            allowSpills: false,
            maxLogicalReads: 800,
            maxMedianDurationMs: 250,
            maxMissingIndexImpact: 75,
            maxP95DurationMs: 500,
          },
        },
      },
    }

    const updated = applyBaselineProfileUpdate(
      existingBaseline,
      generatedBaseline,
      'developer',
    )

    expect(updated.thresholds).toEqual(existingBaseline.thresholds)
    expect(
      updated.thresholdProfiles.developer['default-published'].maxLogicalReads,
    ).toBe(1000)
    expect(
      applyBaselineProfileUpdate(existingBaseline, generatedBaseline, 'ci')
        .thresholds['default-published'].maxLogicalReads,
    ).toBe(1000)
  })

  it('creates a baseline with deterministic headroom from results', () => {
    const baseline = createBaselineFromResults(
      {
        fixture: { requirementCount: 10_000 },
        sampleCount: 5,
        scenarios: [
          {
            name: 'default-published',
            plan: { hasSpill: false },
            summary: {
              maxLogicalReads: 100,
              medianDurationMs: 100,
              p95DurationMs: 300,
            },
          },
          {
            name: 'archived-included',
            plan: { hasSpill: true },
            summary: {
              maxLogicalReads: 200,
              medianDurationMs: 200,
              p95DurationMs: 400,
            },
          },
        ],
        warmupCount: 2,
      },
      { generatedAt: '2026-05-09T00:00:00.000Z' },
    )

    expect(baseline).toEqual({
      fixture: { requirementCount: 10_000 },
      generatedAt: '2026-05-09T00:00:00.000Z',
      measurement: { sampleCount: 5, warmupCount: 2 },
      thresholds: {
        'default-published': {
          allowSpills: false,
          maxLogicalReads: 135,
          maxMedianDurationMs: 250,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 750,
        },
        'archived-included': {
          allowSpills: true,
          maxLogicalReads: 270,
          maxMedianDurationMs: 500,
          maxMissingIndexImpact: 75,
          maxP95DurationMs: 1000,
        },
      },
    })
  })

  it('formats actual and baseline values side-by-side for console output', () => {
    const table = formatBaselineComparisonTable(
      {
        scenarios: [
          {
            name: 'default-published',
            plan: { hasSpill: false, maxMissingIndexImpact: 12.5 },
            summary: {
              maxLogicalReads: 1234,
              medianDurationMs: 42.5,
              p95DurationMs: 80,
            },
          },
        ],
      },
      {
        thresholds: {
          'default-published': {
            allowSpills: false,
            maxLogicalReads: 2000,
            maxMedianDurationMs: 250,
            maxMissingIndexImpact: 75,
            maxP95DurationMs: 500,
          },
        },
      },
    )

    expect(table).toContain('Requirement-list performance actuals vs baseline:')
    expect(table).toContain('lower actual values are better')
    expect(table).toContain('spill=no is better')
    expect(table).toContain('Median ms actual/max')
    expect(table).toContain('42.5/250')
    expect(table).toContain('80/500')
    expect(table).toContain('1234/2000')
    expect(table).toContain('no/no')
    expect(table).toContain('12.5/75')
  })

  it('does not mutate a caller-provided environment object', async () => {
    const env = {}
    const errors = []

    await expect(
      main(['not-a-command'], {
        consoleObj: {
          error(message) {
            errors.push(message)
          },
          log() {},
        },
        env,
      }),
    ).resolves.toBe(1)

    expect(errors).toContain(
      'Usage: node scripts/requirements-list-performance.mjs <check|update-baseline>',
    )
    expect(env).not.toHaveProperty('DB_REQUEST_TIMEOUT_MS')
  })
})
