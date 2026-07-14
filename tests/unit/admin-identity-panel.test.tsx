import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
