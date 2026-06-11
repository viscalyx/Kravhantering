import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HsaPersonVerifyField from '@/components/HsaPersonVerifyField'

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
    vi.unstubAllGlobals()
  })

  it('does not render stale verification errors after the HSA-ID changes', async () => {
    const request = deferredResponse()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => request.promise),
    )

    const { container } = render(<ControlledHsaPersonVerifyField />)

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fetching' })).toBeDisabled()
    })

    const hsaIdInput = container.querySelector('#hsa-id')
    expect(hsaIdInput).not.toBeNull()
    fireEvent.change(hsaIdInput as HTMLInputElement, {
      target: { value: 'SE5560000001-new1' },
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

  it('keeps read-only HSA-ID fields verifiable', async () => {
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
})
