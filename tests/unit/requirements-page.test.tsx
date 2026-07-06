import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiRequirementGenerationAvailability } from '@/lib/ai/generation-availability'
import { DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS } from '@/lib/requirements/list-view'

const pageState = vi.hoisted(() => ({
  db: { db: true },
  getAiGenerationAvailability: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getRequirementListColumnDefaults: vi.fn(),
  resolveAiGenerationAvailability: vi.fn(() => ({
    disabledByEnvironment: false,
    effectiveRequirementGenerationEnabled: true,
  })),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: pageState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  formatUiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  getRequirementListColumnDefaults: pageState.getRequirementListColumnDefaults,
}))

vi.mock('@/lib/dal/ai-settings', () => ({
  formatAiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  getAiGenerationAvailability: pageState.getAiGenerationAvailability,
  resolveAiGenerationAvailability: pageState.resolveAiGenerationAvailability,
}))

vi.mock('@/app/[locale]/requirements/requirements-client', () => ({
  default: vi.fn(() => null),
}))

import RequirementsPage from '@/app/[locale]/requirements/page'

interface RequirementsPageElementProps {
  aiGenerationAvailability: AiRequirementGenerationAvailability
  initialColumnDefaults: unknown
}

describe('requirements page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pageState.getRequestSqlServerDataSource.mockResolvedValue(pageState.db)
    pageState.getRequirementListColumnDefaults.mockResolvedValue(
      DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
    )
    pageState.getAiGenerationAvailability.mockResolvedValue({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: true,
    })
  })

  it('keeps AI availability when requirement column defaults fail to load', async () => {
    const disabledAvailability = {
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
    }
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    pageState.getRequirementListColumnDefaults.mockRejectedValueOnce(
      new Error('UI defaults unavailable'),
    )
    pageState.getAiGenerationAvailability.mockResolvedValueOnce(
      disabledAvailability,
    )

    try {
      const page =
        (await RequirementsPage()) as ReactElement<RequirementsPageElementProps>

      expect(page.props.initialColumnDefaults).toEqual(
        DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      )
      expect(page.props.aiGenerationAvailability).toEqual(disabledAvailability)
      expect(pageState.getAiGenerationAvailability).toHaveBeenCalledWith(
        pageState.db,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
