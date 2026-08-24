import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'
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

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function futureExpiresAt(): string {
  return new Date(Date.now() + 300_000).toISOString()
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

  it('marks the unavailable lookup status for Developer Mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/hsa-person-lookup-capability'
          ? okJson({ available: false })
          : okJson({ prefixes: [] }),
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

    const unavailableStatus = await screen.findByRole('status')
    expect(unavailableStatus).toHaveTextContent('common.hsaLookupUnavailable')
    expect(unavailableStatus).toHaveAttribute(
      'data-developer-mode-context',
      'hsa person verification',
    )
    expect(unavailableStatus).toHaveAttribute(
      'data-developer-mode-name',
      'lookup unavailable status',
    )
    expect(unavailableStatus).toHaveAttribute(
      'data-developer-mode-value',
      'requirement_package_co_author',
    )
  })

  it('does not render stale verification errors after the HSA-id changes', async () => {
    const request = deferredResponse()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return Promise.resolve(okJson({ available: true }))
      }
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

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled(),
    )
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

  it('reports prefix loading and empty verification response failures', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return Promise.resolve(okJson({ available: true }))
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.reject(new Error('prefix service offline'))
      }
      return Promise.resolve(okJson({}))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ControlledHsaPersonVerifyField />)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/hsa-id-prefixes'),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    expect(await screen.findByText('Could not verify')).toBeVisible()
  })

  it('composes selected prefix and suffix before verification', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return Promise.resolve(okJson({ available: true }))
      }
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
              evidence: 'signed-evidence',
              expiresAt: futureExpiresAt(),
              person: {
                displayName: 'Nora New',
                email: null,
                givenName: 'Nora',
                hasProtectedPersonalData: false,
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
      assert(verifyCall, 'Expected a verification request')
      const verifyRequest = verifyCall[1]
      assert(verifyRequest, 'Expected verification request options')
      assert(
        typeof verifyRequest.body === 'string',
        'Expected verification request body to be a string',
      )
      expect(JSON.parse(verifyRequest.body)).toEqual(
        expect.objectContaining({ hsaId: 'SE5560000001-new1' }),
      )
    })
  })

  it.each([
    {
      available: true,
      description:
        'refreshes live person details when tabbing from the suffix field',
      expectedMode: 'refresh',
    },
    {
      available: false,
      description:
        'reuses local person details on suffix blur when live lookup is unavailable',
      expectedMode: 'reuse_local',
    },
  ])('$description', async ({ available, expectedMode }) => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return Promise.resolve(okJson({ available }))
      }
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
              evidence: 'signed-evidence',
              expiresAt: futureExpiresAt(),
              person: {
                displayName: 'Nora New',
                email: 'nora.new@example.test',
                givenName: 'Nora',
                hasProtectedPersonalData: false,
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
    if (available) {
      await waitFor(() => expect(fetchButton).toBeEnabled())
    } else {
      await screen.findByText('common.hsaLookupUnavailable')
      expect(fetchButton).toBeDisabled()
    }
    fireEvent.blur(hsaIdInput as Element, { relatedTarget: fetchButton })

    await waitFor(() => {
      const verifyCall = fetchMock.mock.calls.find(
        ([url]) => url === '/api/requirement-responsibility-people/verify',
      )
      assert(verifyCall, 'Expected a verification request')
      const verifyRequest = verifyCall[1]
      assert(verifyRequest, 'Expected verification request options')
      assert(
        typeof verifyRequest.body === 'string',
        'Expected verification request body to be a string',
      )
      expect(JSON.parse(verifyRequest.body)).toEqual(
        expect.objectContaining({
          hsaId: 'SE5560000001-new1',
          mode: expectedMode,
        }),
      )
      expect(
        screen.getByText('Nora New (nora.new@example.test)'),
      ).toBeInTheDocument()
    })
  })

  it('waits for pending live capability before verifying a blurred suffix', async () => {
    const capability = deferredResponse()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return capability.promise
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          okJson({
            prefixes: [
              {
                id: 1,
                isDefault: true,
                label: null,
                prefix: 'SE5560000001',
              },
            ],
          }),
        )
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return Promise.resolve(
          okJson({
            evidence: 'signed-evidence',
            expiresAt: futureExpiresAt(),
            person: {
              displayName: 'Nora New',
              email: null,
              givenName: 'Nora',
              hasProtectedPersonalData: false,
              hsaId: 'SE5560000001-new1',
              middleName: null,
              surname: 'New',
            },
          }),
        )
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ControlledHsaPersonVerifyField />)
    await screen.findByRole('combobox', {
      name: 'common.hsaPrefixLabel',
    })
    const hsaIdInput = container.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    fireEvent.change(hsaIdInput as Element, { target: { value: 'new1' } })
    fireEvent.focus(hsaIdInput as Element)
    fireEvent.blur(hsaIdInput as Element)

    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === '/api/requirement-responsibility-people/verify',
      ),
    ).toHaveLength(0)

    await act(async () => {
      capability.resolve(okJson({ available: true }))
      await capability.promise
    })

    await waitFor(() => {
      const verifyCalls = fetchMock.mock.calls.filter(
        ([url]) => url === '/api/requirement-responsibility-people/verify',
      )
      expect(verifyCalls).toHaveLength(1)
      expect(JSON.parse(String(verifyCalls[0]?.[1]?.body))).toMatchObject({
        hsaId: 'SE5560000001-new1',
        mode: 'refresh',
      })
    })
  })

  it('sends one live refresh when the refresh button receives the suffix pointer', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return Promise.resolve(okJson({ available: true }))
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          okJson({
            prefixes: [
              {
                id: 1,
                isDefault: true,
                label: null,
                prefix: 'SE5560000001',
              },
            ],
          }),
        )
      }
      return Promise.resolve(
        okJson({
          evidence: 'signed-evidence',
          expiresAt: futureExpiresAt(),
          person: {
            displayName: 'Nora New',
            email: null,
            givenName: 'Nora',
            hasProtectedPersonalData: false,
            hsaId: 'SE5560000001-old1',
            middleName: null,
            surname: 'New',
          },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ControlledHsaPersonVerifyField />)
    const fetchButton = screen.getByRole('button', { name: 'Fetch' })
    await waitFor(() => expect(fetchButton).toBeEnabled())
    const hsaIdInput = container.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()

    fireEvent.focus(hsaIdInput as Element)
    fireEvent.pointerDown(fetchButton)
    fireEvent.blur(hsaIdInput as Element, { relatedTarget: fetchButton })
    fireEvent.click(fetchButton)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === '/api/requirement-responsibility-people/verify',
        ),
      ).toHaveLength(1)
    })
  })

  it('does not suppress a later edited suffix blur after an unrelated refresh click', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/hsa-person-lookup-capability') {
        return Promise.resolve(okJson({ available: true }))
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          okJson({
            prefixes: [
              {
                id: 1,
                isDefault: true,
                label: null,
                prefix: 'SE5560000001',
              },
            ],
          }),
        )
      }
      return Promise.resolve(
        okJson({
          evidence: 'signed-evidence',
          expiresAt: futureExpiresAt(),
          person: {
            displayName: 'Nora New',
            email: null,
            givenName: 'Nora',
            hasProtectedPersonalData: false,
            hsaId: 'SE5560000001-new1',
            middleName: null,
            surname: 'New',
          },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ControlledHsaPersonVerifyField />)
    const fetchButton = screen.getByRole('button', { name: 'Fetch' })
    await waitFor(() => expect(fetchButton).toBeEnabled())
    const hsaIdInput = container.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()

    fireEvent.pointerDown(fetchButton)
    fireEvent.click(fetchButton)
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === '/api/requirement-responsibility-people/verify',
        ),
      ).toHaveLength(1)
    })

    fireEvent.change(hsaIdInput as Element, { target: { value: 'new2' } })
    fireEvent.focus(hsaIdInput as Element)
    fireEvent.blur(hsaIdInput as Element)

    await waitFor(() => {
      const verifyCalls = fetchMock.mock.calls.filter(
        ([url]) => url === '/api/requirement-responsibility-people/verify',
      )
      expect(verifyCalls).toHaveLength(2)
      expect(JSON.parse(String(verifyCalls[1]?.[1]?.body))).toMatchObject({
        hsaId: 'SE5560000001-new2',
        mode: 'refresh',
      })
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/hsa-person-lookup-capability'
        ? okJson({ available: true })
        : new Response(
            JSON.stringify({
              evidence: 'signed-evidence',
              expiresAt: futureExpiresAt(),
              person: {
                displayName: 'Ada Admin',
                email: 'ada.admin@example.test',
                givenName: 'Ada',
                hasProtectedPersonalData: false,
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
        initialDisplayName="Initial Admin"
        initialEmail="initial.admin@example.test"
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
    expect(
      screen.getByText('Initial Admin (initial.admin@example.test)'),
    ).toBeVisible()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled(),
    )
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

  it('shows protection guidance only after a protected person is verified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/hsa-person-lookup-capability'
          ? okJson({ available: true })
          : okJson({
              evidence: 'signed-evidence',
              expiresAt: futureExpiresAt(),
              person: {
                displayName: 'Protected Person',
                email: 'protected@example.test',
                givenName: 'Protected',
                hasProtectedPersonalData: true,
                hsaId: 'SE5560000001-protected1',
                middleName: null,
                surname: 'Person',
              },
            }),
      ),
    )

    render(
      <HsaPersonVerifyField
        emailLabel="Email"
        errorFallback="Could not verify"
        fetchingLabel="Fetching"
        fetchLabel="Fetch"
        hsaId="SE5560000001-protected1"
        inputClassName="input"
        inputId="hsa-id"
        nameLabel="Name"
        onHsaIdChange={vi.fn()}
        purpose="requirements_specification_responsible"
        readOnly
        unavailableText="Unavailable"
      />,
    )

    expect(
      screen.queryByText('common.hsaProtectedPersonGuidance'),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    expect(
      await screen.findByText('common.hsaProtectedPersonGuidance'),
    ).toHaveAttribute('role', 'status')
    expect(screen.getByDisplayValue('Protected Person')).toBeVisible()
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
