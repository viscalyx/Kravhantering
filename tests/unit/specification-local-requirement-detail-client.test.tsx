import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationLocalRequirementDetailClient from '@/components/SpecificationLocalRequirementDetailClient'

const confirmMock = vi.fn(async () => false)
const translations: Record<string, string> = {
  'common.createdAt': 'Created',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.error': 'Error',
  'common.no': 'No',
  'common.noneAvailable': 'None available',
  'common.print': 'Print',
  'common.save': 'Save',
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
    'Delete local requirement',
  'specification.localRequirementActionDisabledTooltip':
    'This local requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
  'specification.editLocalRequirement': 'Edit local requirement',
  'specification.localRequirementNotFound': 'Local requirement not found',
  'specification.needsReference': 'Needs reference',
  'requirement.acceptanceCriteria': 'Acceptance criteria',
  'requirement.area': 'Area',
  'requirement.category': 'Category',
  'requirement.description': 'Description',
  'requirement.normReferences': 'Norm references',
  'requirement.specificationItemStatus': 'Specification item status',
  'requirement.specificationLocalBadge': 'Unique',
  'requirement.specificationLocalTooltip':
    'This row is a specification-local requirement.',
  'requirement.qualityCharacteristic': 'Quality characteristic',
  'requirement.requiresTesting': 'Requires testing',
  'requirement.riskLevel': 'Risk level',
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
  default: () => <div data-testid="specification-local-form" />,
}))

function okJson(body: unknown) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
  } as Response)
}

describe('SpecificationLocalRequirementDetailClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
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
          requirementArea: {
            id: 2,
            name: 'Integration',
          },
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
          riskLevel: {
            color: '#dc2626',
            id: 2,
            nameEn: 'High',
            nameSv: 'Hog',
          },
          requirementPackages: [
            {
              id: 12,
              nameEn: 'Ordering',
              nameSv: 'Bestallning',
            },
          ],
          uniqueId: 'KRAV0001',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: 'Review',
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))

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
    expect(screen.getByText('Area')).toBeInTheDocument()
    expect(screen.getByText('Norm references')).toBeInTheDocument()
    expect(screen.getByText('RequirementPackage')).toBeInTheDocument()
    expect(screen.getByText('ISO27001')).toBeInTheDocument()
    expect(screen.getByText('Bestallning')).toBeInTheDocument()
    expect(screen.queryByText('KRAV0001')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.queryByText('Deviation')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Only exists in this specification.'),
    ).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'data-developer-mode-name',
      'detail action',
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'data-developer-mode-value',
      'edit local requirement',
    )
    expect(screen.getByRole('button', { name: 'Edit' }).className).toContain(
      'min-h-[44px]',
    )
    expect(screen.getByRole('button', { name: 'Edit' }).className).toContain(
      'min-w-[44px]',
    )
    expect(screen.getByRole('button', { name: 'Print' }).className).toContain(
      'w-full',
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-developer-mode-value',
      'delete local requirement',
    )
    const inlineInset = screen
      .getByText('Specification local description')
      .closest('div[class~="px-6"]')
    expect(inlineInset).toHaveClass('py-4')
  })

  it('disables edit and delete when usage status is not Included', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        okJson({
          acceptanceCriteria: 'Specification local acceptance',
          createdAt: '2026-04-01T00:00:00.000Z',
          description: 'Locked local requirement',
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
          riskLevel: null,
          requirementPackages: [],
          uniqueId: 'KRAV0002',
          updatedAt: '2026-04-02T00:00:00.000Z',
          verificationMethod: null,
        }),
      )
      .mockImplementationOnce(() => okJson({ deviations: [] }))

    render(
      <SpecificationLocalRequirementDetailClient
        localRequirementId={1}
        needsReferences={[]}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    expect(
      await screen.findByText('Locked local requirement'),
    ).toBeInTheDocument()
    const editButton = screen.getByRole('button', { name: 'Edit' })
    const deleteButton = screen.getByRole('button', { name: 'Delete' })

    expect(editButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(editButton.className).toContain('disabled:cursor-not-allowed')
    expect(deleteButton.className).toContain('disabled:text-secondary-400')
    expect(editButton.parentElement).toHaveAttribute(
      'title',
      'This local requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
    )
    expect(deleteButton.parentElement).toHaveAttribute(
      'title',
      'This local requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
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
          riskLevel: null,
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
    expect(deleteButton.className).toContain('disabled:text-secondary-400')
    expect(editButton.parentElement).toHaveAttribute(
      'title',
      'This local requirement can only be edited or removed when Usage status is Included and no deviation is pending.',
    )
  })
})
