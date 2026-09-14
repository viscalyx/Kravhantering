import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpecificationAgreementPanel from '@/components/SpecificationAgreementPanel'

vi.mock('next-intl', () => {
  const translate = (key: string) => key
  return { useTranslations: () => translate, useLocale: () => 'en' }
})

describe('agreement author workflow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('announces loading and ignores an obsolete specification response', async () => {
    let resolveFirst = (_response: Response): void => {
      throw new Error('First request not started')
    }
    const first = new Promise<Response>(resolve => {
      resolveFirst = resolve
    })
    const view = (agreementReference: string) => ({
      establishmentStatus: 'editable',
      agreementReference,
      canAuthor: false,
      canDecide: false,
      currentItems: [],
      originalItems: [],
      historyItems: [],
      amendments: [],
      deviations: [],
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce(new Response(JSON.stringify(view('SECOND')))),
    )
    const onChanged = vi.fn()
    const { rerender } = render(
      <SpecificationAgreementPanel onChanged={onChanged} specificationId={1} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('working')
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true')
    rerender(
      <SpecificationAgreementPanel onChanged={onChanged} specificationId={2} />,
    )
    expect(await screen.findByText(/SECOND/)).toHaveAttribute('role', 'status')
    await act(async () => {
      resolveFirst(new Response(JSON.stringify(view('FIRST'))))
      await first
    })
    expect(screen.getByText(/SECOND/)).toBeVisible()
    expect(screen.queryByText(/FIRST/)).not.toBeInTheDocument()
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'false')
  })

  it('lets the author compare versions and keep the pinned version without a mutation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            establishmentStatus: 'editable',
            canAuthor: true,
            canDecide: true,
            currentItems: [
              {
                itemRef: 'lib:1',
                description: 'Pinned text',
                versionNumber: 2,
                requirementVersionId: 2,
                newerPublishedVersionId: 3,
                specificationItemStatusId: 1,
              },
            ],
            originalItems: [],
            historyItems: [],
            amendments: [],
            deviations: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pinned: {
              id: 2,
              description: 'Pinned text',
              versionNumber: 2,
              category: 'Funktion',
              categoryEn: 'Function',
            },
            published: {
              id: 3,
              description: 'New published text',
              versionNumber: 3,
            },
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(
      <SpecificationAgreementPanel onChanged={vi.fn()} specificationId={1} />,
    )
    expect(
      await screen.findByRole('region', { name: 'title' }),
    ).toHaveAttribute(
      'data-developer-mode-name',
      'agreement and version history',
    )
    expect(screen.getByRole('region', { name: 'title' })).toHaveAttribute(
      'data-developer-mode-value',
      'independent desktop scroll panel',
    )
    await user.click(await screen.findByRole('button', { name: 'compare' }))
    expect(await screen.findByText('New published text')).toBeVisible()
    expect(screen.getByText('Function')).toBeVisible()
    expect(screen.queryByText('Funktion')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'keep' }))
    await waitFor(() => expect(screen.getByText('Pinned text')).toBeVisible())
    expect(
      fetch.mock.calls.every(
        ([, init]) => !init?.method || init.method === 'GET',
      ),
    ).toBe(true)
  })

  it('adopts the compared version with a reason and shows its reassessment requirement', async () => {
    const initial = {
      establishmentStatus: 'editable',
      canAuthor: true,
      canDecide: true,
      currentItems: [
        {
          itemRef: 'lib:1',
          description: 'Pinned text',
          requirementVersionId: 2,
          versionNumber: 2,
          newerPublishedVersionId: 3,
          specificationItemStatusId: 4,
        },
      ],
      originalItems: [],
      historyItems: [],
      amendments: [],
      deviations: [],
      availableVersions: [],
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(initial)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pinned: { id: 2, description: 'Pinned text' },
            published: { id: 3, description: 'New text' },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...initial,
            currentItems: [
              {
                itemRef: 'lib:2',
                description: 'New text',
                requirementVersionId: 3,
                specificationItemStatusId: 1,
                reassessmentRequired: true,
              },
            ],
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    const changed = vi.fn()
    render(
      <SpecificationAgreementPanel onChanged={changed} specificationId={1} />,
    )
    await user.click(await screen.findByRole('button', { name: 'compare' }))
    await user.type(
      await screen.findByRole('textbox', { name: /reason/ }),
      'Clarified requirement',
    )
    await user.click(screen.getByRole('button', { name: 'adopt' }))
    expect(await screen.findByText('reassessmentRequired')).toBeVisible()
    expect(
      JSON.parse(
        fetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body,
      ),
    ).toEqual({
      operation: 'adopt',
      itemRef: 'lib:1',
      targetVersionId: 3,
      reason: 'Clarified requirement',
    })
    expect(changed).toHaveBeenCalledOnce()
  })

  it('lets a co-author prepare grouped changes while reserving agreement decisions for the responsible person', async () => {
    const initial = {
      establishmentStatus: 'established',
      canAuthor: true,
      canDecide: false,
      currentItems: [
        {
          itemRef: 'local:1',
          description: 'Agreed text',
          specificationItemStatusId: 1,
        },
      ],
      originalItems: [],
      historyItems: [],
      amendments: [],
      deviations: [],
      availableVersions: [],
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(initial)))
      .mockResolvedValueOnce(new Response('{"amendmentId":1}'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...initial,
            amendments: [
              {
                id: 1,
                status: 'draft',
                reason: 'No longer required',
                changes: [],
              },
            ],
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(
      <SpecificationAgreementPanel onChanged={vi.fn()} specificationId={1} />,
    )
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /changeKind/ }),
      'remove',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: /application/ }),
      'local:1',
    )
    await user.click(screen.getByRole('button', { name: 'stageChange' }))
    await user.type(
      screen.getByRole('textbox', { name: /reason/ }),
      'No longer required',
    )
    await user.type(
      screen.getByRole('textbox', { name: /agreementReference/ }),
      'SUPPLIER/T1',
    )
    await user.type(
      screen.getByLabelText(/^effectiveDate/, { selector: 'input' }),
      '2099-01-01',
    )
    await user.click(screen.getByRole('button', { name: 'prepare' }))
    expect(await screen.findByText('No longer required')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'decide' }),
    ).not.toBeInTheDocument()
    expect(
      JSON.parse(
        fetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body,
      ),
    ).toMatchObject({
      operation: 'prepare_amendment',
      changes: [{ kind: 'remove', itemRef: 'local:1' }],
    })
  })
})
