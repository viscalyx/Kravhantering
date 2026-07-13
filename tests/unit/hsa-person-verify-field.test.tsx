import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HsaPersonVerifyField from '@/components/HsaPersonVerifyField'

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(resolver => {
    resolve = resolver
  })
  return { promise, resolve }
}

function ControlledHsaPersonVerifyField() {
  const [hsaId, setHsaId] = useState('SE5560000001-old1')
  return (
    <HsaPersonVerifyField
      emailLabel="Email"
      errorFallback="Could not verify"
      fetchingLabel="Fetching"
      fetchLabel="Fetch"
      hsaId={hsaId}
      inputClassName="input"
      inputId="hsa-id"
      nameLabel="Name"
      onHsaIdChange={setHsaId}
      purpose="requirement_package_co_author"
      unavailableText="Unavailable"
    />
  )
}

describe('HsaPersonVerifyField', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render stale verification errors after the HSA-id changes', async () => {
    const request = deferredResponse()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              prefixes: [
                {
                  id: 1,
                  isDefault: true,
                  label: null,
                  prefix: 'SE5560000001',
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        )
      }
      return request.promise
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ControlledHsaPersonVerifyField />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/hsa-id-prefixes')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fetching' })).toBeDisabled()
    })

    const hsaIdInput = container.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    fireEvent.change(hsaIdInput as HTMLInputElement, {
      target: { value: 'new1' },
    })

    await act(async () => {
      request.resolve(
        new Response(JSON.stringify({ error: 'Old request failed' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        }),
      )
      await request.promise
    })

    expect(screen.queryByText('Could not verify')).not.toBeInTheDocument()
    expect(screen.queryByText('Old request failed')).not.toBeInTheDocument()
  })

  it('composes selected prefix and suffix before verification', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              prefixes: [
                {
                  id: 1,
                  isDefault: false,
                  label: 'One',
                  prefix: 'SE5560000001',
                },
                {
                  id: 2,
                  isDefault: true,
                  label: 'Two',
                  prefix: 'NO5560000001',
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        )
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              person: {
                displayName: 'Nora New',
                email: null,
                givenName: 'Nora',
                hsaId: 'SE5560000001-new1',
                middleName: null,
                surname: 'New',
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        )
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const onHsaIdChange = vi.fn()

    function StatefulHsaPersonVerifyField() {
      const [hsaId, setHsaId] = useState('')
      return (
        <HsaPersonVerifyField
          emailLabel="Email"
          errorFallback="Could not verify"
          fetchingLabel="Fetching"
          fetchLabel="Fetch"
          hsaId={hsaId}
          inputClassName="input"
          inputId="hsa-id"
          nameLabel="Name"
          onHsaIdChange={value => {
            onHsaIdChange(value)
            setHsaId(value)
          }}
          purpose="requirement_package_co_author"
          unavailableText="Unavailable"
        />
      )
    }

    render(<StatefulHsaPersonVerifyField />)

    const prefixSelect = await screen.findByRole('combobox', {
      name: 'common.hsaPrefixLabel',
    })
    await waitFor(() => {
      expect(prefixSelect).toHaveValue('NO5560000001')
    })

    fireEvent.change(prefixSelect, { target: { value: 'SE5560000001' } })
    await waitFor(() => {
      expect(prefixSelect).toHaveValue('SE5560000001')
    })
    const hsaIdInput = document.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    fireEvent.change(hsaIdInput as Element, { target: { value: 'new1' } })

    expect(onHsaIdChange).toHaveBeenLastCalledWith('SE5560000001-new1')
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))

    await waitFor(() => {
      const verifyCall = fetchMock.mock.calls.find(
        ([url]) => url === '/api/requirement-responsibility-people/verify',
      )
      expect(verifyCall).toBeTruthy()
      expect(
        JSON.parse(
          (verifyCall?.[1] as RequestInit | undefined)?.body as string,
        ),
      ).toEqual(expect.objectContaining({ hsaId: 'SE5560000001-new1' }))
    })
  })

  it('refreshes person details when tabbing from the suffix field', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              prefixes: [
                {
                  id: 1,
                  isDefault: true,
                  label: null,
                  prefix: 'SE5560000001',
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        )
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              person: {
                displayName: 'Nora New',
                email: 'nora.new@example.test',
                givenName: 'Nora',
                hsaId: 'SE5560000001-new1',
                middleName: null,
                surname: 'New',
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        )
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    function StatefulHsaPersonVerifyField() {
      const [hsaId, setHsaId] = useState('')
      return (
        <HsaPersonVerifyField
          emailLabel="Email"
          errorFallback="Could not verify"
          fetchingLabel="Fetching"
          fetchLabel="Fetch"
          hsaId={hsaId}
          inputClassName="input"
          inputId="hsa-id"
          nameLabel="Name"
          onHsaIdChange={setHsaId}
          purpose="requirement_package_lead"
          showPersonSummaryAsText
          unavailableText="Unavailable"
        />
      )
    }

    render(<StatefulHsaPersonVerifyField />)

    await screen.findByRole('combobox', {
      name: 'common.hsaPrefixLabel',
    })
    const hsaIdInput = document.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    const fetchButton = screen.getByRole('button', { name: 'Fetch' })
    fireEvent.change(hsaIdInput as Element, { target: { value: 'new1' } })
    fireEvent.blur(hsaIdInput as Element, { relatedTarget: fetchButton })

    await waitFor(() => {
      const verifyCall = fetchMock.mock.calls.find(
        ([url]) => url === '/api/requirement-responsibility-people/verify',
      )
      expect(verifyCall).toBeTruthy()
      expect(
        JSON.parse(
          (verifyCall?.[1] as RequestInit | undefined)?.body as string,
        ),
      ).toEqual(
        expect.objectContaining({
          hsaId: 'SE5560000001-new1',
          mode: 'refresh',
        }),
      )
      expect(
        screen.getByText('Nora New (nora.new@example.test)'),
      ).toBeInTheDocument()
    })
  })

  it('locks suffix entry when no visible prefix exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ prefixes: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
      ),
    )

    render(
      <HsaPersonVerifyField
        emailLabel="Email"
        errorFallback="Could not verify"
        fetchingLabel="Fetching"
        fetchLabel="Fetch"
        hsaId=""
        inputClassName="input"
        inputId="hsa-id"
        nameLabel="Name"
        onHsaIdChange={vi.fn()}
        purpose="requirement_package_co_author"
        unavailableText="Unavailable"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('common.hsaPrefixMissing')).toBeInTheDocument()
    })
    expect(screen.getByRole('combobox')).toBeDisabled()
    const hsaIdInput = document.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    expect(hsaIdInput as HTMLElement).toBeDisabled()
  })

  it('keeps a hidden current prefix selectable only for the current value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              prefixes: [
                {
                  id: 2,
                  isDefault: true,
                  label: null,
                  prefix: 'NO5560000001',
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
      ),
    )

    render(
      <HsaPersonVerifyField
        emailLabel="Email"
        errorFallback="Could not verify"
        fetchingLabel="Fetching"
        fetchLabel="Fetch"
        hsaId="SE5560000001-old1"
        inputClassName="input"
        inputId="hsa-id"
        nameLabel="Name"
        onHsaIdChange={vi.fn()}
        purpose="requirement_package_co_author"
        unavailableText="Unavailable"
      />,
    )

    const prefixSelect = await screen.findByRole('combobox', {
      name: 'common.hsaPrefixLabel',
    })
    expect(prefixSelect).toHaveValue('SE5560000001')
    expect(
      screen.getByRole('option', { name: /common\.hsaPrefixCurrent/ }),
    ).toHaveValue('SE5560000001')
    const hsaIdInput = document.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    expect(hsaIdInput as HTMLInputElement).toHaveValue('old1')
  })

  it('keeps read-only HSA-id fields verifiable', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            person: {
              displayName: 'Ada Admin',
              email: 'ada.admin@example.test',
              givenName: 'Ada',
              hsaId: 'SE5560000001-admin1',
              middleName: null,
              surname: 'Admin',
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HsaPersonVerifyField
        emailLabel="Email"
        errorFallback="Could not verify"
        fetchingLabel="Fetching"
        fetchLabel="Fetch"
        hsaId="SE5560000001-admin1"
        inputClassName="input"
        inputId="hsa-id"
        nameLabel="Name"
        onHsaIdChange={vi.fn()}
        purpose="requirement_package_lead"
        readOnly
        showPersonSummaryAsText
        unavailableText="Unavailable"
      />,
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('readonly')
    expect(input).not.toBeDisabled()
    expect(input.className).toContain('read-only:bg-secondary-100')
    expect(input.className).toContain('read-only:text-secondary-500')

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-responsibility-people/verify',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(
        screen.getByText('Ada Admin (ada.admin@example.test)'),
      ).toBeInTheDocument()
    })
  })

  it('can hide the person summary completely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ prefixes: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
      ),
    )

    render(
      <HsaPersonVerifyField
        emailLabel="Email"
        errorFallback="Could not verify"
        fetchingLabel="Fetching"
        fetchLabel="Fetch"
        hsaId=""
        inputClassName="input"
        inputId="hsa-id"
        nameLabel="Name"
        onHsaIdChange={vi.fn()}
        personSummaryMode="hidden"
        purpose="requirement_package_co_author"
        showPersonSummaryAsText
        unavailableText="Unavailable"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('common.hsaPrefixMissing')).toBeInTheDocument()
    })
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText('Name')).not.toBeInTheDocument()
    expect(screen.queryByText('Email')).not.toBeInTheDocument()
  })

  it('uses the compact HSA-id layout only when requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ prefixes: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
      ),
    )

    render(
      <HsaPersonVerifyField
        compactHsaIdLayout
        emailLabel="Email"
        errorFallback="Could not verify"
        fetchingLabel="Fetching"
        fetchLabel="Fetch"
        hsaId=""
        inputClassName="input"
        inputId="hsa-id"
        nameLabel="Name"
        onHsaIdChange={vi.fn()}
        personSummaryMode="hidden"
        purpose="requirement_package_co_author"
        unavailableText="Unavailable"
      />,
    )

    const prefixSelect = await screen.findByRole('combobox', {
      name: 'common.hsaPrefixLabel',
    })
    expect(prefixSelect.parentElement?.className).toContain('minmax(9rem')
  })
})
