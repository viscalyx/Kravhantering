import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import SpecificationAgreementBox from '@/components/SpecificationAgreementBox'
import { requireTestValue } from '@/tests/helpers/require-test-value'

vi.mock('next-intl', () => {
  const translate = (key: string) => key
  return { useTranslations: () => translate, useLocale: () => 'sv' }
})

describe('agreement header author workflow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([false, true])(
    'shows the history disclosure only when previous agreements exist (%s) and restores focus',
    async hasHistory => {
      const user = userEvent.setup()
      const current = {
        id: 1,
        agreementReference: 'A',
        effectiveDate: '2020-01-01',
        state: 'current',
      }
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              agreements: hasHistory
                ? [
                    {
                      ...current,
                      id: 2,
                      agreementReference: 'Previous A',
                      state: 'previous',
                    },
                    current,
                  ]
                : [current],
              selectedAgreement: current,
              canAuthor: true,
              canDecide: true,
            }),
          ),
      )
      vi.stubGlobal('fetch', fetch)
      render(
        <ConfirmModalProvider>
          <dl>
            <SpecificationAgreementBox
              onContextChange={vi.fn()}
              specificationId={1}
            />
          </dl>
        </ConfirmModalProvider>,
      )
      const trigger = await screen.findByRole('button', { name: 'select' })
      await user.click(trigger)
      const selector = screen.getByRole('dialog', { name: 'select' })
      expect(
        within(selector).getByRole('button', { name: /^A ·/ }),
      ).toHaveFocus()
      const history = within(selector).queryByText('previousAgreements')
      if (hasHistory) {
        expect(history).toBeVisible()
        await user.click(within(selector).getByText('previousAgreements'))
        expect(
          within(selector).getByRole('button', { name: /Previous A/ }),
        ).toBeVisible()
      } else {
        expect(history).not.toBeInTheDocument()
      }
      expect(
        screen
          .getByText('2020-01-01 · states.current', { exact: true })
          .closest('[role="status"]'),
      ).toHaveAttribute(
        'data-developer-mode-value',
        'agreement effective date and state',
      )
      await user.keyboard('{Escape}')
      expect(trigger).toHaveFocus()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    },
  )

  it.each([false, true])(
    'closes details without changing an upcoming agreement with decision permission %s',
    async canDecide => {
      const user = userEvent.setup()
      const upcoming = {
        id: 1,
        agreementReference: 'Future A',
        effectiveDate: '2035-01-01',
        state: 'upcoming',
      }
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              agreements: [upcoming],
              selectedAgreement: upcoming,
              canAuthor: canDecide,
              canDecide,
            }),
          ),
      )
      vi.stubGlobal('fetch', fetch)
      render(
        <ConfirmModalProvider>
          <dl>
            <SpecificationAgreementBox
              onContextChange={vi.fn()}
              specificationId={1}
            />
          </dl>
        </ConfirmModalProvider>,
      )
      const trigger = await screen.findByRole('button', { name: 'details' })
      await user.click(trigger)
      const dialog = screen.getByRole('dialog', { name: 'details' })
      const buttons = within(dialog).getAllByRole('button')
      const close = requireTestValue(buttons.at(-1))
      expect(close).toHaveTextContent('close')
      expect(close.parentElement).toHaveAttribute(
        'data-developer-mode-value',
        'agreement details actions',
      )
      await user.click(close)
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      )
      expect(trigger).toHaveFocus()
      expect(fetch).toHaveBeenCalledTimes(1)
      await user.click(trigger)
      expect(
        within(screen.getByRole('dialog', { name: 'details' })).getByRole(
          'status',
        ),
      ).toHaveTextContent('states.upcoming')
    },
  )

  it('confirms an explicit plan for approvals received after draft editing', async () => {
    const user = userEvent.setup()
    const draft = {
      id: 2,
      agreementReference: 'B',
      effectiveDate: '2035-01-01',
      state: 'draft',
    }
    const view = {
      agreements: [draft],
      selectedAgreement: draft,
      canAuthor: true,
      canDecide: true,
      canEditContent: true,
      canFollowUp: false,
      items: [],
      deviations: [],
      deviationEndings: [],
      corrections: [],
      confirmationDeviations: [
        {
          agreementItemId: 3,
          agreementReference: 'B',
          effectiveDate: '2035-01-01',
          deviationId: 8,
          itemRef: 'lib:9',
          motivation: 'Newly approved exception',
          decision: 1,
        },
      ],
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(view)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agreementId: 2 })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...view,
            selectedAgreement: { ...draft, state: 'upcoming' },
            confirmationDeviations: [],
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    render(
      <ConfirmModalProvider>
        <dl>
          <SpecificationAgreementBox
            onContextChange={vi.fn()}
            specificationId={1}
          />
        </dl>
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'details' }))
    expect(screen.getByText('Newly approved exception')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'confirm' }).parentElement,
    ).toHaveAttribute('data-developer-mode-value', 'agreement details actions')
    expect(screen.getByRole('button', { name: 'correct' }).parentElement).toBe(
      screen.getByRole('button', { name: 'discard' }).parentElement,
    )
    await user.click(screen.getByRole('button', { name: 'confirm' }))
    const confirmation = await screen.findByRole('alertdialog')
    expect(within(confirmation).getByText(/plannedEndingWarning/)).toBeVisible()
    await user.click(
      within(confirmation).getByRole('button', {
        name: 'confirmAndPlanEndings',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const posted = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(posted?.[1]?.body as string)).toEqual({
      operation: 'confirm',
      agreementId: 2,
      authorizeDeviationEndings: true,
    })
  })

  it('corrects reference and description while keeping the effective date locked after activation', async () => {
    const user = userEvent.setup()
    const current = {
      id: 1,
      agreementReference: 'A',
      description: 'Original description',
      effectiveDate: '2020-01-01',
      state: 'current',
      createdAt: '2020-01-01T10:00:00Z',
      createdBy: 'no-user',
    }
    const view = {
      agreements: [current],
      selectedAgreement: current,
      corrections: [],
      items: [],
      deviations: [],
      deviationEndings: [],
      canAuthor: true,
      canDecide: true,
      canEditContent: false,
      canFollowUp: true,
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(view)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agreementId: 1 })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...view,
            selectedAgreement: {
              ...current,
              agreementReference: 'A corrected',
            },
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    render(
      <ConfirmModalProvider>
        <dl>
          <SpecificationAgreementBox
            onContextChange={vi.fn()}
            specificationId={1}
          />
        </dl>
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'details' }))
    await user.click(screen.getByText('registrationInformation'))
    expect(screen.getByText(/Anonym$/)).toBeVisible()
    expect(screen.queryByText('no-user')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'correct' }))
    const dialog = screen.getByRole('dialog', { name: 'correct' })
    expect(within(dialog).getByLabelText(/^effectiveDate/)).toBeDisabled()
    await user.type(
      within(dialog).getByRole('textbox', { name: /^reference/ }),
      ' corrected',
    )
    await user.clear(
      within(dialog).getByRole('textbox', { name: /^description/ }),
    )
    await user.type(
      within(dialog).getByRole('textbox', { name: /^description/ }),
      'Updated description',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'saveCorrection' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const posted = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(posted?.[1]?.body as string)).toEqual({
      operation: 'correct',
      agreementId: 1,
      agreementReference: 'A corrected',
      effectiveDate: '2020-01-01',
      description: 'Updated description',
    })
  })

  it('records an agreement end with a separate stated date and a reason', async () => {
    const user = userEvent.setup()
    const current = {
      id: 1,
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
      state: 'current',
    }
    const view = {
      agreements: [current],
      selectedAgreement: current,
      items: [{ itemRef: 'lib:9', uniqueId: 'REQ-9' }],
      deviations: [
        {
          id: 8,
          itemRef: 'lib:9',
          decision: 1,
          motivation: 'Approved delivery exception',
        },
      ],
      deviationEndings: [],
      canAuthor: true,
      canDecide: true,
      canEditContent: false,
      canFollowUp: true,
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(view)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 8,
              itemRef: 'lib:9',
              uniqueId: 'REQ-9',
              motivation: 'Approved delivery exception',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...view,
            selectedAgreement: { ...current, state: 'ended' },
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    render(
      <ConfirmModalProvider>
        <dl>
          <SpecificationAgreementBox
            onContextChange={vi.fn()}
            specificationId={1}
          />
        </dl>
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'details' }))
    await user.click(screen.getByRole('button', { name: 'endAgreement' }))
    const dialog = screen.getByRole('dialog', { name: 'endAgreement' })
    expect(within(dialog).getByText('endWarning')).toBeVisible()
    expect(
      within(dialog).getByText(/REQ-9.*Approved delivery exception/),
    ).toBeVisible()
    await user.type(within(dialog).getByLabelText(/^endDate/), '2025-01-01')
    await user.type(
      within(dialog).getByRole('textbox', { name: /^reason/ }),
      'The contract period has ended',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'endAgreement' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const posted = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(posted?.[1]?.body as string)).toEqual({
      operation: 'end',
      agreementId: 1,
      endDate: '2025-01-01',
      reason: 'The contract period has ended',
    })
    expect(screen.getByRole('button', { name: 'newAgreement' })).toBeEnabled()
  })

  it('cancels a confirmed upcoming agreement with a required reason and preserves its historical context', async () => {
    const user = userEvent.setup()
    const current = {
      id: 1,
      agreementReference: 'A',
      effectiveDate: '2030-09-01',
      state: 'current',
    }
    const upcoming = {
      id: 2,
      agreementReference: 'B',
      effectiveDate: '2030-10-01',
      state: 'upcoming',
    }
    const view = {
      agreements: [current, upcoming],
      selectedAgreement: upcoming,
      items: [],
      deviations: [],
      deviationEndings: [],
      canAuthor: true,
      canDecide: true,
      canEditContent: false,
      canFollowUp: false,
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(view)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...view,
            selectedAgreement: current,
            agreements: [current, { ...upcoming, state: 'cancelled' }],
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    render(
      <ConfirmModalProvider>
        <dl>
          <SpecificationAgreementBox
            onContextChange={vi.fn()}
            specificationId={1}
          />
        </dl>
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'details' }))
    await user.click(screen.getByRole('button', { name: 'cancelAgreement' }))
    const dialog = screen.getByRole('dialog', { name: 'cancelAgreement' })
    expect(within(dialog).getByText('cancelWarning')).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: 'cancelAgreement' }),
    ).toBeDisabled()
    await user.type(
      within(dialog).getByRole('textbox', { name: /^reason/ }),
      'The replacement will not proceed',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'cancelAgreement' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const posted = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(posted?.[1]?.body as string)).toEqual({
      operation: 'cancel',
      agreementId: 2,
      reason: 'The replacement will not proceed',
    })
    await user.click(screen.getByRole('button', { name: 'select' }))
    await user.click(screen.getByText('previousAgreements'))
    expect(
      screen.getByRole('button', { name: /B · 2030-10-01 · states.cancelled/ }),
    ).toBeVisible()
  })

  it('discards a draft with explicit confirmation and returns the header to the current agreement', async () => {
    const user = userEvent.setup()
    const current = {
      id: 1,
      agreementReference: 'A',
      effectiveDate: '2030-09-01',
      state: 'current',
    }
    const draft = {
      id: 2,
      agreementReference: 'B',
      effectiveDate: '2030-09-15',
      state: 'draft',
    }
    const view = {
      agreements: [current, draft],
      selectedAgreement: draft,
      items: [],
      deviations: [],
      deviationEndings: [],
      canAuthor: true,
      canDecide: true,
      canEditContent: true,
      canFollowUp: false,
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(view)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...view,
            agreements: [current],
            selectedAgreement: current,
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const onContextChange = vi.fn()
    render(
      <ConfirmModalProvider>
        <dl>
          <SpecificationAgreementBox
            onContextChange={onContextChange}
            specificationId={1}
          />
        </dl>
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'details' }))
    await user.click(screen.getByRole('button', { name: 'discard' }))
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'discardTitle',
    })
    await user.click(
      within(confirmation).getByRole('button', { name: 'discard' }),
    )
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedAgreement: expect.objectContaining({ id: 1 }),
        }),
        true,
      ),
    )
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(
      '/api/requirements-specifications/1/agreement',
    )
  })

  it('registers the first agreement through the header dialog and announces its selected context', async () => {
    const user = userEvent.setup()
    const empty = {
      agreements: [],
      selectedAgreement: null,
      items: [],
      deviations: [],
      canAuthor: true,
      canDecide: true,
      canEditContent: true,
      canFollowUp: true,
    }
    const agreement = {
      id: 7,
      agreementReference: 'DELIVERY-2030',
      effectiveDate: '2030-10-01',
      state: 'upcoming',
      confirmedAt: '2030-09-14T10:00:00Z',
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(empty)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agreementId: 7 })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...empty,
            agreements: [agreement],
            selectedAgreement: agreement,
            canEditContent: false,
            canFollowUp: false,
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const onContextChange = vi.fn()
    render(
      <ConfirmModalProvider>
        <dl>
          <SpecificationAgreementBox
            onContextChange={onContextChange}
            specificationId={1}
          />
        </dl>
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'register' }))
    const dialog = screen.getByRole('dialog', { name: 'register' })
    await user.type(
      within(dialog).getByRole('textbox', { name: /^reference/ }),
      'DELIVERY-2030',
    )
    await user.type(
      within(dialog).getByLabelText(/^effectiveDate/),
      '2030-10-01',
    )
    await user.click(within(dialog).getByRole('button', { name: 'confirm' }))
    expect(await screen.findByText('DELIVERY-2030')).toBeVisible()
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedAgreement: expect.objectContaining({
            id: 7,
            state: 'upcoming',
          }),
        }),
        true,
      ),
    )
    const posted = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(posted?.[1]?.body as string)).toEqual({
      operation: 'establish',
      agreementReference: 'DELIVERY-2030',
      effectiveDate: '2030-10-01',
    })
  })
})
