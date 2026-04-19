import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
  getLocalizedUiTerm,
} from '@/lib/ui-terminology'

const getTranslationsMock = vi.fn(async () => (key: string) => key)
const getRequestDatabaseMock = vi.fn()
const getUiTerminologyMock = vi.fn()
const getRequirementListColumnDefaultsMock = vi.fn()

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}))

vi.mock('@/i18n/routing', () => ({
  routing: {
    defaultLocale: 'sv',
    locales: ['sv', 'en'],
  },
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabase: getRequestDatabaseMock,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  formatUiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  getUiTerminology: getUiTerminologyMock,
  getRequirementListColumnDefaults: getRequirementListColumnDefaultsMock,
}))

vi.mock('@/app/[locale]/admin/admin-client', () => ({
  default: function AdminClient() {
    return null
  },
}))

vi.mock('@/app/[locale]/requirements/requirements-client', () => ({
  default: function RequirementsClient() {
    return null
  },
}))

vi.mock(
  '@/app/[locale]/requirements/[id]/versions/[version]/version-detail-client',
  () => ({
    default: function VersionDetailClient() {
      return null
    },
  }),
)

describe('DB-backed UI settings pages', () => {
  beforeEach(() => {
    vi.resetModules()
    getTranslationsMock.mockReset()
    getRequestDatabaseMock.mockReset()
    getUiTerminologyMock.mockReset()
    getRequirementListColumnDefaultsMock.mockReset()
    getTranslationsMock.mockResolvedValue((key: string) => key)
    getRequestDatabaseMock.mockResolvedValue({})
    getUiTerminologyMock.mockResolvedValue(getDefaultUiTerminology())
    getRequirementListColumnDefaultsMock.mockResolvedValue(
      DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
    )
  })

  it('passes database terminology and column defaults to the admin page client', async () => {
    const terminology = getDefaultUiTerminology()
    const columnDefaults = DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS

    getUiTerminologyMock.mockResolvedValueOnce(terminology)
    getRequirementListColumnDefaultsMock.mockResolvedValueOnce(columnDefaults)

    const { default: AdminPage } = await import('@/app/[locale]/admin/page')
    const result = (await AdminPage()) as {
      props: {
        initialColumnDefaults: RequirementListColumnDefault[]
        initialTerminology: ReturnType<typeof buildUiTerminologyPayload>
      }
    }

    expect(result.props.initialTerminology).toEqual(
      buildUiTerminologyPayload(terminology),
    )
    expect(result.props.initialColumnDefaults).toEqual(columnDefaults)
  })

  it('fails the admin page when database-backed UI settings cannot be loaded', async () => {
    getRequestDatabaseMock.mockRejectedValueOnce(new Error('db unavailable'))

    const { default: AdminPage } = await import('@/app/[locale]/admin/page')

    await expect(AdminPage()).rejects.toThrow('db unavailable')
  })

  it('passes database column defaults to the requirements page client', async () => {
    const columnDefaults = DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS
    getRequirementListColumnDefaultsMock.mockResolvedValueOnce(columnDefaults)

    const { default: RequirementsPage } = await import(
      '@/app/[locale]/requirements/page'
    )
    const result = (await RequirementsPage()) as {
      props: {
        initialColumnDefaults: RequirementListColumnDefault[]
      }
    }

    expect(result.props.initialColumnDefaults).toEqual(columnDefaults)
  })

  it('falls back to shipped column defaults when database-backed values cannot be loaded', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    getRequirementListColumnDefaultsMock.mockRejectedValueOnce(
      new Error('column defaults unavailable'),
    )

    try {
      const { default: RequirementsPage } = await import(
        '@/app/[locale]/requirements/page'
      )
      const result = (await RequirementsPage()) as {
        props: {
          initialColumnDefaults: RequirementListColumnDefault[]
        }
      }

      expect(result.props.initialColumnDefaults).toEqual(
        DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load requirement column defaults for requirements page',
        expect.objectContaining({
          message: 'column defaults unavailable',
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('uses database terminology for requirement version metadata', async () => {
    const terminology = getDefaultUiTerminology()
    getUiTerminologyMock.mockResolvedValueOnce(terminology)

    const { generateMetadata } = await import(
      '@/app/[locale]/requirements/[id]/versions/[version]/page'
    )

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: '1', locale: 'en', version: '3' }),
    })

    expect(metadata.title).toBe(
      getLocalizedUiTerm(terminology, 'version', 'en', 'singular'),
    )
  })

  it('fails requirement version metadata generation when database terminology is unavailable', async () => {
    getUiTerminologyMock.mockRejectedValueOnce(
      new Error('terminology unavailable'),
    )

    const { generateMetadata } = await import(
      '@/app/[locale]/requirements/[id]/versions/[version]/page'
    )

    await expect(
      generateMetadata({
        params: Promise.resolve({ id: '1', locale: 'sv', version: '3' }),
      }),
    ).rejects.toThrow('terminology unavailable')
  })
})
