import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_SAFETY_RULE_IDS,
  clearAiSafetyRuleSetCacheForTests,
  createAiSafetyRuleTerm,
  deleteCustomAiSafetyRuleTerm,
  getAiSafetyRuleTermById,
  getCachedAiSafetyRuleSet,
  isAiSafetyRuleId,
  isAiSafetyTermDirection,
  isAiSafetyTermType,
  listAiSafetyRulesForAdmin,
  normalizeAiSafetyTerm,
  removeAiSafetyRuleTerms,
  restoreAiSafetyRuleDefaults,
  updateAiSafetyRuleTerm,
} from '@/lib/dal/ai-safety-rules'
import type { SqlServerDatabase, SqlServerEntityManager } from '@/lib/db'

const dalState = vi.hoisted(() => ({
  getAiGenerationSettings: vi.fn(async () => ({
    aiSafetyRuleCacheTtlSeconds: 60,
  })),
}))

vi.mock('@/lib/dal/ai-settings', () => ({
  getAiGenerationSettings: dalState.getAiGenerationSettings,
}))

const ruleRows = AI_SAFETY_RULE_IDS.map((ruleId, index) => ({
  category: index === 0 ? 'encoding' : 'security',
  descriptionEn: `${ruleId} EN`,
  descriptionSv: `${ruleId} SV`,
  id: String(index + 1),
  nameEn: `${ruleId} name EN`,
  nameSv: `${ruleId} name SV`,
  patternKind:
    index === 0
      ? 'direct_markers'
      : index === 1
        ? 'bidirectional_pair'
        : 'paired_terms',
  ruleId,
  sortOrder: String(index + 1),
  windowChars: index === 0 ? null : '1200',
}))

const activeStandardTermRow = {
  direction: 'input',
  id: '11',
  isActive: 1,
  isStandard: 1,
  normalizedTerm: 'ignore previous',
  ruleDatabaseId: '3',
  ruleId: 'instruction_override',
  standardDirection: 'input',
  termText: 'Ignore previous',
  termType: 'action',
}

function databaseWithQueries(
  query: ReturnType<typeof vi.fn>,
  managerQuery: ReturnType<typeof vi.fn> = query,
): SqlServerDatabase {
  const manager = { query: managerQuery } as unknown as SqlServerEntityManager
  return {
    query,
    transaction: vi.fn(async callback => callback(manager)),
  } as unknown as SqlServerDatabase
}

function sequentialQuery(...results: unknown[]): ReturnType<typeof vi.fn> {
  const query = vi.fn()
  for (const result of results) query.mockResolvedValueOnce(result)
  return query
}

describe('AI safety rules DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAiSafetyRuleSetCacheForTests()
    dalState.getAiGenerationSettings.mockResolvedValue({
      aiSafetyRuleCacheTtlSeconds: 60,
    })
  })

  it('recognizes the persisted enum values and normalizes user terms', () => {
    expect(isAiSafetyRuleId('instruction_override')).toBe(true)
    expect(isAiSafetyRuleId('unknown')).toBe(false)
    expect(isAiSafetyTermDirection('input_output')).toBe(true)
    expect(isAiSafetyTermDirection('sideways')).toBe(false)
    expect(isAiSafetyTermType('direct_marker')).toBe(true)
    expect(isAiSafetyTermType('unknown')).toBe(false)
    expect(normalizeAiSafetyTerm('  IGNORE\u00a0  Previous  ')).toBe(
      'ignore previous',
    )
  })

  it('lists every seeded rule, maps terms, and ignores orphaned terms', async () => {
    const orphan = { ...activeStandardTermRow, id: 99, ruleDatabaseId: 99 }
    const db = databaseWithQueries(
      sequentialQuery(ruleRows, [activeStandardTermRow, orphan]),
    )

    const rules = await listAiSafetyRulesForAdmin(db)

    expect(rules).toHaveLength(6)
    expect(rules[0]).toMatchObject({
      id: 1,
      patternKind: 'direct_markers',
      ruleId: 'encoded_smuggling',
      terms: [],
      windowChars: null,
    })
    expect(rules[2]?.terms).toEqual([
      {
        direction: 'input',
        id: 11,
        isActive: true,
        isStandard: true,
        normalizedTerm: 'ignore previous',
        standardDirection: 'input',
        termText: 'Ignore previous',
        termType: 'action',
      },
    ])
  })

  it.each([
    [
      [...ruleRows, { ...ruleRows[0], id: 99, ruleId: 'unknown' }],
      'Unknown AI safety rule id',
    ],
    [
      [{ ...ruleRows[0], patternKind: 'unknown' }, ...ruleRows.slice(1)],
      'Unknown AI safety rule pattern',
    ],
  ])('rejects invalid persisted rule metadata', async (rows, message) => {
    const db = databaseWithQueries(sequentialQuery(rows, []))

    await expect(listAiSafetyRulesForAdmin(db)).rejects.toThrow(message)
  })

  it('rejects an incompletely seeded rule catalogue', async () => {
    const db = databaseWithQueries(sequentialQuery(ruleRows.slice(1), []))

    await expect(listAiSafetyRulesForAdmin(db)).rejects.toThrow(
      'AI safety rules are not fully seeded in the database: encoded_smuggling.',
    )
  })

  it.each([
    ['termType', 'unknown', 'Unknown AI safety term type'],
    ['direction', 'unknown', 'Unknown AI safety term direction'],
    [
      'standardDirection',
      'unknown',
      'Unknown AI safety standard term direction',
    ],
  ])(
    'rejects invalid persisted term metadata in %s',
    async (key, value, message) => {
      const term = { ...activeStandardTermRow, [key]: value }
      const db = databaseWithQueries(sequentialQuery(ruleRows, [term]))

      await expect(listAiSafetyRulesForAdmin(db)).rejects.toThrow(message)
    },
  )

  it('caches only active runtime terms for the configured lifetime', async () => {
    const inactiveTerm = {
      ...activeStandardTermRow,
      id: 12,
      isActive: false,
      termText: 'Inactive',
    }
    const query = sequentialQuery(ruleRows, [
      activeStandardTermRow,
      inactiveTerm,
    ])
    const db = databaseWithQueries(query)

    const first = await getCachedAiSafetyRuleSet(db)
    const second = await getCachedAiSafetyRuleSet(db)

    expect(first).toBe(second)
    expect(first.rules[2]?.terms).toEqual([
      {
        direction: 'input',
        termText: 'Ignore previous',
        termType: 'action',
      },
    ])
    expect(dalState.getAiGenerationSettings).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['', 'term_text_required'],
    ['x'.repeat(256), 'term_text_too_long'],
  ])(
    'rejects invalid new term text before writing',
    async (termText, reason) => {
      const db = databaseWithQueries(vi.fn())

      await expect(
        createAiSafetyRuleTerm(db, {
          direction: 'input',
          ruleId: 'instruction_override',
          termText,
          termType: 'action',
        }),
      ).rejects.toMatchObject({ code: 'validation', details: { reason } })
      expect(db.transaction).not.toHaveBeenCalled()
    },
  )

  it('creates a normalized custom term and returns its persisted shape', async () => {
    const managerQuery = sequentialQuery([{ id: 3 }], [], [{ id: 77 }])
    const dbQuery = sequentialQuery([{ ...activeStandardTermRow, id: 77 }])
    const db = databaseWithQueries(dbQuery, managerQuery)

    const result = await createAiSafetyRuleTerm(db, {
      direction: 'input_output',
      ruleId: 'instruction_override',
      termText: '  Ignore   Previous  ',
      termType: 'action',
    })

    expect(result.id).toBe(77)
    expect(managerQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO [ai_safety_rule_terms]'),
      expect.arrayContaining([
        3,
        'action',
        'Ignore Previous',
        'ignore previous',
        'input_output',
      ]),
    )
  })

  it('rejects a duplicate custom term without inserting', async () => {
    const managerQuery = sequentialQuery([{ id: 3 }], [{ id: 77 }])
    const db = databaseWithQueries(vi.fn(), managerQuery)

    await expect(
      createAiSafetyRuleTerm(db, {
        direction: 'input',
        ruleId: 'instruction_override',
        termText: 'Ignore previous',
        termType: 'action',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'duplicate_term', termId: 77 },
    })
    expect(managerQuery).toHaveBeenCalledTimes(2)
  })

  it('rejects creation when its rule is missing or insert returns no id', async () => {
    const missingRuleDb = databaseWithQueries(vi.fn(), sequentialQuery([]))
    await expect(
      createAiSafetyRuleTerm(missingRuleDb, {
        direction: 'input',
        ruleId: 'instruction_override',
        termText: 'Ignore previous',
        termType: 'action',
      }),
    ).rejects.toMatchObject({ code: 'not_found' })

    const missingIdDb = databaseWithQueries(
      vi.fn(),
      sequentialQuery([{ id: 3 }], [], []),
    )
    await expect(
      createAiSafetyRuleTerm(missingIdDb, {
        direction: 'input',
        ruleId: 'instruction_override',
        termText: 'Ignore previous',
        termType: 'action',
      }),
    ).rejects.toThrow('Created AI safety term id was not returned.')
  })

  it('updates both optional term fields and returns the persisted term', async () => {
    const managerQuery = sequentialQuery([{ id: 11 }], [])
    const db = databaseWithQueries(
      sequentialQuery([activeStandardTermRow]),
      managerQuery,
    )

    await expect(
      updateAiSafetyRuleTerm(db, 11, {
        direction: 'output',
        isActive: false,
      }),
    ).resolves.toMatchObject({ id: 11 })
    expect(managerQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE [ai_safety_rule_terms]'),
      [11, 'output', false, expect.any(String)],
    )
  })

  it.each([
    [12.7, { isActive: false }, 'invalid_term_id'],
    [11, {}, 'empty_update'],
    [11, { direction: 'sideways' }, 'invalid_direction'],
  ])('rejects invalid single-term updates', async (termId, values, reason) => {
    const db = databaseWithQueries(vi.fn())

    await expect(
      updateAiSafetyRuleTerm(db, termId, values as never),
    ).rejects.toMatchObject({ code: 'validation', details: { reason } })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('rejects an update when the term does not exist', async () => {
    const db = databaseWithQueries(vi.fn(), sequentialQuery([]))

    await expect(
      updateAiSafetyRuleTerm(db, 11, { isActive: false }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('deletes custom terms but preserves standard terms', async () => {
    const customTerm = { ...activeStandardTermRow, isStandard: 0 }
    const customDb = databaseWithQueries(
      vi.fn(),
      sequentialQuery([customTerm], []),
    )
    await expect(deleteCustomAiSafetyRuleTerm(customDb, 11)).resolves.toEqual(
      expect.objectContaining({ id: 11, isStandard: false }),
    )

    const standardDb = databaseWithQueries(
      vi.fn(),
      sequentialQuery([activeStandardTermRow]),
    )
    await expect(
      deleteCustomAiSafetyRuleTerm(standardDb, 11),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'standard_term_delete_forbidden' },
    })
  })

  it('rejects invalid or missing terms at the public lookup boundary', async () => {
    const db = databaseWithQueries(sequentialQuery([]))
    await expect(getAiSafetyRuleTermById(db, 999)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(deleteCustomAiSafetyRuleTerm(db, 0)).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_term_id' },
    })
  })

  it('deduplicates ids, deactivates standard terms, and deletes custom terms', async () => {
    const managerQuery = sequentialQuery(
      [
        { id: 11, isStandard: true },
        { id: 12, isStandard: false },
      ],
      [],
      [],
    )
    const db = databaseWithQueries(vi.fn(), managerQuery)

    await expect(removeAiSafetyRuleTerms(db, [11, 12, 11])).resolves.toEqual({
      deactivatedStandardCount: 1,
      deletedCustomCount: 1,
    })
    expect(managerQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE [id] IN (@0, @1)'),
      [11, 12],
    )
  })

  it('rejects invalid or missing batch ids before partial mutation', async () => {
    const invalidDb = databaseWithQueries(vi.fn())
    await expect(removeAiSafetyRuleTerms(invalidDb, [])).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_term_ids' },
    })

    const missingDb = databaseWithQueries(
      vi.fn(),
      sequentialQuery([{ id: 11, isStandard: true }]),
    )
    await expect(
      removeAiSafetyRuleTerms(missingDb, [11, 12]),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { reason: 'term_not_found' },
    })
  })

  it.each([
    [[{ affectedRows: 3 }], 3],
    [{ affected: 2 }, 2],
    [{ unexpected: true }, 0],
  ])(
    'returns the affected standard-term count when restoring defaults',
    async (raw, count) => {
      const db = databaseWithQueries(vi.fn(), sequentialQuery([{ id: 3 }], raw))

      await expect(
        restoreAiSafetyRuleDefaults(db, 'instruction_override'),
      ).resolves.toBe(count)
    },
  )
})
