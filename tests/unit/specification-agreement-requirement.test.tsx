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
import enMessages from '@/messages/en.json'
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
    const t = (key: string, values?: Record<string, unknown>) =>
      namespace === 'deviation' && key === 'validThroughValue'
        ? enMessages.deviation.validThroughValue.replace(
            '{date}',
            String(values?.date),
          )
        : `${namespace}.${key}`
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

  it.each(
    [2, 3, 4, 5, 6].flatMap(statusId =>
      (['lib:9', 'local:9'] as const).flatMap(itemRef =>
        [true, false].map(draft => ({ statusId, itemRef, draft })),
      ),
    ),
  )(
    'explains why $itemRef usage status $statusId prevents removal (draft: $draft)',
    async ({ statusId, itemRef, draft }) => {
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementRequirement
            item={{ ...item, itemRef, specificationItemStatusId: statusId }}
            needsReferencesResource={{
              data: [],
              loading: false,
              error: null,
              refreshing: false,
              refreshError: null,
              reload: async () => [],
            }}
            onChange={async () => {}}
            onRemoveFromSpecification={() => {}}
            specificationId={1}
            view={{ ...view, selectedAgreement: draft ? agreement : null }}
          />
        </ConfirmModalProvider>,
      )
      const remove = screen.getByRole('button', {
        name: 'agreement.removeRequirement',
      })
      expect(remove).toHaveAttribute('aria-disabled', 'true')
      expect(remove).toHaveAccessibleDescription(
        'agreement.removalRequiresIncluded',
      )
      await userEvent.click(remove)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    },
  )

  it.each([true, false])(
    'keeps future-ending approval consent and authorization safeguards (responsible: %s)',
    async canDecide => {
      const fetchMock = vi.fn(
        async (_url: string, _init?: RequestInit) => new Response('{}'),
      )
      vi.stubGlobal('fetch', fetchMock)
      const onChange = vi.fn()
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementRequirement
            item={{ ...item, currentAgreementReference: 'A' }}
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
              canDecide,
              deviations: [
                {
                  id: 8,
                  itemRef: item.itemRef,
                  motivation: 'Permission',
                  decision: 1,
                  decisionMotivation: 'Approved',
                  decidedAt: new Date('2020-01-01'),
                },
              ],
              deviationEndings: [
                {
                  id: 1,
                  itemRef: item.itemRef,
                  deviationId: 8,
                  agreementId: 2,
                  endedAt: new Date('2099-01-01'),
                  cancelledAt: null,
                },
              ],
            }}
          />
        </ConfirmModalProvider>,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'agreement.removeRequirement' }),
      )
      if (!canDecide) {
        expect(
          screen.getByText('agreement.responsibleEndingRequired'),
        ).toBeInTheDocument()
        expect(fetchMock).not.toHaveBeenCalled()
        return
      }
      const confirmation = await screen.findByRole('alertdialog')
      expect(confirmation).toHaveTextContent('agreement.plannedEndingWarning')
      await userEvent.click(
        within(confirmation).getByRole('button', {
          name: 'agreement.saveAndPlanEnding',
        }),
      )
      await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
      expect(
        JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
      ).toMatchObject({
        operation: 'remove_requirement',
        authorizeDeviationEndings: true,
      })
    },
  )

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
    expect(
      screen.getByRole('button', { name: 'agreement.removeRequirement' }),
    ).toHaveAccessibleDescription('agreement.pendingDeviationWarning')
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

describe('approval validity and follow-up in the selected agreement', () => {
  const approval = {
    id: 17,
    itemRef: item.itemRef,
    motivation: 'Temporary access exception',
    decision: 1,
    decisionMotivation: 'Accepted with controls',
    decidedAt: new Date('2020-01-01'),
    createdAt: new Date('2019-12-01'),
    conditions: 'Weekly access review',
    validThrough: '2020-09-30',
    agreementReferences: 'A, B',
  }
  const approvalView = { ...view, deviations: [approval] }

  it.each([
    { validThrough: null, endedAt: null, canClose: true },
    { validThrough: '2099-09-30', endedAt: null, canClose: true },
    { validThrough: '2020-09-30', endedAt: null, canClose: false },
    {
      validThrough: null,
      endedAt: new Date('2099-01-01'),
      canClose: false,
    },
  ])(
    'offers closure only for applicable approvals without recorded endings: %j',
    ({ validThrough, endedAt, canClose }) => {
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementDeviations
            item={item}
            onChange={vi.fn()}
            specificationId={5}
            view={{
              ...approvalView,
              deviations: [{ ...approval, validThrough }],
              deviationEndings: endedAt
                ? [
                    {
                      id: 1,
                      itemRef: item.itemRef,
                      deviationId: approval.id,
                      agreementId: 2,
                      endedAt,
                      cancelledAt: null,
                    },
                  ]
                : [],
            }}
          />
        </ConfirmModalProvider>,
      )
      const close = screen.queryByRole('button', {
        name: 'deviation.closeApproval',
      })
      if (canClose) {
        expect(close).toHaveAttribute(
          'data-developer-mode-value',
          'end applicable shared permission without pending renewal',
        )
      } else {
        expect(close).toBeNull()
      }
      expect(
        screen.getByRole('button', { name: 'deviation.renewDeviation' }),
      ).toBeEnabled()
    },
  )

  it.each([0, 1])(
    'withholds closure and renewal while a renewal is pending with review requested %s',
    isReviewRequested => {
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementDeviations
            item={item}
            onChange={vi.fn()}
            specificationId={5}
            view={{
              ...approvalView,
              deviations: [
                { ...approval, validThrough: null },
                {
                  ...approval,
                  id: 18,
                  decision: null,
                  decidedAt: null,
                  isReviewRequested,
                  renewsDeviationId: approval.id,
                  motivation: 'Continued permission',
                },
              ],
            }}
          />
        </ConfirmModalProvider>,
      )
      expect(
        screen.getByRole('article', { name: 'Continued permission' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'deviation.closeApproval' }),
      ).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'deviation.renewDeviation' }),
      ).toBeNull()
    },
  )

  it('shows expiry beside the unchanged usage status and clears follow-up only for Verified', () => {
    const props = { specificationId: 5, onChange: vi.fn(), view: approvalView }
    const rendered = render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          {...props}
          item={{ ...item, specificationItemStatusId: 5 }}
        />
      </ConfirmModalProvider>,
    )
    expect(
      screen.getByText('deviation.applicability.expired'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Weekly access review/)).toBeInTheDocument()
    expect(screen.getByText('Valid through 2020-09-30')).toHaveAttribute(
      'data-developer-mode-value',
      'inclusive calendar end date',
    )
    expect(screen.getByText('deviation.endedFollowup')).toHaveAttribute(
      'role',
      'status',
    )
    rendered.rerender(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          {...props}
          item={{ ...item, specificationItemStatusId: 4 }}
        />
      </ConfirmModalProvider>,
    )
    expect(screen.queryByText('deviation.endedFollowup')).toBeNull()
    rendered.rerender(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          {...props}
          item={{ ...item, specificationItemStatusId: 3 }}
        />
      </ConfirmModalProvider>,
    )
    expect(screen.getByText('deviation.endedFollowup')).toBeInTheDocument()
  })

  it('shows the shared scope when requesting renewal and sends the original approval link', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'))
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={vi.fn()}
          specificationId={5}
          view={approvalView}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.renewDeviation' }),
    )
    expect(
      screen.getByText('deviation.sharedApprovalScope'),
    ).toBeInTheDocument()
    await userEvent.type(
      screen.getByRole('textbox', { name: /deviation.motivation/ }),
      'Continue the reviewed departure',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.newDeviation' }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      renewsDeviationId: 17,
      agreementId: 2,
      motivation: 'Continue the reviewed departure',
    })
    fetchMock.mockRestore()
  })

  it.each([null, '2020-09-30'])(
    'requires a fresh request after manual closure, including when validThrough is %s',
    async validThrough => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}'))
      render(
        <ConfirmModalProvider>
          <SpecificationAgreementDeviations
            item={item}
            onChange={vi.fn()}
            specificationId={5}
            view={{
              ...approvalView,
              deviations: [{ ...approval, validThrough }],
              deviationEndings: [
                {
                  id: 1,
                  itemRef: item.itemRef,
                  deviationId: approval.id,
                  agreementId: null,
                  endedAt: new Date('2021-01-01'),
                  cancelledAt: null,
                  endingKind: 'closed',
                  reason: 'Resolved',
                },
              ],
            }}
          />
        </ConfirmModalProvider>,
      )
      expect(
        screen.queryByRole('button', { name: 'deviation.renewDeviation' }),
      ).toBeNull()
      const request = screen.getByRole('button', {
        name: 'deviation.requestDeviation',
      })
      expect(request).toHaveAttribute(
        'data-developer-mode-value',
        'new request without renewal link',
      )
      await userEvent.click(request)
      await userEvent.type(
        screen.getByRole('textbox', { name: /deviation.motivation/ }),
        'A new need for permission',
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'deviation.newDeviation' }),
      )
      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
        agreementId: 2,
        motivation: 'A new need for permission',
      })
      fetchMock.mockRestore()
    },
  )

  it('keeps frozen approval applicable and shows later expiry separately', async () => {
    const frozen = {
      ...approvalView,
      selectedAgreement: {
        ...agreement,
        state: 'previous',
        replacedAt: new Date('2020-06-01'),
      },
    }
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={{
            ...item,
            deviationStateSnapshot: [
              { id: 17, motivation: approval.motivation, isReviewRequested: 1 },
            ],
          }}
          onChange={vi.fn()}
          showLaterEvents
          specificationId={5}
          view={frozen}
        />
      </ConfirmModalProvider>,
    )
    expect(
      screen.getByText('deviation.applicability.applicable'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByText('agreement.laterEvents'))
    expect(
      screen.getByText('deviation.applicability.expired'),
    ).toBeInTheDocument()
    expect(screen.queryByText('deviation.endedFollowup')).toBeNull()
  })
  it('renders an anonymized closure actor without exposing the internal sentinel', () => {
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={vi.fn()}
          specificationId={1}
          view={{
            ...view,
            selectedAgreement: null,
            deviations: [
              {
                id: 7,
                itemRef: item.itemRef,
                decision: 1,
                decidedAt: new Date('2025-01-01'),
                motivation: 'Temporary departure',
                decisionMotivation: 'Approved',
              },
            ],
            deviationEndings: [
              {
                id: 1,
                itemRef: item.itemRef,
                deviationId: 7,
                agreementId: null,
                endedAt: new Date('2025-02-01'),
                cancelledAt: null,
                endingKind: 'closed',
                reason: 'Resolved',
                recordedBy: 'no-user',
              },
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    expect(screen.getByText(/Anonymous/)).toBeInTheDocument()
    expect(screen.queryByText(/no-user/)).not.toBeInTheDocument()
  })
  it('closes shared approval with a reason and refreshes the agreement', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'))
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={onChange}
          specificationId={5}
          view={{
            ...approvalView,
            deviations: [{ ...approval, validThrough: null }],
          }}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.closeApproval' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'deviation.closeApproval',
    })
    expect(
      within(dialog).getByText('deviation.closeApprovalHelp'),
    ).toBeVisible()
    expect(
      within(dialog).getByText('deviation.sharedApprovalScope'),
    ).toBeVisible()
    const submit = within(dialog).getByRole('button', {
      name: 'deviation.closeApproval',
    })
    expect(submit).toBeDisabled()
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /agreement.reason/ }),
      '  Controls are now implemented  ',
    )
    await userEvent.click(submit)
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirements-specifications/5/agreement',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          operation: 'close_deviation',
          itemRef: item.itemRef,
          deviationId: 17,
          reason: 'Controls are now implemented',
          agreementId: 2,
        }),
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fetchMock.mockRestore()
  })

  it('keeps a failed closure open for retry and allows cancellation without a mutation', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network unavailable'))
    const onChange = vi.fn()
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={onChange}
          specificationId={5}
          view={{
            ...approvalView,
            deviations: [{ ...approval, validThrough: null }],
          }}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.closeApproval' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'deviation.closeApproval',
    })
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /agreement.reason/ }),
      'Permission is no longer needed',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'deviation.closeApproval' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'deviation.saveFailed',
    )
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(
      within(dialog).getAllByRole('button', { name: 'common.close' })[1],
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    fetchMock.mockRestore()
  })

  it('forwards renewal approval terms through the local review endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'))
    const onChange = vi.fn().mockResolvedValue(undefined)
    const localItem = { ...item, itemRef: 'local:9' as const }
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={localItem}
          onChange={onChange}
          specificationId={5}
          view={{
            ...view,
            canReviewDeviations: true,
            deviations: [
              {
                ...approval,
                itemRef: localItem.itemRef,
                decision: null,
                isReviewRequested: 1,
                renewsDeviationId: 16,
              },
            ],
          }}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.recordDecision' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'deviation.recordDecision',
    })
    expect(
      within(dialog).getByText('deviation.sharedApprovalScope'),
    ).toBeVisible()
    await userEvent.type(
      within(dialog).getByLabelText(/deviation.decisionMotivation/, {
        selector: 'textarea',
      }),
      'Renewal accepted',
    )
    await userEvent.type(
      within(dialog).getByLabelText('deviation.conditions', {
        selector: 'textarea',
      }),
      'Monthly review',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'deviation.recordDecision' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/specification-local-deviations/17/decision',
      expect.objectContaining({
        body: JSON.stringify({
          decision: 1,
          decisionMotivation: 'Renewal accepted',
          conditions: 'Monthly review',
          validThrough: null,
          agreementId: 2,
        }),
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fetchMock.mockRestore()
  })
  it('cancels renewal without saving and restores the ordinary request state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={vi.fn()}
          specificationId={5}
          view={approvalView}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.renewDeviation' }),
    )
    const dialog = screen.getByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'common.cancel' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'deviation.renewDeviation' }),
    ).toBeEnabled()
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockRestore()
  })
  it('requests review and confirms returning the shared request to draft', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}'))
    const onChange = vi.fn().mockResolvedValue(undefined)
    const pending = { ...approval, decision: null, isReviewRequested: 0 }
    const rendered = render(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={onChange}
          specificationId={5}
          view={{ ...view, deviations: [pending] }}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.requestReview' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/deviations/17/request-review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agreementId: 2 }),
      }),
    )
    rendered.rerender(
      <ConfirmModalProvider>
        <SpecificationAgreementDeviations
          item={item}
          onChange={onChange}
          specificationId={5}
          view={{ ...view, deviations: [{ ...pending, isReviewRequested: 1 }] }}
        />
      </ConfirmModalProvider>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.revertToDraft' }),
    )
    const confirmation = screen.getByRole('alertdialog', {
      name: 'deviation.revertToDraftConfirmTitle',
    })
    expect(
      within(confirmation).getByText('deviation.revertToDraftConfirm'),
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledOnce()
    await userEvent.click(
      within(confirmation).getByRole('button', { name: 'common.confirm' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/deviations/17/revert-to-draft',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agreementId: 2 }),
      }),
    )
    fetchMock.mockRestore()
  })
})
