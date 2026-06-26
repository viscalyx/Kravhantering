import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationLocalRequirementDetailClient from '@/components/SpecificationLocalRequirementDetailClient'

const confirmMock = vi.fn(async () => false)
const routerPushMock = vi.fn()
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
  'requirement.requiresTesting': 'Requires testing',
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
  default: () => null,
}))

vi.mock('@/components/DeviationFormModal', () => ({
  default: () => null,
}))

vi.mock('@/components/DeviationPill', () => ({
  default: () => <div data-testid="deviation-pill" />,
}))

vi.mock('@/components/DeviationStepper', () => ({
  default: () => <div data-testid="deviation-stepper" />,
}))

vi.mock('@/components/SpecificationLocalRequirementForm', () => ({
  default: (props: { onDirtyChange?: (dirty: boolean) => void }) => (
    <div data-testid="specification-local-form">
      <button onClick={() => props.onDirtyChange?.(true)} type="button">
        Mark local form dirty
      </button>
    </div>
  ),
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

describe('SpecificationLocalRequirementDetailClient', () => {
  beforeEach(() => {
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
          requiresTesting: true,
          priorityLevel: {
            color: '#dc2626',
            id: 2,
            nameEn: 'High',
            nameSv: 'Hog',
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
    expect(screen.queryByText('RequirementPackage')).not.toBeInTheDocument()
    expect(screen.queryByText('KRAV0001')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Print' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Deviation')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Only exists in this specification.'),
    ).not.toBeInTheDocument()

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
          requiresTesting: false,
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
          requiresTesting: false,
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
          requiresTesting: false,
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
        needsReferences={[]}
        onChange={onChange}
        specificationSlug="ETJANST-UPP-2026"
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
          requiresTesting: false,
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
          requiresTesting: false,
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
          requiresTesting: false,
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
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
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
})
