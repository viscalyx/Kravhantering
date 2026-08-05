import { describe, expect, it, vi } from 'vitest'
import {
  clampLimit,
  clampOffset,
  createServiceMessage,
  getRequirementWord,
  getSpecificationServiceTitle,
  getSpecificationWord,
  getVersionDisplayName,
  localizeName,
  resolveSpecificationIdOrThrow,
  translateServiceMessage,
  withLogging,
} from '@/lib/requirements/service-shared'

describe('requirements service shared utilities', () => {
  it('clamps invalid and out-of-range limits', () => {
    expect(clampLimit()).toBe(20)
    expect(clampLimit(Number.NaN)).toBe(20)
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(250)).toBe(200)
  })

  it('clamps offsets and localizes optional names', () => {
    expect(clampOffset()).toBe(0)
    expect(clampOffset(Number.NaN)).toBe(0)
    expect(clampOffset(-2)).toBe(0)
    expect(clampOffset(4.9)).toBe(4)
    expect(localizeName(null, 'en')).toBeNull()
    expect(localizeName({ nameEn: 'English', nameSv: 'Svenska' }, 'en')).toBe(
      'English',
    )
    expect(localizeName({ nameEn: 'English', nameSv: 'Svenska' }, 'sv')).toBe(
      'Svenska',
    )
    expect(localizeName({ nameEn: null, nameSv: null }, 'sv')).toBeNull()
  })

  it('formats JSON and Markdown service messages', () => {
    expect(createServiceMessage('Title', ['One', 'Two'], 'json')).toBe(
      JSON.stringify({ title: 'Title', lines: ['One', 'Two'] }, null, 2),
    )
    expect(createServiceMessage('Title', ['One', 'Two'], 'markdown')).toBe(
      '## Title\nOne\nTwo',
    )
  })

  it('pluralizes English service words while Swedish remains invariant', () => {
    expect(getRequirementWord('en', 1)).toBe('requirement')
    expect(getRequirementWord('en', 2)).toBe('requirements')
    expect(getRequirementWord('sv', 1)).toBe('krav')
    expect(getSpecificationWord('en', 1)).toBe('specification')
    expect(getSpecificationWord('en', 2)).toBe('specifications')
    expect(getSpecificationWord('sv', 2)).toBe('kravunderlag')
  })

  it.each([
    ['add', 'sv', 'Krav tillagda i kravunderlag'],
    ['items', 'sv', 'Kravtillämpningar'],
    ['list', 'sv', 'Kravunderlag'],
    ['add', 'en', 'Requirements Added to Specification'],
    ['items', 'en', 'Requirement Applications'],
    ['remove', 'en', 'Requirements Removed from Specification'],
    ['list', 'en', 'Requirements specifications'],
  ] as const)('formats %s service titles in %s', (kind, locale, expected) => {
    expect(getSpecificationServiceTitle(kind, locale)).toBe(expected)
  })

  it('validates specification references', async () => {
    await expect(
      resolveSpecificationIdOrThrow({ specificationId: 7 }),
    ).resolves.toBe(7)
    await expect(
      resolveSpecificationIdOrThrow({ specificationId: 0 }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      resolveSpecificationIdOrThrow({ specificationId: 1.5 }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('uses Swedish diacritics in fallback service labels', () => {
    expect(getVersionDisplayName(null, 'sv')).toBe('Okänd')
    expect(getSpecificationServiceTitle('remove', 'sv')).toBe(
      'Krav borttagna från kravunderlag',
    )
  })

  it('formats keyed specification service messages', () => {
    expect(
      translateServiceMessage(
        'sv',
        'requirements.specifications.summary.count',
        {
          count: 2,
          specificationWord: 'kravunderlag',
        },
      ),
    ).toBe('Hittade 2 kravunderlag.')
  })

  it('formats keyed graduation service messages', () => {
    expect(
      translateServiceMessage(
        'en',
        'requirements.specifications.graduate.summary',
        {
          requirementUniqueId: 'SEC0001',
          sourceUniqueId: 'KRAV0001',
          targetAreaName: 'Security',
        },
      ),
    ).toBe(
      'Unique requirement KRAV0001 was copied to SEC0001 as a draft in Security.',
    )
  })

  it('preserves placeholders whose values are omitted', () => {
    expect(
      translateServiceMessage(
        'en',
        'requirements.specifications.summary.count',
        { count: 2 },
      ),
    ).toContain('{specificationWord}')
  })

  it('records capacity metrics for list, page, and token-bearing results', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = { error: vi.fn(), info: vi.fn() }
    const context = {
      actor: { id: 'actor' },
      correlationId: 'corr',
      requestId: 'req',
      source: 'rest',
    } as never

    await expect(
      withLogging(
        logger,
        context,
        'requirements.list',
        { capacity_surface: 'rest' },
        async () => ({ requirements: [{ id: 1 }] }),
      ),
    ).resolves.toEqual({ requirements: [{ id: 1 }] })
    await expect(
      withLogging(
        logger,
        context,
        'requirements.page',
        { capacity_surface: 'editor-preload' },
        async () => ({
          items: [{ id: 1 }, { id: 2 }],
          pagination: { count: 'unknown', hasMore: true, limit: 25 },
          stats: { cost: 0.25, totalTokens: 120 },
        }),
      ),
    ).resolves.toMatchObject({ items: [{ id: 1 }, { id: 2 }] })
    expect(logger.info).toHaveBeenCalledTimes(2)
    consoleInfo.mockRestore()
  })

  it('logs server and unknown failures through the error channel', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = { error: vi.fn(), info: vi.fn() }
    const context = {
      actor: { id: 'actor' },
      correlationId: 'corr',
      requestId: 'req',
      source: 'rest',
    } as never

    await expect(
      withLogging(
        logger,
        context,
        'requirements.fail',
        { capacity_surface: 'mcp' },
        async () => {
          throw new Error('database failed')
        },
      ),
    ).rejects.toThrow('database failed')
    await expect(
      withLogging(logger, context, 'requirements.unknown', {}, async () => {
        throw 'unknown failure'
      }),
    ).rejects.toBe('unknown failure')
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logger.info).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
