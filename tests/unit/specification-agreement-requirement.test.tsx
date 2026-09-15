import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import SpecificationAgreementDeviations from '@/components/SpecificationAgreementDeviations'
import SpecificationAgreementHistory from '@/components/SpecificationAgreementHistory'
import SpecificationAgreementRequirement from '@/components/SpecificationAgreementRequirement'
import { requirementContentChange } from '@/lib/specifications/agreement-history'
import type { AgreementItem } from '@/lib/specifications/agreements'
import { requireTestValue } from '@/tests/helpers/require-test-value'

const { historyFetch } = vi.hoisted(() => ({ historyFetch: vi.fn() }))
vi.mock('@/lib/http/api-fetch', () => ({
  apiFetch: (...args: Parameters<typeof fetch>) =>
    String(args[0]).includes('historyItemRef=')
      ? historyFetch(...args)
      : fetch(...args),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.rich = t
    return t
  },
}))

const item: AgreementItem = {
  itemRef: 'lib:9',
  uniqueId: 'LIB-0009',
  description: 'Library original',
  acceptanceCriteria: 'Original criteria',
  verificationMethod: 'Original method',
  verifiable: true,
  requirementCategoryId: null,
  requirementTypeId: null,
  qualityCharacteristicId: null,
  priorityLevelId: null,
  needsReferenceId: 7,
  needsReference: 'Need A',
  normReferenceIds: [11],
  normReferences: 'Norm A',
  note: null,
  specificationItemStatusId: 1,
  requirementId: 3,
  requirementVersionId: 5,
  versionNumber: 1,
  newerPublishedVersionId: null,
  sourceRequirementVersionId: null,
  sourceUniqueId: null,
  sourceVersionNumber: null,
  validFrom: new Date('2020-01-01'),
  validUntil: null,
  changeDate: null,
  changeKind: null,
}
const agreement = {
  id: 2,
  agreementReference: 'B',
  effectiveDate: '2035-01-01',
  state: 'draft',
  description: null,
  createdAt: new Date('2026-01-01'),
  createdBy: 'Author',
  confirmedBy: null,
  cancelledBy: null,
  endedBy: null,
  confirmedAt: null,
  activatedAt: null,
  cancelledAt: null,
  endedAt: null,
  replacedAt: null,
  cancellationReason: null,
  endReason: null,
  endDate: null,
}
const view: SpecificationAgreementView = {
  confirmationDeviations: [],
  selectedAgreement: agreement,
  agreements: [
    {
      ...agreement,
      id: 1,
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
      state: 'current',
    },
    agreement,
  ],
  items: [item],
  corrections: [],
  deviations: [],
  deviationEndings: [],
  canAuthor: true,
  canReviewDeviations: false,
  canDecide: true,
  canEditContent: true,
  canFollowUp: false,
}

describe('requirement content change summaries', () => {
  it.each([
    ['copied binding', { itemRef: 'lib:99' }, null],
    [
      'follow-up only',
      {
        note: 'A note',
        needsReference: 'New need',
        specificationItemStatusId: 4,
      },
      null,
    ],
    ['changed text', { description: 'Changed' }, 'changed'],
    ['changed classification', { requirementTypeId: 7 }, 'changed'],
    ['removal', { isRemoved: true }, 'removed'],
    [
      'library update',
      { requirementVersionId: 7, versionNumber: 2 },
      'libraryUpdated',
    ],
    [
      'local conversion',
      {
        itemRef: 'local:13',
        requirementId: null,
        requirementVersionId: null,
        uniqueId: 'LOCAL-0013',
      },
      'madeLocal',
    ],
  ] as const)('summarizes %s', (_name, changes, expected) => {
    expect(requirementContentChange({ ...item, ...changes }, item)).toBe(
      expected,
    )
  })
  it('compares reference membership without depending on its order', () => {
    expect(
      requirementContentChange(
        { ...item, normReferenceIds: [2, 1] },
        { ...item, normReferenceIds: [1, 2] },
      ),
    ).toBeNull()
    expect(
      requirementContentChange(
        { ...item, normReferenceIds: [2] },
        { ...item, normReferenceIds: [1] },
      ),
    ).toBe('changed')
  })
  it('does not repeat an existing removal and recognizes restored membership', () => {
    expect(
      requirementContentChange(
        { ...item, isRemoved: true },
        { ...item, isRemoved: true },
      ),
    ).toBeNull()
    expect(requirementContentChange(item, { ...item, isRemoved: true })).toBe(
      'added',
    )
  })
})

describe('selected agreement requirement author workflow', () => {
  beforeEach(() => {
    historyFetch.mockImplementation(() => new Promise(() => {}))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps history errors distinct from an unchanged requirement and offers retry', async () => {
    const reload = vi.fn(async () => undefined)
    const { rerender } = render(
      <SpecificationAgreementHistory
        actionTarget={null}
        item={item}
        resource={{
          data: undefined,
          error: 'Cannot read history',
          loading: false,
          refreshing: false,
          refreshError: null,
          reload,
        }}
        view={view}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot read history')
    await userEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(reload).toHaveBeenCalledOnce()
    rerender(
      <SpecificationAgreementHistory
        actionTarget={null}
        item={item}
        resource={{
          data: {
            entries: [],
            changes: [],
            ancestorAgreementIds: [2, 1],
            previous: null,
          },
          error: null,
          loading: false,
          refreshing: false,
          refreshError: null,
          reload,
        }}
        view={view}
      />,
    )
    expect(
      screen.queryByText('agreement.requirementHistory'),
    ).not.toBeInTheDocument()
  })

  it('shows each earlier-content deviation once even when unchanged content spans agreements', async () => {
    const oldItem = {
      ...item,
      deviationStateSnapshot: [
        { id: 8, motivation: 'Earlier-content case', isReviewRequested: 0 },
      ],
    }
    const entry = {
      agreementId: 1,
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
      item: oldItem,
    }
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          history={{
            changes: [],
            previous: entry,
            entries: [entry, { ...entry, agreementId: 2 }],
            ancestorAgreementIds: [2, 1],
            deviations: [
              {
                id: 8,
                itemRef: item.itemRef,
                motivation: 'Earlier-content case',
                decision: 3,
                decisionMotivation: 'Cancelled',
                createdAt: new Date('2026-01-01'),
                decidedAt: new Date('2026-07-01'),
              },
            ],
            deviationEndings: [],
          }}
          item={{ ...item, itemRef: 'local:13' }}
          onChange={async () => {}}
          specificationId={1}
          view={{
            ...view,
            agreements: [
              {
                ...agreement,
                id: 1,
                state: 'previous',
                replacedAt: new Date('2026-08-01'),
              },
              agreement,
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(screen.getByText('deviation.historyLabel'))
    expect(
      screen.getAllByRole('article', { name: 'Earlier-content case' }),
    ).toHaveLength(1)
  })

  it.each(['lib:9', 'local:9'] as const)(
    'keeps an unresolved %s case visible above collapsed newer history',
    async itemRef => {
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementRequirement
            item={{ ...item, itemRef }}
            needsReferencesResource={{
              data: [],
              loading: false,
              error: null,
              refreshing: false,
              refreshError: null,
              reload: async () => [],
            }}
            onChange={async () => {}}
            specificationId={1}
            view={{
              ...view,
              deviations: [
                {
                  id: 8,
                  itemRef,
                  motivation: 'Unresolved older request',
                  decision: null,
                  decisionMotivation: null,
                  decidedAt: null,
                  createdAt: new Date('2026-01-01'),
                  isReviewRequested: 1,
                },
                {
                  id: 9,
                  itemRef,
                  motivation: 'Newer rejected request',
                  decision: 2,
                  decisionMotivation: 'Rejected',
                  decidedAt: new Date('2026-01-03'),
                  createdAt: new Date('2026-01-02'),
                },
              ],
            }}
          />
        </ConfirmModalProvider>,
      )
      expect(
        screen.getByRole('article', { name: 'Unresolved older request' }),
      ).toBeVisible()
      expect(screen.getByText('Newer rejected request')).not.toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'deviation.requestDeviation' }),
      ).not.toBeInTheDocument()
      await userEvent.click(screen.getByText('deviation.historyLabel'))
      expect(
        screen.getByRole('article', { name: 'Newer rejected request' }),
      ).toBeVisible()
    },
  )

  it.each([
    {
      name: 'only agreement',
      agreements: [agreement],
      selected: agreement,
      compare: false,
    },
    {
      name: 'first of several',
      agreements: [agreement, { ...agreement, id: 3 }],
      selected: agreement,
      compare: false,
    },
    {
      name: 'later agreement',
      agreements: view.agreements,
      selected: agreement,
      compare: true,
    },
    {
      name: 'new first agreement after cancellation',
      agreements: [{ ...agreement, id: 1, state: 'cancelled' }, agreement],
      selected: agreement,
      compare: false,
    },
  ])(
    'offers comparison only for relevant agreement contexts: $name',
    ({ agreements, selected, compare }) => {
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementRequirement
            item={item}
            needsReferencesResource={{
              data: [],
              loading: false,
              error: null,
              refreshing: false,
              refreshError: null,
              reload: async () => [],
            }}
            onChange={async () => {}}
            specificationId={1}
            view={{ ...view, agreements, selectedAgreement: selected }}
          />
        </ConfirmModalProvider>,
      )
      const actions = screen.getByRole('group', {
        name: 'agreement.requirementActionColumn',
      })
      expect(
        within(actions).queryAllByRole('button', {
          name: 'agreement.comparePrevious',
        }),
      ).toHaveLength(compare ? 1 : 0)
    },
  )

  it('places library updates and undo alongside the other requirement actions', () => {
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={{
            ...item,
            newerPublishedVersionId: 10,
            changeDate: agreement.effectiveDate,
          }}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={async () => {}}
          specificationId={1}
          view={view}
        />
      </ConfirmModalProvider>,
    )
    const actions = screen.getByRole('group', {
      name: 'agreement.requirementActionColumn',
    })
    expect(actions).toHaveAttribute(
      'data-developer-mode-name',
      'compact centered requirement actions',
    )
    expect(
      within(actions).getByRole('button', {
        name: 'agreement.updateFromLibrary',
      }),
    ).toBeVisible()
    expect(
      within(actions).getByRole('button', {
        name: 'agreement.undoRequirement',
      }),
    ).toBeVisible()
    expect(
      within(actions).getByRole('button', {
        name: 'agreement.comparePrevious',
      }),
    ).toBeVisible()
  })

  it('shows compact changes and opens full content only in comparison', async () => {
    const user = userEvent.setup()
    const previous = {
      agreementId: 1,
      agreementReference: 'A',
      effectiveDate: '2020-01-01',
      item: {
        ...item,
        description: 'Earlier requirement content',
        acceptanceCriteria: 'Earlier acceptance criteria',
      },
    }
    historyFetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            entries: [previous],
            previous,
            ancestorAgreementIds: [2, 1],
            changes: [
              {
                agreementId: 2,
                agreementReference: 'B',
                effectiveDate: agreement.effectiveDate,
                kind: 'changed',
                previousAgreementReference: 'A',
                previousVersion: null,
                version: null,
              },
            ],
          }),
        ),
    )
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={item}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={async () => {}}
          specificationId={1}
          view={view}
        />
      </ConfirmModalProvider>,
    )
    await user.click(await screen.findByText('agreement.requirementHistory'))
    expect(screen.getByText(/agreement.historyChanges.changed/)).toBeVisible()
    expect(screen.getByText('agreement.viewingAgreementBadge')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'agreement.comparePrevious' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'agreement.comparePrevious',
    })
    expect(
      within(dialog).getByText('Earlier acceptance criteria'),
    ).toBeVisible()
    expect(within(dialog).getByText('Library original')).toBeVisible()
  })

  it('edits a pending case in the selected agreement and shows save errors inside its dialog', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'conflict',
            error: 'The agreement is now historical',
          }),
          { status: 409 },
        ),
    )
    vi.stubGlobal('fetch', fetch)
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={item}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={async () => {}}
          specificationId={1}
          view={{
            ...view,
            deviations: [
              {
                id: 8,
                itemRef: item.itemRef,
                motivation: 'Original reason',
                decision: null,
                decisionMotivation: null,
                decidedAt: null,
                isReviewRequested: 0,
              },
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    const deviationBox = screen.getByRole('article', {
      name: 'Original reason',
    })
    expect(
      within(deviationBox).getByRole('button', {
        name: 'deviation.editDeviation',
      }),
    ).toBeVisible()
    expect(
      deviationBox.compareDocumentPosition(
        screen.getByText('Library original'),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: 'deviation.editDeviation' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'deviation.editDeviation',
    })
    await user.clear(within(dialog).getByRole('textbox'))
    await user.type(within(dialog).getByRole('textbox'), 'Updated reason')
    await user.click(
      within(dialog).getByRole('button', { name: 'common.save' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'agreement.contentChangedError',
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/deviations/8',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ motivation: 'Updated reason', agreementId: 2 }),
      }),
    )
  })

  it('saves a follow-up note in the selected current agreement without editing requirement content', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal('fetch', fetch)
    const onChange = vi.fn(async () => undefined)
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={item}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={onChange}
          specificationId={1}
          view={{
            ...view,
            canEditContent: false,
            canFollowUp: true,
            selectedAgreement: { ...agreement, state: 'current' },
          }}
        />
      </ConfirmModalProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'agreement.editNote' }))
    const dialog = screen.getByRole('dialog', { name: 'agreement.editNote' })
    await user.type(
      within(dialog).getByRole('textbox'),
      'Verification evidence received',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'common.save' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith(
      '/api/requirements-specifications/1/items/lib%3A9',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          agreementId: 2,
          note: 'Verification evidence received',
        }),
      }),
    )
  })

  it('keeps later shared-case approval inside history without changing the historical pending result', async () => {
    const user = userEvent.setup()
    const selected = {
      ...agreement,
      state: 'previous',
      replacedAt: new Date('2026-08-01'),
    }
    const historicalItem = {
      ...item,
      deviationStateSnapshot: [
        { id: 8, motivation: 'Shared case', isReviewRequested: 1 },
      ],
    }
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={historicalItem}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={async () => {}}
          specificationId={1}
          view={{
            ...view,
            canEditContent: false,
            selectedAgreement: selected,
            agreements: [selected, { ...agreement, id: 3, state: 'current' }],
            deviations: [
              {
                id: 8,
                itemRef: item.itemRef,
                motivation: 'Shared case',
                createdAt: new Date('2026-07-01'),
                decision: 1,
                decisionMotivation: 'Approved later',
                decidedAt: new Date('2026-08-02'),
              },
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    expect(screen.getByText('deviation.stepReviewRequested')).toBeVisible()
    expect(screen.getByRole('article', { name: 'Shared case' })).toBeVisible()
    await user.click(
      screen.getByText('agreement.laterEvents', { selector: 'summary' }),
    )
    const later = await screen.findByRole('region', {
      name: 'agreement.laterEvents',
    })
    expect(within(later).getByText('deviation.statusApproved')).toBeVisible()
    expect(within(later).getByText('Approved later')).toBeVisible()
  })

  it('keeps the frozen draft text and state while showing later edits only as later events', async () => {
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={{
            ...item,
            deviationStateSnapshot: [
              { id: 8, motivation: 'Original draft', isReviewRequested: 0 },
            ],
          }}
          onChange={async () => {}}
          showLaterEvents
          specificationId={1}
          view={{
            ...view,
            selectedAgreement: {
              ...agreement,
              state: 'previous',
              replacedAt: new Date('2026-08-01'),
            },
            deviations: [
              {
                id: 8,
                itemRef: item.itemRef,
                motivation: 'Edited later',
                isReviewRequested: 1,
                createdAt: new Date('2026-07-01'),
                updatedAt: new Date('2026-08-02'),
                decision: null,
                decisionMotivation: null,
                decidedAt: null,
              },
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    const original = screen.getByRole('article', { name: 'Original draft' })
    expect(within(original).getByText('deviation.stepDraft')).toBeVisible()
    expect(within(original).getByText('Edited later')).not.toBeVisible()
    await userEvent.click(
      within(original).getByText('agreement.laterEvents', {
        selector: 'summary',
      }),
    )
    const later = screen.getByRole('region', { name: 'agreement.laterEvents' })
    expect(within(later).getByText('Edited later')).toBeVisible()
    expect(
      within(later).getByText('deviation.stepReviewRequested'),
    ).toBeVisible()
  })

  it.each([null, []])(
    'does not substitute live case text for unavailable or empty historical evidence (%j)',
    snapshot => {
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementDeviations
            item={{ ...item, deviationStateSnapshot: snapshot }}
            onChange={async () => {}}
            specificationId={1}
            view={{
              ...view,
              selectedAgreement: {
                ...agreement,
                state: 'previous',
                replacedAt: new Date('2026-08-01'),
              },
              deviations: [
                {
                  id: 8,
                  itemRef: item.itemRef,
                  motivation: 'Edited later',
                  isReviewRequested: 1,
                  createdAt: new Date('2026-07-01'),
                  updatedAt: new Date('2026-08-02'),
                  decision: null,
                  decisionMotivation: null,
                  decidedAt: null,
                },
              ],
            }}
          />
        </ConfirmModalProvider>,
      )
      expect(screen.queryByText('Edited later')).toBeNull()
      expect(screen.queryByRole('article', { name: 'Edited later' })).toBeNull()
      expect(screen.queryByText('deviation.stepReviewRequested')).toBeNull()
      expect(screen.queryByText('deviation.stepDraft')).toBeNull()
      expect(screen.queryAllByRole('article')).toHaveLength(snapshot ? 0 : 1)
      if (snapshot === null)
        expect(
          screen.getByText('agreement.missingHistoricalHelp'),
        ).toBeVisible()
    },
  )

  it('creates an avsteg against the selected upcoming agreement from the requirement list', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 12, ok: true })),
    )
    vi.stubGlobal('fetch', fetch)
    const onChange = vi.fn(async () => undefined)
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={item}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={onChange}
          specificationId={1}
          view={{
            ...view,
            canEditContent: false,
            selectedAgreement: { ...agreement, state: 'upcoming' },
          }}
        />
      </ConfirmModalProvider>,
    )
    await user.click(
      screen.getByRole('button', { name: 'deviation.requestDeviation' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'deviation.requestDeviation',
    })
    await user.type(
      within(dialog).getByRole('textbox'),
      'Exception for the upcoming agreement',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'deviation.newDeviation' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const request = requireTestValue(
      fetch.mock.calls.find(call => call[1]?.method === 'POST'),
    )
    expect(request[0]).toBe('/api/specification-item-deviations/lib%3A9')
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      agreementId: 2,
      motivation: 'Exception for the upcoming agreement',
    })
  })

  it('requires explicit cancellation with a reason before editing content with a pending deviation', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal('fetch', fetch)
    const onChange = vi.fn(async () => undefined)
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={item}
          needsReferencesResource={{
            data: [],
            loading: false,
            error: null,
            refreshing: false,
            refreshError: null,
            reload: async () => [],
          }}
          onChange={onChange}
          specificationId={1}
          view={{
            ...view,
            deviations: [
              {
                id: 8,
                itemRef: item.itemRef,
                motivation: 'Review needed',
                decision: null,
                decisionMotivation: null,
                decidedAt: null,
              },
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    expect(
      screen.getByRole('button', { name: 'agreement.editRequirement' }),
    ).toBeDisabled()
    expect(screen.getByText('agreement.pendingDeviationWarning')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'agreement.cancelDeviation' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'agreement.cancelDeviation',
    })
    expect(
      within(dialog).getByText('agreement.cancelDeviationExplanation'),
    ).toBeVisible()
    await user.type(
      within(dialog).getByRole('textbox', { name: /^agreement.reason/ }),
      'Revise the reviewed content',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'agreement.cancelDeviation' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      operation: 'cancel_deviation',
      agreementId: 2,
      itemRef: item.itemRef,
      deviationId: 8,
      reason: 'Revise the reviewed content',
    })
  })

  it('keeps removed draft content visible and restores it through the row undo action', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal('fetch', fetch)
    const onChange = vi.fn(async () => undefined)
    const needsReferencesResource = {
      data: [],
      loading: false,
      error: null,
      refreshing: false,
      refreshError: null,
      reload: async () => [],
    }
    const { rerender } = render(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={item}
          needsReferencesResource={needsReferencesResource}
          onChange={onChange}
          specificationId={1}
          view={view}
        />
      </ConfirmModalProvider>,
    )
    const actions = screen.getByRole('group', {
      name: 'agreement.requirementActionColumn',
    })
    const create = within(actions).getByRole('button', {
      name: 'deviation.requestDeviation',
    })
    const remove = within(actions).getByRole('button', {
      name: 'agreement.removeRequirement',
    })
    expect(
      create.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: 'agreement.removeRequirement' }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmation).getByRole('button', {
        name: 'agreement.removeRequirement',
      }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      operation: 'remove_requirement',
      agreementId: 2,
      itemRef: item.itemRef,
    })
    rerender(
      <ConfirmModalProvider>
        <SpecificationAgreementRequirement
          item={{
            ...item,
            isRemoved: true,
            changeKind: 'removed',
            changeDate: agreement.effectiveDate,
          }}
          needsReferencesResource={needsReferencesResource}
          onChange={onChange}
          specificationId={1}
          view={view}
        />
      </ConfirmModalProvider>,
    )
    expect(screen.getByText('Library original')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'agreement.editRequirement' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'agreement.undoRequirement' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      operation: 'undo_requirement',
      agreementId: 2,
      itemRef: item.itemRef,
    })
  })

  it.each([false, true])(
    'edits library content with the full form and explicit approval-ending consent when needed (%s)',
    async approved => {
      const user = userEvent.setup()
      const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST')
          return new Response(JSON.stringify({ itemRef: 'local:21' }))
        const catalogs: Record<string, unknown> = {
          'requirement-categories': { categories: [] },
          'requirement-types': { types: [] },
          'priority-levels': { priorityLevels: [] },
          'quality-characteristics': { qualityCharacteristics: [] },
          'norm-references': {
            normReferences: [
              { id: 11, name: 'Norm A', normReferenceId: 'NORM-A' },
            ],
          },
        }
        return new Response(
          JSON.stringify(
            Object.entries(catalogs).find(([path]) =>
              url.includes(path),
            )?.[1] ?? {},
          ),
        )
      })
      vi.stubGlobal('fetch', fetch)
      const onChange = vi.fn(async () => undefined)
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementRequirement
            item={{ ...item, currentAgreementReference: 'A' }}
            needsReferencesResource={{
              data: [{ id: 7, text: 'Need A' }],
              loading: false,
              error: null,
              refreshing: false,
              refreshError: null,
              reload: async () => [],
            }}
            onChange={onChange}
            specificationId={1}
            view={
              approved
                ? {
                    ...view,
                    deviations: [
                      {
                        id: 8,
                        itemRef: item.itemRef,
                        motivation: 'Approved exception',
                        decision: 1,
                        decisionMotivation: 'Approved',
                        decidedAt: new Date('2026-01-01'),
                      },
                    ],
                  }
                : view
            }
          />
        </ConfirmModalProvider>,
      )
      await user.click(
        screen.getByRole('button', { name: 'agreement.editRequirement' }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agreement.editRequirement',
      })
      expect(
        within(dialog).getByText('agreement.localConversionWarning'),
      ).toBeVisible()
      expect(
        within(dialog).getByRole('textbox', {
          name: /requirement.acceptanceCriteria/,
        }),
      ).toHaveValue('Original criteria')
      expect(
        within(dialog).getByRole('textbox', {
          name: /requirement.verificationMethod/,
        }),
      ).toHaveValue('Original method')
      expect(
        fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
      ).toHaveLength(0)
      fireEvent.change(
        within(dialog).getByRole('textbox', {
          name: /requirement.description/,
        }),
        { target: { value: 'Negotiated content' } },
      )
      if (approved)
        expect(
          within(dialog).getByText('agreement.plannedEndingWarning'),
        ).toBeVisible()
      const save = within(dialog).getByRole('button', {
        name: approved ? 'agreement.saveAndPlanEnding' : 'common.save',
      })
      await waitFor(() => expect(save).toBeEnabled())
      await user.click(save)
      await waitFor(() => expect(onChange).toHaveBeenCalledWith('local:21'))
      const posted = fetch.mock.calls.find(
        ([, init]) => init?.method === 'POST',
      )
      expect(JSON.parse(String(posted?.[1]?.body))).toEqual({
        operation: 'save_requirement',
        agreementId: 2,
        itemRef: 'lib:9',
        ...(approved ? { authorizeDeviationEndings: true } : {}),
        content: {
          description: 'Negotiated content',
          acceptanceCriteria: 'Original criteria',
          verifiable: true,
          verificationMethod: 'Original method',
          needsReferenceId: 7,
          normReferenceIds: [11],
          requirementCategoryId: null,
          requirementTypeId: null,
          qualityCharacteristicId: null,
          priorityLevelId: null,
        },
      })
    },
  )
})
