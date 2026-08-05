import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementFormFields, {
  type RequirementFormFieldValues,
} from '@/components/RequirementFormFields'
import type {
  ReferenceDataReadiness,
  TaxonomyOptions,
} from '@/hooks/useTaxonomyOptions'

const localeState = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.locale,
  useTranslations: (namespace?: string) => {
    const translate = (key: string) => (namespace ? `${namespace}.${key}` : key)
    translate.rich = (
      key: string,
      tags: { strong: (chunks: string) => unknown },
    ) => {
      tags.strong('important')
      return translate(key)
    }
    return translate
  },
}))

const readiness: ReferenceDataReadiness = {
  canSave: true,
  emptyRequiredCatalogs: [],
  failedCatalogs: [],
  loadingCatalogs: [],
  refreshFailedCatalogs: [],
  refreshingCatalogs: [],
  retryFailed: vi.fn(),
}

const taxonomyOptions: TaxonomyOptions = {
  areas: [{ id: 1, name: 'Area one', ownerHsaId: 'SE123-area' }],
  categories: [{ id: 2, nameEn: 'Category', nameSv: 'Kategori' }],
  loading: false,
  normReferences: [
    { id: 3, name: 'Selected norm', normReferenceId: 'NR-3' },
    { id: 4, name: 'Available norm', normReferenceId: 'NR-4' },
  ],
  priorityLevels: [
    {
      assessmentCriteriaEn: 'Assess EN',
      assessmentCriteriaSv: 'Assess SV',
      code: 'P1',
      color: '#123456',
      descriptionEn: 'Description EN',
      descriptionSv: 'Description SV',
      iconName: null,
      id: 6,
      nameEn: 'Priority',
      nameSv: 'Prioritet',
    },
  ],
  qualityCharacteristics: [
    { id: 7, nameEn: 'Quality', nameSv: 'Kvalitet', parentId: null },
  ],
  readiness,
  refresh: vi.fn(),
  requirementPackages: [
    { id: 8, name: 'Selected package' },
    { id: 9, name: 'Available package', purposeAndScope: 'Purpose' },
  ],
  types: [{ id: 5, nameEn: 'Type', nameSv: 'Typ' }],
}

const values: RequirementFormFieldValues = {
  acceptanceCriteria: 'Criteria',
  areaId: '1',
  categoryId: '2',
  description: 'Description',
  normReferenceIds: [3],
  priorityLevelId: '6',
  qualityCharacteristicId: '7',
  requirementPackageIds: [8],
  typeId: '5',
  verifiable: true,
  verificationMethod: 'Inspection',
}

describe('RequirementFormFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localeState.locale = 'en'
  })

  it('reports edits from every core field in the bottom layout', () => {
    const onChange = vi.fn()
    render(
      <RequirementFormFields
        additionalNormReferences={[
          { id: 3, name: 'Duplicate', normReferenceId: 'DUPLICATE' },
          { id: 10, name: 'Created norm', normReferenceId: 'NR-10' },
        ]}
        extraFieldsAfterPriorityLevel={<div>Extra field</div>}
        idPrefix="core"
        layout="bottom"
        normReferenceActions={<button type="button">Create norm</button>}
        onChange={onChange}
        referenceDataReadiness={readiness}
        referenceDataStatusId="reference-status"
        taxonomyOptions={taxonomyOptions}
        values={values}
      />,
    )

    fireEvent.change(
      screen.getByRole('combobox', { name: /requirement\.area/ }),
      {
        target: { value: '' },
      },
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: /requirement\.category/ }),
      {
        target: { value: '' },
      },
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: /requirement\.type/ }),
      {
        target: { value: '' },
      },
    )
    fireEvent.change(
      screen.getByRole('combobox', {
        name: /requirement\.qualityCharacteristic/,
      }),
      { target: { value: '' } },
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: /requirement\.priorityLevel/ }),
      {
        target: { value: '' },
      },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /requirement\.verificationMethod/ }),
      { target: { value: 'Demonstration' } },
    )
    fireEvent.click(screen.getByLabelText('requirement.verifiable'))
    fireEvent.click(screen.getByLabelText('Selected package'))
    fireEvent.click(screen.getByLabelText('Available package'))
    fireEvent.click(screen.getByLabelText('NR-3 Selected norm'))
    fireEvent.click(screen.getByLabelText('NR-4 Available norm'))
    fireEvent.click(screen.getByLabelText('NR-10 Created norm'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityCharacteristicId: '',
        typeId: '',
      }),
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ verifiable: false, verificationMethod: '' }),
    )
    expect(screen.getByText('Extra field')).toBeVisible()
    expect(screen.queryByText('DUPLICATE')).not.toBeInTheDocument()
  })

  it('covers localized, optional, blocked, and hidden field variants', () => {
    localeState.locale = 'sv'
    const blockedReadiness: ReferenceDataReadiness = {
      ...readiness,
      canSave: false,
      emptyRequiredCatalogs: ['areas'],
      failedCatalogs: ['categories', 'normReferences'],
      loadingCatalogs: [
        'types',
        'qualityCharacteristics',
        'priorityLevels',
        'requirementPackages',
      ],
    }
    const { rerender } = render(
      <RequirementFormFields
        areaRequired={false}
        layout="bottom"
        onChange={vi.fn()}
        referenceDataReadiness={blockedReadiness}
        referenceDataStatusId="blocked-reference-data"
        showRequirementPackages={false}
        taxonomyOptions={{ ...taxonomyOptions, readiness: blockedReadiness }}
        values={{
          ...values,
          areaId: '',
          priorityLevelId: '',
          typeId: '',
          verifiable: false,
        }}
      />,
    )

    expect(screen.getByRole('option', { name: 'Kategori' })).toBeVisible()
    expect(screen.getByRole('option', { name: 'Typ' })).toBeVisible()
    expect(screen.queryByText('Selected package')).not.toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: /requirement\.area/ }),
    ).toBeDisabled()
    expect(screen.getByLabelText('NR-4 Available norm')).toBeDisabled()

    rerender(
      <RequirementFormFields
        onChange={vi.fn()}
        referenceDataReadiness={readiness}
        referenceDataStatusId="reference-status"
        showArea={false}
        showRequirementPackages={false}
        taxonomyOptions={taxonomyOptions}
        values={values}
      />,
    )

    expect(
      screen.queryByRole('combobox', { name: /requirement\.area/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Selected package')).not.toBeInTheDocument()
  })

  it('opens and closes inline help for the same field', () => {
    render(
      <RequirementFormFields
        onChange={vi.fn()}
        referenceDataReadiness={readiness}
        referenceDataStatusId="reference-status"
        taxonomyOptions={taxonomyOptions}
        values={values}
      />,
    )
    const help = screen.getByRole('button', {
      name: 'common.help: requirement.description',
    })

    fireEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'false')
  })
})
