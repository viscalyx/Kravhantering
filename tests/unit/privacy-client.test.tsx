import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrivacyClient from '@/app/[locale]/privacy/privacy-client'

const fetchMock = vi.fn()
const createObjectURLMock = vi.fn(() => 'blob:self-data-export')
const revokeObjectURLMock = vi.fn()
const anchorClickMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const translationKey = namespace ? `${namespace}.${key}` : key
      if (key === 'exportError') {
        return `${translationKey} ${values?.detail ?? ''}`.trim()
      }
      return translationKey
    },
}))

function exportPayload() {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Ada Admin',
      hsaId: 'SE2321000032-admin1',
      roles: ['Admin'],
      source: 'oidc',
      sub: 'admin-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId: 'SE2321000032-admin1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 1,
    },
  }
}

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

describe('PrivacyClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()
    anchorClickMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    })
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: anchorClickMock,
    })
  })

  it('downloads the signed-in user export without sending a target HSA-ID', async () => {
    fetchMock.mockResolvedValueOnce(okJson(exportPayload()))

    render(
      <PrivacyClient
        currentUser={{
          email: 'ada@example.test',
          hsaId: 'SE2321000032-admin1',
          name: 'Ada Admin',
        }}
      />,
    )

    expect(screen.getByText('Ada Admin')).toBeTruthy()
    expect(screen.getByText('SE2321000032-admin1')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'privacyDataExport.exportJson',
      }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/privacy/data-subject-export',
        expect.objectContaining({
          body: JSON.stringify({ delivery: 'json' }),
          method: 'POST',
        }),
      ),
    )
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:self-data-export')
  })

  it('shows a sign-in action when no current user is available', () => {
    render(<PrivacyClient currentUser={null} />)

    expect(
      screen.getByRole('link', {
        name: 'privacyDataExport.signIn',
      }),
    ).toHaveAttribute('href', '/api/auth/login?returnTo=/sv/privacy')
  })
})
