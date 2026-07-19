import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from '@/app/[locale]/admin/panels/settings-panel'
import {
  APPLICATION_SETTING_CONSTRAINTS,
  DEFAULT_APPLICATION_SETTINGS,
} from '@/lib/application-settings'

const fetchMock = vi.fn()
const translate = vi.hoisted(
  () => (namespace: string) => (key: string) => `${namespace}.${key}`,
)

vi.mock('next-intl', () => ({
  useTranslations: translate,
}))

vi.mock('@/app/[locale]/admin/panels/settings/ai-settings-panel', () => ({
  default: ({ onSettingsSettled }: { onSettingsSettled?: () => void }) => {
    useEffect(() => onSettingsSettled?.(), [onSettingsSettled])
    return <section aria-label="AI settings">AI settings</section>
  },
}))

function settingsResponse() {
  return {
    ...DEFAULT_APPLICATION_SETTINGS,
    constraints: APPLICATION_SETTING_CONSTRAINTS,
    updatedAt: '2026-07-18T12:00:00.000Z',
  }
}

function okJson(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('keeps all sections reserved until parallel settings reads settle', async () => {
    const applicationSettings = deferred<Response>()
    fetchMock.mockReturnValueOnce(applicationSettings.promise)

    render(<SettingsPanel />)

    expect(screen.getByText('admin.applicationSettings.loading')).toBeVisible()
    const aiSettings = screen.getByLabelText('AI settings')
    const settingsSections = aiSettings.closest('[aria-busy]')
    expect(settingsSections).toHaveClass('invisible')
    expect(settingsSections).toHaveClass('mt-6')
    applicationSettings.resolve(okJson(settingsResponse()))

    await waitFor(() => expect(settingsSections).not.toHaveClass('invisible'))
    expect(
      screen.queryByText('admin.applicationSettings.loading'),
    ).not.toBeInTheDocument()
    const headings = screen
      .getAllByRole('heading')
      .map(heading => heading.textContent)
    expect(headings).toEqual([
      'admin.applicationSettings.title',
      'admin.applicationSettings.exports.title',
      'admin.applicationSettings.reports.title',
    ])
    expect(
      screen
        .getByRole('heading', {
          name: 'admin.applicationSettings.exports.title',
        })
        .querySelector('.lucide-download'),
    ).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen
        .getByRole('heading', {
          name: 'admin.applicationSettings.reports.title',
        })
        .querySelector('.lucide-file-text'),
    ).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen
        .getByLabelText(
          'admin.applicationSettings.fields.csvExportMaxRequirements.label',
        )
        .closest('.grid'),
    ).toHaveClass('lg:grid-cols-2')
    expect(
      screen
        .getByLabelText(
          'admin.applicationSettings.fields.pdfReportMaxRequirements.label',
        )
        .closest('.grid'),
    ).toHaveClass('lg:grid-cols-2')
  })

  it('converts MiB to bytes and autosaves one field on blur', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson(settingsResponse()))
      .mockResolvedValueOnce(
        okJson({
          field: 'csvExportMaxFileBytes',
          updatedAt: '2026-07-18T12:01:00.000Z',
          value: 64 * 1024 * 1024,
        }),
      )

    render(<SettingsPanel />)

    const input = await screen.findByLabelText(
      'admin.applicationSettings.fields.csvExportMaxFileBytes.label',
    )
    expect(input).toHaveValue(100)
    fireEvent.change(input, { target: { value: '64' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/application-settings',
        expect.objectContaining({
          body: JSON.stringify({
            csvExportMaxFileBytes: 64 * 1024 * 1024,
          }),
          method: 'PATCH',
        }),
      ),
    )
    expect(await screen.findByText('admin.saved')).toBeVisible()
  })

  it('shows a fixed error section and retries a failed settings read', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('topology must stay hidden'))
      .mockResolvedValueOnce(okJson(settingsResponse()))

    render(<SettingsPanel />)

    const retryButtons = await screen.findAllByRole('button', {
      name: 'common.retry',
    })
    expect(
      screen.getAllByText('admin.applicationSettings.loadError'),
    ).toHaveLength(2)
    fireEvent.click(retryButtons[0])

    await waitFor(() =>
      expect(
        screen.getByLabelText(
          'admin.applicationSettings.fields.csvExportMaxRequirements.label',
        ),
      ).toBeEnabled(),
    )
  })

  it('rejects out-of-range input without sending a PATCH', async () => {
    fetchMock.mockResolvedValueOnce(okJson(settingsResponse()))
    render(<SettingsPanel />)

    const input = await screen.findByLabelText(
      'admin.applicationSettings.fields.csvExportMaxRequirements.label',
    )
    input.focus()
    fireEvent.change(input, { target: { value: '5001' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(
      await screen.findByText('admin.applicationSettings.invalidValue'),
    ).toBeVisible()
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(0)
  })
})
