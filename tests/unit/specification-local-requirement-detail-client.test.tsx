import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationLocalRequirementDetailClient from '@/components/SpecificationLocalRequirementDetailClient'

const emptyNeedsReferencesResource = {
  data: [],
  error: null,
  loading: false,
  refreshError: null,
  refreshing: false,
  reload: async () => [],
}

const confirmMock = vi.fn(async () => false)
const routerPushMock = vi.fn()
const deviationFormRenderSpy = vi.hoisted(() => vi.fn())
const translations: Record<string, string> = {
  'common.cancel': 'Cancel',
  'common.createdAt': 'Created',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.error': 'Error',
  'common.no': 'No',
  'common.noneAvailable': 'None available',
  'common.save': 'Save',
  'common.unsavedChangesConfirm': 'Discard unsaved changes?',
  'common.unexpectedError': 'Unexpected error',
  'common.updatedAt': 'Updated',
  'common.yes': 'Yes',
  'deviation.createFailed': 'Create deviation failed',
  'deviation.decisionFailed': 'Deviation decision failed',
  'deviation.deleteFailed': 'Delete deviation failed',
  'deviation.deleteDeviation': 'Delete deviation',
  'deviation.editDeviation': 'Edit deviation',
  'deviation.fetchFailed': 'Fetch deviation failed',
  'deviation.markDecided': 'Mark decided',
  'deviation.requestDeviation': 'Request deviation',
  'deviation.requestReview': 'Request review',
  'deviation.reviewRequestFailed': 'Review request failed',
  'deviation.revertFailed': 'Revert failed',
  'deviation.revertToDraft': 'Revert to draft',
  'deviation.title': 'Deviation',
  'specification.deleteLocalRequirementConfirm': 'Delete this requirement?',
  'specification.deleteLocalRequirementConfirmTitle':
    'Delete unique requirement',
  'specification.localRequirementActionDisabledTooltip':
    'This unique requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
  'specification.graduateLocalRequirement': 'Graduate to library',
  'specification.graduateLocalRequirementConfirm':
    'Create a new draft library requirement from this unique requirement? The unique requirement stays in this specification.',
  'specification.graduateLocalRequirementConfirmText': 'Graduate',
  'specification.graduateLocalRequirementConfirmTitle':
    'Graduate unique requirement',
  'specification.graduateLocalRequirementFailed':
    'Could not graduate the unique requirement.',
  'specification.graduateLocalRequirementTargetHelp':
    'Choose the library requirement area where the copied draft requirement should be created.',
  'specification.graduateLocalRequirementTargetLabel': 'Requirement area',
  'specification.editLocalRequirement': 'Edit unique requirement',
  'specification.localRequirementNotFound': 'Unique requirement not found',
  'specification.needsReference': 'Needs reference',
  'requirement.acceptanceCriteria': 'Acceptance criteria',
  'requirement.area': 'Requirement area',
  'requirement.category': 'Category',
  'requirement.description': 'Requirement text',
  'requirement.normReferences': 'Norm references',
  'requirement.specificationItemStatus': 'Usage status',
  'requirement.specificationLocalBadge': 'Unique',
  'requirement.specificationLocalTooltip': 'This row is a unique requirement.',
  'requirement.qualityCharacteristic': 'Quality characteristic',
  'requirement.verifiable': 'Verifiable',
  'requirement.priorityLevel': 'Priority',
  'requirement.requirementPackage': 'RequirementPackage',
  'requirement.type': 'Type',
  'requirement.verificationMethod': 'Verification method',
}
const translationFns = new Map<string, (key: string) => string>()

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => {
    if (!translationFns.has(namespace)) {
      translationFns.set(
        namespace,
        (key: string) =>
          translations[`${namespace}.${key}`] ?? `${namespace}.${key}`,
      )
    }

    // biome-ignore lint/style/noNonNullAssertion: test mock always sets the entry above
    return translationFns.get(namespace)!
  },
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/DeviationDecisionModal', () => ({
  default: (props: {
    onClose: () => void
    onSubmit: (decision: 1 | 2, motivation: string) => Promise<void>
    open: boolean
  }) =>
    props.open ? (
      <div aria-label="Decision dialog" role="dialog">
        <button onClick={() => props.onSubmit(1, 'Approved')} type="button">
          Submit decision
        </button>
        <button onClick={props.onClose} type="button">
          Close decision
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/DeviationFormModal', () => ({
  default: (props: {
    onClose: () => void
    onSubmit: (motivation: string) => Promise<void>
    open: boolean
    [key: string]: unknown
  }) => {
    deviationFormRenderSpy(props)
    return props.open ? (
      <div aria-label="Deviation form dialog" role="dialog">
        <button onClick={() => props.onSubmit('Because')} type="button">
          Submit deviation
        </button>
        <button onClick={() => props.onSubmit('')} type="button">
          Submit empty deviation
        </button>
        <button onClick={props.onClose} type="button">
          Close deviation
        </button>
      </div>
    ) : null
  },
}))

vi.mock('@/components/DeviationPill', () => ({
  default: () => <div data-testid="deviation-pill" />,
}))

vi.mock('@/components/DeviationStepper', () => ({
  default: () => <div data-testid="deviation-stepper" />,
}))

vi.mock('@/components/SpecificationLocalRequirementForm', () => ({
  default: function MockSpecificationLocalRequirementForm(props: {
    onCancel?: () => void
    onDirtyChange?: (dirty: boolean) => void
    onSubmit?: (payload: { description: string }) => Promise<void>
  }) {
    const [error, setError] = useState<string | null>(null)
    return (
      <div data-testid="specification-local-form">
        <button onClick={() => props.onDirtyChange?.(true)} type="button">
          Mark local form dirty
        </button>
        <button
          onClick={() =>
            props
              .onSubmit?.({ description: 'Updated' })
              .catch(submissionError =>
                setError(
                  submissionError instanceof Error
                    ? submissionError.message
                    : 'Unknown edit error',
                ),
              )
          }
          type="button"
        >
          Submit local form
        </button>
        <button onClick={props.onCancel} type="button">
          Cancel local form
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    )
  },
}))

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

function okJson(body: unknown) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
  } as Response)
}

function errorJson(body: unknown) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: false,
  } as Response)
}

function createDeferredJsonResponse() {
  let resolve: (body: unknown) => void = () => {}
  const promise = new Promise<Response>(promiseResolve => {
    resolve = body => {
      promiseResolve({
        json: () => Promise.resolve(body),
        ok: true,
      } as Response)
    }
  })

  return {
    promise,
    resolve,
  }
}

function localRequirement(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    acceptanceCriteria: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    description: 'Local requirement',
    id: 1,
    itemRef: 'local:1',
    needsReference: null,
    needsReferenceId: null,
    normReferences: [],
    priorityLevel: null,
    qualityCharacteristic: null,
    requirementArea: null,
    requirementCategory: null,
    requirementPackages: [],
    requirementType: null,
    specificationId: 1,
    specificationItemStatusColor: '#16a34a',
    specificationItemStatusIconName: null,
    specificationItemStatusId: 1,
    specificationItemStatusNameEn: 'Included',
    specificationItemStatusNameSv: 'Inkluderad',
    uniqueId: 'KRAV0001',
    updatedAt: '2026-04-02T00:00:00.000Z',
    verifiable: false,
    verificationMethod: null,
    ...overrides,
  }
}

function mockWorkflow(options?: {
  areas?: { id: number; name: string; prefix: string }[]
  deviations?: Record<string, unknown>[]
  detail?: Record<string, unknown>
  mutation?: () => Promise<Response>
}) {
  const detail = options?.detail ?? localRequirement()
  const deviations = options?.deviations ?? []
  const areas = options?.areas ?? [{ id: 2, name: 'Security', prefix: 'SEC' }]
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = String(input)
    if (url.includes('graduation-target-areas')) {
      return okJson({ areas })
    }
    if (url.includes('specification-item-deviations')) {
      return init?.method === 'POST'
        ? (options?.mutation?.() ?? okJson({ ok: true }))
        : okJson({ deviations })
    }
    if (url.includes('specification-local-deviations')) {
      return options?.mutation?.() ?? okJson({ ok: true })
    }
    if (init?.method) {
      return options?.mutation?.() ?? okJson({ ok: true })
    }
    return okJson(detail)
  })
}

function draftDeviation(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-04-02T00:00:00.000Z',
    createdBy: 'Test User',
    decidedAt: null,
    decidedBy: null,
    decision: null,
    decisionMotivation: null,
    id: 11,
    isReviewRequested: 0,
    motivation: 'A reason',
    ...overrides,
  }
}

const editablePermissions = {
  canEditContent: true,
  canReviewDecisions: true,
}

describe('SpecificationLocalRequirementDetailClient', () => {
  beforeEach(() => {
    confirmMock.mockResolvedValue(false)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => okJson({ areas: [] })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('reuses the shared detail card layout and catalog-style action column', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Specification local description',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [
            {
              id: 11,
              name: 'ISO 27001',
              normReferenceId: 'ISO27001',
              uri: 'https://example.com/iso27001',
            },
          ],
          specificationId: 8,
          specificationItemStatusColor: '#16a34a',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristic: {
            id: 5,
            nameEn: 'Security',
            nameSv: 'Sakerhet',
          },
          requirementArea: null,
          requirementCategory: {
            id: 3,
            nameEn: 'Functional',
            nameSv: 'Funktionell',
          },
          requirementType: {
            id: 4,
            nameEn: 'Capability',
            nameSv: 'Formaga',
          },
          verifiable: true,
          priorityLevel: {
            code: 'P4',
            color: '#dc2626',
            iconName: 'ArrowUpRight',
            id: 2,
            nameEn: 'High',
            nameSv: 'Hog',
            sortOrder: 4,
          },
          requirementPackages: [],
          uniqueId: 'KRAV0001',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: 'Review',
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))
      .mockImplementationOnce(() =>
        okJson({ areas: [{ id: 2, name: 'Security', prefix: 'SEC' }] }),
      )

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByText('Specification local description'),
    ).toBeInTheDocument()
    expect(screen.getByText('Acceptance criteria')).toBeInTheDocument()
    expect(
      screen.getByText('Specification local acceptance'),
    ).toBeInTheDocument()
    const detailCard = screen
      .getByText('Specification local description')
      .closest('div[class~="rounded-2xl"]')
    expect(detailCard).toHaveClass('rounded-2xl', 'p-6', 'space-y-5', 'text-sm')
    expect(screen.getByText('Requirement area')).toBeInTheDocument()
    expect(screen.queryByText('Integration')).not.toBeInTheDocument()
    expect(screen.getByText('Norm references')).toBeInTheDocument()
    expect(screen.getByText('ISO27001')).toBeInTheDocument()
    const detailPriorityBadge = screen
      .getByText('P4 – Hog')
      .closest('.status-badge')
    expect(detailPriorityBadge).toHaveAttribute('data-accent-color', '#dc2626')
    expect(detailPriorityBadge?.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('RequirementPackage')).not.toBeInTheDocument()
    expect(screen.queryByText('KRAV0001')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Print' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Deviation')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Only exists in this specification.'),
    ).not.toBeInTheDocument()

    expect(deviationFormRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        priorityLevel: {
          code: 'P4',
          color: '#dc2626',
          iconName: 'ArrowUpRight',
          id: 2,
          name: 'Hog',
          sortOrder: 4,
        },
      }),
    )

    const editButton = await screen.findByRole('button', { name: 'Edit' })
    expect(editButton).toHaveAttribute(
      'data-developer-mode-name',
      'detail action',
    )
    expect(editButton).toBeEnabled()
    expect(editButton).toHaveAttribute(
      'data-developer-mode-value',
      'edit local requirement',
    )
    expect(editButton.className).toContain('min-h-11')
    expect(editButton.className).toContain('min-w-11')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-developer-mode-value',
      'delete local requirement',
    )
    const inlineInset = screen
      .getByText('Specification local description')
      .closest('div[class~="px-6"]')
    expect(inlineInset).toHaveClass('py-4')
  })

  it('opens unique requirement editing in a modal without replacing the inline detail', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Editable unique requirement',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [],
          specificationId: 8,
          specificationItemStatusColor: '#16a34a',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristic: null,
          requirementArea: null,
          requirementCategory: null,
          requirementType: null,
          verifiable: false,
          priorityLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0001',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))
      .mockImplementationOnce(() =>
        okJson({ areas: [{ id: 2, name: 'Security', prefix: 'SEC' }] }),
      )

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByText('Editable unique requirement'),
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    const dialog = screen.getByRole('dialog', {
      name: 'Edit unique requirement',
    })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('KRAV0001')).toBeInTheDocument()
    expect(
      within(dialog).getByTestId('specification-local-form'),
    ).toBeInTheDocument()
    expect(screen.getByText('Editable unique requirement')).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Mark local form dirty',
      }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: 'caution',
        message: 'Discard unsaved changes?',
        variant: 'danger',
      }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Edit unique requirement' }),
    ).toBeInTheDocument()
  })

  it('waits for graduation eligibility before showing the action rail', async () => {
    const graduationTargets = createDeferredJsonResponse()

    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Stable action rail requirement',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [],
          specificationId: 8,
          specificationItemStatusColor: '#16a34a',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristic: null,
          requirementArea: null,
          requirementCategory: null,
          requirementType: null,
          verifiable: false,
          priorityLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0001',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))
      .mockImplementationOnce(() => graduationTargets.promise)

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByText('Stable action rail requirement'),
    ).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Graduate to library' }),
    ).toBeNull()

    await act(async () => {
      graduationTargets.resolve({
        areas: [{ id: 2, name: 'Security', prefix: 'SEC' }],
      })
    })

    expect(
      await screen.findByRole('button', { name: 'Graduate to library' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('graduates an Included unique requirement into the selected library requirement area', async () => {
    const onChange = vi.fn()
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Specification local description',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [],
          specificationId: 8,
          specificationItemStatusColor: '#16a34a',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristic: null,
          requirementArea: null,
          requirementCategory: null,
          requirementType: null,
          verifiable: false,
          priorityLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0001',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))
      .mockImplementationOnce(() =>
        okJson({
          areas: [
            { id: 2, name: 'Security', prefix: 'SEC' },
            { id: 3, name: 'Privacy', prefix: 'PRI' },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        okJson({
          detail: { uniqueId: 'SEC0001' },
          newRequirementUniqueId: 'SEC0001',
          newRequirementVersionNumber: 1,
          ok: true,
        }),
      )

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        onChange={onChange}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    await screen.findByText('Specification local description')

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Graduate to library' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Graduate unique requirement',
    })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.parentElement?.firstElementChild).toHaveClass('bg-black/45')
    expect(
      screen.getByText(
        'Create a new draft library requirement from this unique requirement? The unique requirement stays in this specification.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Requirement area')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Graduate' }))

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith('/requirements/SEC0001/1')
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(confirmMock).not.toHaveBeenCalled()

    const graduateCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/graduate'))
    expect(graduateCall?.[1]).toMatchObject({
      method: 'POST',
    })
    expect(JSON.parse(String(graduateCall?.[1]?.body))).toEqual({
      requirementAreaId: 2,
    })
  })

  it('keeps graduation enabled when usage status is not Included', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Locked unique requirement',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [],
          specificationId: 8,
          specificationItemStatusColor: '#f59e0b',
          specificationItemStatusId: 2,
          specificationItemStatusNameEn: 'Ongoing',
          specificationItemStatusNameSv: 'Pågående',
          qualityCharacteristic: null,
          requirementArea: null,
          requirementCategory: null,
          requirementType: null,
          verifiable: false,
          priorityLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0002',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))
      .mockImplementationOnce(() =>
        okJson({ areas: [{ id: 2, name: 'Security', prefix: 'SEC' }] }),
      )

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByText('Locked unique requirement'),
    ).toBeInTheDocument()
    const editButton = await screen.findByRole('button', { name: 'Edit' })
    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    const graduateButton = await screen.findByRole('button', {
      name: 'Graduate to library',
    })

    expect(editButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(graduateButton).toBeEnabled()
    expect(editButton.className).toContain('disabled:cursor-not-allowed')
    expect(deleteButton.className).toContain('btn-destructive')
    expect(deleteButton.className).not.toContain('disabled:text-secondary-400')
    expect(editButton.parentElement).toHaveAttribute(
      'title',
      'This unique requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
    )
    expect(deleteButton.parentElement).toHaveAttribute(
      'title',
      'This unique requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
    )
    expect(graduateButton.parentElement).not.toHaveAttribute('title')
  })

  it('updates edit and delete availability when the row usage status changes', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Status synced unique requirement',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [],
          specificationId: 8,
          specificationItemStatusColor: '#94a3b8',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristic: null,
          requirementArea: null,
          requirementCategory: null,
          requirementType: null,
          verifiable: false,
          priorityLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0004',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))
      .mockImplementationOnce(() =>
        okJson({ areas: [{ id: 2, name: 'Security', prefix: 'SEC' }] }),
      )

    const { rerender } = render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
        usageStatus={{
          specificationItemStatusColor: '#94a3b8',
          specificationItemStatusIconName: null,
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
        }}
      />,
    )

    expect(
      await screen.findByText('Status synced unique requirement'),
    ).toBeInTheDocument()

    const editButton = await screen.findByRole('button', { name: 'Edit' })
    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    const graduateButton = await screen.findByRole('button', {
      name: 'Graduate to library',
    })

    expect(editButton).toBeEnabled()
    expect(deleteButton).toBeEnabled()

    rerender(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
        usageStatus={{
          specificationItemStatusColor: '#f59e0b',
          specificationItemStatusIconName: 'Play',
          specificationItemStatusId: 2,
          specificationItemStatusNameEn: 'In Progress',
          specificationItemStatusNameSv: 'Pågående',
        }}
      />,
    )

    expect(await screen.findByText('Pågående')).toBeInTheDocument()
    await waitFor(() => {
      expect(editButton).toBeDisabled()
      expect(deleteButton).toBeDisabled()
    })
    expect(graduateButton).toBeEnabled()
    expect(editButton.parentElement).toHaveAttribute(
      'title',
      'This unique requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
    )
  })

  it('disables edit and delete when a deviation is pending', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Pending deviation requirement',
          id: 1,
          itemRef: 'local:1',
          needsReference: 'Need A',
          needsReferenceId: 3,
          normReferences: [],
          specificationId: 8,
          specificationItemStatusColor: '#16a34a',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristic: null,
          requirementArea: null,
          requirementCategory: null,
          requirementType: null,
          verifiable: false,
          priorityLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0003',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() =>
        okJson({
          deviations: [
            {
              createdAt: '2026-04-02T00:00:00.000Z',
              createdBy: 'Test User',
              decidedAt: null,
              decidedBy: null,
              decision: null,
              decisionMotivation: null,
              id: 11,
              isReviewRequested: 1,
              motivation: 'Pending review',
            },
          ],
        }),
      )

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByText('Pending deviation requirement'),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('deviation-pill')).toBeInTheDocument()
    })

    const editButton = screen.getByRole('button', { name: 'Edit' })
    const deleteButton = screen.getByRole('button', { name: 'Delete' })

    expect(editButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(editButton.className).toContain('disabled:cursor-not-allowed')
    expect(deleteButton.className).toContain('btn-destructive')
    expect(deleteButton.className).not.toContain('disabled:text-secondary-400')
    expect(editButton.parentElement).toHaveAttribute(
      'title',
      'This unique requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
    )
  })

  it('surfaces server and network failures while loading the requirement', async () => {
    vi.mocked(fetch).mockImplementationOnce(() =>
      errorJson({ error: 'Requirement access denied' }),
    )
    const { unmount } = render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        specificationId={1}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Requirement access denied',
    )
    unmount()

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network unavailable'))
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={2}
        needsReferencesResource={emptyNeedsReferencesResource}
        specificationId={1}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network unavailable',
    )
  })

  it('deletes an included unique requirement after confirmation', async () => {
    const onChange = vi.fn()
    confirmMock.mockResolvedValue(true)
    mockWorkflow()
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        onChange={onChange}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Delete this requirement?',
        variant: 'danger',
      }),
    )
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE'),
    ).toBe(true)
  })

  it('surfaces a failed unique requirement deletion', async () => {
    confirmMock.mockResolvedValue(true)
    mockWorkflow({ mutation: () => errorJson(null) })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error')
  })

  it('saves edits, refreshes the detail, and closes the edit dialog', async () => {
    const onChange = vi.fn()
    const reload = vi.fn(async () => [])
    mockWorkflow()
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={{
          ...emptyNeedsReferencesResource,
          data: undefined,
          reload,
        }}
        onChange={onChange}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(reload).toHaveBeenCalledTimes(1)
    const detailPath = '/api/requirements-specifications/1/local-requirements/1'
    const detailGetCount = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input, init]) => String(input) === detailPath && !init?.method,
        ).length
    const detailGetsBeforeSubmit = detailGetCount()
    await user.click(screen.getByRole('button', { name: 'Submit local form' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit unique requirement' }),
      ).toBeNull(),
    )
    expect(detailGetCount()).toBeGreaterThan(detailGetsBeforeSubmit)
    expect(onChange).toHaveBeenCalledTimes(1)
    const putCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall?.[1]?.body).toBe(JSON.stringify({ description: 'Updated' }))
  })

  it('creates and edits draft deviations through the visible action rail', async () => {
    const onChange = vi.fn()
    let deviations: Record<string, unknown>[] = []
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.includes('graduation-target-areas')) {
        return okJson({ areas: [] })
      }
      if (url.includes('specification-item-deviations')) {
        if (init?.method === 'POST') {
          deviations = [draftDeviation()]
          return okJson({ ok: true })
        }
        return okJson({ deviations })
      }
      if (url.includes('specification-local-deviations')) {
        return okJson({ ok: true })
      }
      return okJson(localRequirement())
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        onChange={onChange}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Request deviation' }),
    )
    await user.click(screen.getByRole('button', { name: 'Submit deviation' }))
    expect(
      await screen.findByRole('button', { name: 'Edit deviation' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit deviation' }))
    await user.click(screen.getByRole('button', { name: 'Submit deviation' }))
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PUT'),
      ).toBe(true)
    })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('deletes a draft deviation and requests its review', async () => {
    confirmMock.mockResolvedValue(true)
    const onChange = vi.fn()
    mockWorkflow({ deviations: [draftDeviation()] })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        onChange={onChange}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete deviation' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Request review' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger' }),
    )
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes('request-review')),
    ).toBe(true)
  })

  it('reverts a review request and records its decision', async () => {
    confirmMock.mockResolvedValue(true)
    const onChange = vi.fn()
    mockWorkflow({
      deviations: [draftDeviation({ isReviewRequested: 1 })],
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        onChange={onChange}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Revert to draft' }),
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    await user.click(
      screen.getByRole('button', { name: 'deviation.recordDecision' }),
    )
    await user.click(screen.getByRole('button', { name: 'Submit decision' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes('/decision')),
    ).toBe(true)
  })

  it('surfaces deviation fetch and mutation failures', async () => {
    let deviationReads = 0
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.includes('graduation-target-areas')) {
        return okJson({ areas: [] })
      }
      if (url.includes('specification-item-deviations')) {
        if (init?.method === 'POST') {
          return errorJson({ error: 'Deviation rejected' })
        }
        deviationReads += 1
        return deviationReads === 1
          ? errorJson({ error: 'ignored server detail' })
          : okJson({ deviations: [] })
      }
      return okJson(localRequirement())
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fetch deviation failed',
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Request deviation' }))
    await user.click(screen.getByRole('button', { name: 'Submit deviation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deviation rejected',
    )
  })

  it('keeps graduation open and reports invalid and rejected responses', async () => {
    const mutation = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => okJson({ newRequirementUniqueId: '' }))
      .mockImplementationOnce(() => errorJson(null))
    mockWorkflow({ mutation })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Graduate to library' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Graduate unique requirement',
    })
    await user.click(screen.getByRole('button', { name: 'Graduate' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not graduate the unique requirement.',
    )

    await user.click(screen.getByRole('button', { name: 'Graduate' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not graduate the unique requirement.',
    )
  })

  it('shows edit failures and supports clean modal cancellation', async () => {
    const mutation = vi.fn(() => errorJson({ error: '  ' }))
    mockWorkflow({ mutation })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Submit local form' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error')
    await user.click(screen.getByRole('button', { name: 'Cancel local form' }))
    expect(
      screen.queryByRole('dialog', { name: 'Edit unique requirement' }),
    ).toBeNull()
  })

  it('does not delete when confirmation is declined', async () => {
    mockWorkflow()
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE'),
    ).toBe(false)
  })

  it('reports network failures from deletion and deviation mutation', async () => {
    confirmMock.mockResolvedValue(true)
    let mutationCount = 0
    mockWorkflow({
      mutation: () => {
        mutationCount += 1
        return Promise.reject(
          mutationCount === 1 ? new Error('Delete offline') : 'offline',
        )
      },
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete offline')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Error'),
    )
    await user.click(screen.getByRole('button', { name: 'Request deviation' }))
    await user.click(screen.getByRole('button', { name: 'Submit deviation' }))
    expect(await screen.findByText('deviation.saveFailed')).toBeInTheDocument()
  })

  it('changes and cancels the selected graduation target', async () => {
    mockWorkflow({
      areas: [
        { id: 2, name: 'Security', prefix: 'SEC' },
        { id: 3, name: 'Privacy', prefix: 'PRI' },
      ],
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Graduate to library' }),
    )
    const target = screen.getByLabelText('Requirement area')
    await user.selectOptions(target, '3')
    expect(target).toHaveValue('3')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('dialog', { name: 'Graduate unique requirement' }),
    ).toBeNull()
  })

  it('handles missing and failed graduation target catalogs', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.includes('graduation-target-areas')) {
        return errorJson({ error: 'Catalog unavailable' })
      }
      if (url.includes('specification-item-deviations')) {
        return okJson({ deviations: [] })
      }
      if (init?.method) return okJson({})
      return okJson(localRequirement())
    })
    const { unmount } = render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Graduate to library' }),
    ).toBeNull()
    unmount()

    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.includes('graduation-target-areas')) return okJson({})
      if (url.includes('specification-item-deviations')) {
        return okJson({ deviations: [] })
      }
      if (init?.method) return okJson({})
      return okJson(localRequirement())
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={2}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Graduate to library' }),
    ).toBeNull()
  })

  it('offers a new deviation after a previous deviation was decided', async () => {
    mockWorkflow({
      deviations: [
        draftDeviation({ id: 10 }),
        draftDeviation({ decision: 1, id: 11 }),
      ],
      detail: localRequirement({
        priorityLevel: {
          code: 'P1',
          color: '#111111',
          iconName: null,
          id: 1,
          nameEn: 'English fallback',
          nameSv: null,
          sortOrder: 1,
        },
        requirementCategory: { id: 1, nameEn: 'Fallback', nameSv: null },
        specificationItemStatusNameSv: null,
      }),
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByRole('button', { name: 'Request deviation' }),
    ).toBeInTheDocument()
    expect(screen.getByText('P1 – English fallback')).toBeInTheDocument()
    expect(screen.getByText('Fallback')).toBeInTheDocument()
  })

  it('renders read-only detail without mutation controls', async () => {
    mockWorkflow()
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={{ canEditContent: false, canReviewDecisions: false }}
        specificationId={1}
      />,
    )

    expect(await screen.findByText('Local requirement')).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Request deviation' }),
    ).toBeNull()
  })

  it('uses the not-found fallback when an error response has no message', async () => {
    vi.mocked(fetch).mockImplementationOnce(() => errorJson(null))
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        specificationId={1}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unique requirement not found',
    )
  })

  it('preserves the loaded detail when an identical usage snapshot arrives', async () => {
    const usageStatus = {
      specificationItemStatusColor: '#16a34a',
      specificationItemStatusIconName: null,
      specificationItemStatusId: 1,
      specificationItemStatusNameEn: 'Included',
      specificationItemStatusNameSv: 'Inkluderad',
    }
    mockWorkflow({ detail: localRequirement(usageStatus) })
    const { rerender } = render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
        usageStatus={usageStatus}
      />,
    )
    expect(await screen.findByText('Local requirement')).toBeInTheDocument()

    rerender(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
        usageStatus={{ ...usageStatus }}
      />,
    )
    expect(screen.getByText('Local requirement')).toBeInTheDocument()
  })

  it('aborts in-flight deviation and graduation catalogs when unmounted', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (
        url.includes('specification-item-deviations') ||
        url.includes('graduation-target-areas')
      ) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }
      return okJson(localRequirement())
    })
    const { unmount } = render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )
    expect(await screen.findByText('Local requirement')).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))

    unmount()
  })

  it('reports graduation network errors and accepts the nested identifier response', async () => {
    const mutation = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('Graduation offline'))
      .mockResolvedValueOnce(
        await okJson({
          detail: { uniqueId: 'NESTED/1' },
          newRequirementVersionNumber: 2,
        }),
      )
    mockWorkflow({ mutation })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Graduate to library' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Graduate unique requirement',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Graduate' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Graduation offline',
    )

    await user.click(within(dialog).getByRole('button', { name: 'Graduate' }))
    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith('/requirements/NESTED%2F1/2'),
    )
  })

  it('ignores an empty deviation motivation and uses fallback mutation errors', async () => {
    mockWorkflow({ mutation: () => errorJson(null) })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={editablePermissions}
        specificationId={1}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Request deviation' }),
    )
    const callsBeforeEmptySubmit = vi.mocked(fetch).mock.calls.length
    await user.click(
      screen.getByRole('button', { name: 'Submit empty deviation' }),
    )
    expect(fetch).toHaveBeenCalledTimes(callsBeforeEmptySubmit)

    await user.click(screen.getByRole('button', { name: 'Submit deviation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'deviation.saveFailed',
    )
  })

  it('shows only decision review controls granted to a reviewer', async () => {
    mockWorkflow({
      deviations: [draftDeviation({ isReviewRequested: 1 })],
    })
    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferencesResource={emptyNeedsReferencesResource}
        permissions={{ canEditContent: false, canReviewDecisions: true }}
        specificationId={1}
      />,
    )

    expect(
      await screen.findByRole('button', { name: 'deviation.recordDecision' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revert to draft' })).toBeNull()
  })
})
