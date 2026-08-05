import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IdentityPanel from '@/app/[locale]/admin/panels/identity-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
}

function errorJson(message?: string): Response {
  return new Response(JSON.stringify(message ? { error: message } : {}), {
    headers: { 'content-type': 'application/json' },
    status: 400,
    statusText: 'Bad Request',
  })
}

const storedPrefixes = [
  {
    id: 1,
    isDefault: true,
    isUsed: true,
    isVisible: true,
    label: null,
    prefix: 'SE5560000001',
  },
  {
    id: 2,
    isDefault: false,
    isUsed: false,
    isVisible: false,
    label: 'Legacy',
    prefix: 'SE5560000002',
  },
  {
    id: 3,
    isDefault: false,
    isUsed: false,
    isVisible: true,
    label: 'Regional',
    prefix: 'SE5560000003',
  },
]

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('IdentityPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('owns the identity tab panel contract', () => {
    renderAdminPanel(<IdentityPanel />)
    expectAdminPanelContract({ markerValue: 'identity', tabId: 'identity' })
  })

  it('waits for the initial prefix load before showing the empty state', async () => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)

    renderAdminPanel(<IdentityPanel />)

    expect(screen.queryByText('admin.identity.emptyPrefixes')).toBeNull()

    await act(async () => {
      response.resolve(okJson({ prefixes: [] }))
      await response.promise
    })

    expect(
      await screen.findByText('admin.identity.emptyPrefixes'),
    ).toBeVisible()
  })

  it('maps and renders stored prefix controls and usage restrictions', async () => {
    fetchMock.mockResolvedValue(okJson({ prefixes: storedPrefixes }))

    renderAdminPanel(<IdentityPanel />)

    const rows = await screen.findAllByTestId(/hsa-id-prefix-row-/)
    expect(rows).toHaveLength(3)
    expect(
      screen.getAllByRole('textbox', { name: 'admin.identity.prefix' })[0],
    ).toHaveValue('SE5560000001')
    expect(
      screen.getAllByRole('textbox', { name: 'admin.identity.label' })[0],
    ).toHaveValue('')
    expect(
      screen.getAllByRole('button', { name: 'admin.identity.removePrefix' })[0],
    ).toBeDisabled()
    expect(screen.getByText('admin.identity.usedPrefix')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'admin.identity.showPrefix: SE5560000002',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows response and fallback errors when prefix loading fails', async () => {
    fetchMock.mockResolvedValueOnce(errorJson('Prefix lookup failed'))
    const first = renderAdminPanel(<IdentityPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prefix lookup failed',
    )
    first.unmount()

    fetchMock.mockRejectedValueOnce(new Error('network unavailable'))
    renderAdminPanel(<IdentityPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.identity.loadError',
    )
  })

  it('toggles inline and floating help and closes help from keyboard and outside pointer', async () => {
    fetchMock.mockResolvedValue(okJson({ prefixes: storedPrefixes }))
    renderAdminPanel(<IdentityPanel />)
    await screen.findAllByTestId(/hsa-id-prefix-row-/)

    const prefixHelp = screen.getAllByRole('button', {
      name: 'common.help: admin.identity.prefix',
    })[0]
    await userEvent.click(prefixHelp)
    expect(screen.getByText('admin.identity.fieldHelp.prefix')).toBeVisible()
    fireEvent.keyDown(document, { key: 'A' })
    expect(screen.getByText('admin.identity.fieldHelp.prefix')).toBeVisible()
    fireEvent.pointerDown(screen.getByRole('tabpanel'))
    expect(screen.getByText('admin.identity.fieldHelp.prefix')).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByText('admin.identity.fieldHelp.prefix'),
    ).not.toBeInTheDocument()

    const visibleHelp = screen.getAllByRole('button', {
      name: 'common.help: admin.identity.visible',
    })[0]
    await userEvent.click(visibleHelp)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'admin.identity.fieldHelp.visible',
    )
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('adds an initial default prefix and removes unused prefix rows', async () => {
    fetchMock.mockResolvedValue(okJson({ prefixes: [] }))
    renderAdminPanel(<IdentityPanel />)
    await screen.findByText('admin.identity.emptyPrefixes')

    await userEvent.click(
      screen.getByRole('button', { name: 'admin.identity.addPrefix' }),
    )

    const prefixInput = screen.getByRole('textbox', {
      name: 'admin.identity.prefix',
    })
    fireEvent.change(prefixInput, { target: { value: 'se5560000004' } })
    expect(prefixInput).toHaveValue('SE5560000004')
    expect(
      screen.getByRole('radio', {
        name: 'admin.identity.defaultPrefix: SE5560000004',
      }),
    ).toBeChecked()

    await userEvent.click(
      screen.getByRole('button', { name: 'admin.identity.removePrefix' }),
    )
    expect(
      await screen.findByText('admin.identity.emptyPrefixes'),
    ).toBeVisible()
  })

  it('updates labels, visibility, and the selected default through row controls', async () => {
    fetchMock.mockResolvedValue(okJson({ prefixes: storedPrefixes }))
    renderAdminPanel(<IdentityPanel />)
    const rows = await screen.findAllByTestId(/hsa-id-prefix-row-/)

    fireEvent.change(
      within(rows[1]).getByRole('textbox', { name: 'admin.identity.label' }),
      { target: { value: 'Updated legacy' } },
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'admin.identity.showPrefix: SE5560000002',
      }),
    )
    await userEvent.click(
      screen.getByRole('radio', {
        name: 'admin.identity.defaultPrefix: SE5560000002',
      }),
    )

    expect(
      within(rows[1]).getByRole('textbox', { name: 'admin.identity.label' }),
    ).toHaveValue('Updated legacy')
    expect(
      screen.getByRole('button', {
        name: 'admin.identity.hidePrefix: SE5560000002',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('radio', {
        name: 'admin.identity.defaultPrefix: SE5560000002',
      }),
    ).toBeChecked()
  })

  it('hides a visible default prefix when another visible prefix remains', async () => {
    fetchMock.mockResolvedValue(okJson({ prefixes: storedPrefixes }))
    renderAdminPanel(<IdentityPanel />)
    await screen.findAllByTestId(/hsa-id-prefix-row-/)

    await userEvent.click(
      screen.getByRole('button', {
        name: 'admin.identity.hidePrefix: SE5560000001',
      }),
    )

    expect(
      screen.getByRole('button', {
        name: 'admin.identity.showPrefix: SE5560000001',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('radio', {
        name: 'admin.identity.defaultPrefix: SE5560000001',
      }),
    ).not.toBeChecked()
  })

  it.each([
    [
      [{ ...storedPrefixes[0], prefix: 'invalid' }],
      'admin.identity.invalidPrefix',
    ],
    [
      [storedPrefixes[0], { ...storedPrefixes[2], prefix: 'SE5560000001' }],
      'admin.identity.duplicatePrefix',
    ],
    [
      [{ ...storedPrefixes[0], isDefault: false, isVisible: false }],
      'admin.identity.visibleRequired',
    ],
    [
      [{ ...storedPrefixes[0], isDefault: false, isVisible: true }],
      'admin.identity.defaultRequired',
    ],
    [
      [
        { ...storedPrefixes[0], isDefault: true, isVisible: false },
        { ...storedPrefixes[2], isDefault: false, isVisible: true },
      ],
      'admin.identity.defaultMustBeVisible',
    ],
  ])('blocks invalid prefix configuration %#', async (prefixes, error) => {
    fetchMock.mockResolvedValue(okJson({ prefixes }))
    renderAdminPanel(<IdentityPanel />)
    const [label] = await screen.findAllByRole('textbox', {
      name: 'admin.identity.label',
    })
    fireEvent.change(label, { target: { value: 'Dirty configuration' } })

    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('saves normalized prefixes and reports the persisted state', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ prefixes: storedPrefixes }))
      .mockResolvedValueOnce(okJson({ prefixes: storedPrefixes }))
    renderAdminPanel(<IdentityPanel />)
    const labels = await screen.findAllByRole('textbox', {
      name: 'admin.identity.label',
    })
    fireEvent.change(labels[2], { target: { value: '  Regional owner  ' } })

    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('admin.saved')
    const request = fetchMock.mock.calls[1]
    expect(request[0]).toBe('/api/admin/hsa-id-prefixes')
    expect(request[1]).toEqual(expect.objectContaining({ method: 'PUT' }))
    expect(JSON.parse(String(request[1]?.body)).prefixes[2]).toEqual(
      expect.objectContaining({ label: 'Regional owner' }),
    )
  })

  it('shows response and fallback errors when saving fails', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ prefixes: storedPrefixes }))
      .mockResolvedValueOnce(errorJson('Save rejected'))
    const first = renderAdminPanel(<IdentityPanel />)
    const firstLabels = await screen.findAllByRole('textbox', {
      name: 'admin.identity.label',
    })
    fireEvent.change(firstLabels[2], { target: { value: 'Changed' } })
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save rejected')
    first.unmount()

    fetchMock
      .mockResolvedValueOnce(okJson({ prefixes: storedPrefixes }))
      .mockRejectedValueOnce(new Error('network unavailable'))
    renderAdminPanel(<IdentityPanel />)
    const secondLabels = await screen.findAllByRole('textbox', {
      name: 'admin.identity.label',
    })
    fireEvent.change(secondLabels[2], { target: { value: 'Changed again' } })
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.identity.saveError',
    )
  })
})
