import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationLocalRequirementForm from '@/components/SpecificationLocalRequirementForm'

const confirmDiscardChangesMock = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key)
    t.rich = (key: string) => (namespace ? `${namespace}.${key}` : key)
    return t
  },
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => confirmDiscardChangesMock,
}))

function okJson(body: unknown) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
  } as Response)
}

const fetchMock = vi.fn()

function needsReferencesResource(data: { id: number; text: string }[]) {
  return {
    data,
    error: null,
    loading: false,
    refreshError: null,
    refreshing: false,
    reload: async () => data,
  }
}

function LocalRequirementFormWrapper() {
  const [dirty, setDirty] = useState(false)
  const initialValue = {
    acceptanceCriteria: 'Original acceptance criteria',
    description: 'Original requirement text',
    needsReferenceId: '7',
    normReferenceIds: [11],
    priorityLevelId: '2',
    verifiable: false,
  }

  return (
    <>
      <span data-testid="dirty-state">{String(dirty)}</span>
      <SpecificationLocalRequirementForm
        initialValue={{ ...initialValue }}
        needsReferencesResource={needsReferencesResource([
          { id: 7, text: 'Need A' },
        ])}
        onCancel={() => undefined}
        onDirtyChange={setDirty}
        onSubmit={async () => undefined}
        submitLabel="Save"
      />
    </>
  )
}

function ChangingInitialValueWrapper() {
  const [variant, setVariant] = useState<'initial' | 'replacement'>('initial')
  const initialValues = {
    initial: {
      acceptanceCriteria: 'Original acceptance criteria',
      description: 'Original requirement text',
      needsReferenceId: '7',
      normReferenceIds: [11],
      priorityLevelId: '2',
      verifiable: false,
    },
    replacement: {
      acceptanceCriteria: 'Replacement acceptance criteria',
      description: 'Replacement requirement text',
      needsReferenceId: '8',
      normReferenceIds: [12],
      priorityLevelId: '3',
      verifiable: false,
    },
  }
  const initialValue = initialValues[variant]

  return (
    <>
      <button onClick={() => setVariant('replacement')} type="button">
        Load replacement
      </button>
      <SpecificationLocalRequirementForm
        initialValue={{
          ...initialValue,
          normReferenceIds: [...initialValue.normReferenceIds],
        }}
        needsReferencesResource={needsReferencesResource([
          { id: 7, text: 'Need A' },
          { id: 8, text: 'Need B' },
        ])}
        onCancel={() => undefined}
        onSubmit={async () => undefined}
        submitLabel="Save"
      />
    </>
  )
}

describe('SpecificationLocalRequirementForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    confirmDiscardChangesMock.mockResolvedValue(true)
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/requirement-categories')) {
        return okJson({
          categories: [{ id: 3, nameEn: 'Functional', nameSv: 'Funktionell' }],
        })
      }
      if (url.includes('/api/requirement-types')) {
        return okJson({
          types: [{ id: 5, nameEn: 'Function', nameSv: 'Funktion' }],
        })
      }
      if (url.includes('/api/requirement-packages')) {
        return okJson({ requirementPackages: [] })
      }
      if (url.includes('/api/norm-references')) {
        return okJson({
          normReferences: [
            { id: 11, name: 'Norm A', normReferenceId: 'NORM-A' },
          ],
        })
      }
      if (url.includes('/api/priority-levels')) {
        return okJson({
          priorityLevels: [
            {
              assessmentCriteriaEn: 'Assessment criteria',
              assessmentCriteriaSv: 'Bedömningsgrund',
              code: 'P2',
              descriptionEn: 'Priority description',
              descriptionSv: 'Prioritetsbeskrivning',
              id: 2,
              nameEn: 'Low',
              nameSv: 'Låg',
            },
          ],
        })
      }
      if (url.includes('/api/quality-characteristics')) {
        return okJson({
          qualityCharacteristics: [
            {
              id: 40,
              nameEn: 'System quality',
              nameSv: 'Systemkvalitet',
              parentId: null,
            },
            {
              id: 4,
              nameEn: 'Reliability',
              nameSv: 'Tillförlitlighet',
              parentId: 40,
            },
          ],
        })
      }
      if (url.includes('/api/requirement-areas')) {
        return okJson({ areas: [] })
      }
      return okJson({})
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('keeps local edits when dirty state rerenders the parent with equivalent initial values', async () => {
    render(<LocalRequirementFormWrapper />)

    const descriptionField = screen.getByRole('textbox', {
      name: /requirement\.description/,
    })

    fireEvent.change(descriptionField, {
      target: { value: 'Edited requirement text' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    })
    expect(descriptionField).toHaveValue('Edited requirement text')
  })

  it('resets fields and closes needs-reference help when initial values change', async () => {
    render(<ChangingInitialValueWrapper />)

    const descriptionField = screen.getByRole('textbox', {
      name: /requirement\.description/,
    })
    const needsReferenceField = screen.getByRole('combobox', {
      name: /specification\.needsReference/,
    })
    const needsReferenceHelpButton = screen.getByRole('button', {
      name: 'common.help: specification.needsReference',
    })

    fireEvent.change(descriptionField, {
      target: { value: 'Edited requirement text' },
    })
    fireEvent.click(needsReferenceHelpButton)
    expect(needsReferenceHelpButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Load replacement' }))

    await waitFor(() => {
      expect(descriptionField).toHaveValue('Replacement requirement text')
      expect(needsReferenceField).toHaveValue('8')
      expect(needsReferenceHelpButton).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('keeps independent fields editable but blocks save while needs references load', async () => {
    const onSubmit = vi.fn(async () => undefined)
    const { container } = render(
      <SpecificationLocalRequirementForm
        needsReferencesResource={{
          data: undefined,
          error: null,
          loading: true,
          refreshError: null,
          refreshing: false,
          reload: async () => undefined,
        }}
        onCancel={() => undefined}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'referenceData.loading',
    )
    const description = screen.getByRole('textbox', {
      name: /requirement\.description/,
    })
    fireEvent.change(description, {
      target: { value: 'Editable while reference data loads' },
    })
    expect(description).toHaveValue('Editable while reference data loads')
    expect(
      screen.getByRole('combobox', {
        name: /specification\.needsReference/,
      }),
    ).toBeDisabled()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('aria-describedby')

    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('treats a successfully loaded empty needs-reference catalog as ready', async () => {
    render(
      <SpecificationLocalRequirementForm
        needsReferencesResource={needsReferencesResource([])}
        onCancel={() => undefined}
        onSubmit={async () => undefined}
        submitLabel="Save"
      />,
    )

    const needsReferenceSelect = screen.getByRole('combobox', {
      name: /specification\.needsReference/,
    })
    await waitFor(() => expect(needsReferenceSelect).toBeEnabled())
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /requirement\.description/,
      }),
      { target: { value: 'Ready with no needs references' } },
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    )
  })

  it('submits trimmed local requirement values and establishes a clean baseline', async () => {
    const onDirtyChange = vi.fn()
    const onSubmit = vi.fn(async () => undefined)
    render(
      <SpecificationLocalRequirementForm
        initialValue={{
          acceptanceCriteria: ' Acceptance ',
          categoryId: '3',
          description: 'Original',
          needsReferenceId: '',
          normReferenceIds: [11],
          priorityLevelId: '2',
          qualityCharacteristicId: '4',
          typeId: '5',
          verifiable: true,
          verificationMethod: ' Review ',
        }}
        needsReferencesResource={needsReferencesResource([
          { id: 7, text: 'Need A' },
        ])}
        onCancel={() => undefined}
        onDirtyChange={onDirtyChange}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: '  Updated requirement  ' } },
    )
    fireEvent.change(
      screen.getByRole('combobox', {
        name: /specification\.needsReference/,
      }),
      { target: { value: '7' } },
    )
    const category = screen.getByRole('combobox', {
      name: /requirement\.category/,
    })
    const requirementType = screen.getByRole('combobox', {
      name: /requirement\.type/,
    })
    const qualityCharacteristic = screen.getByRole('combobox', {
      name: /requirement\.qualityCharacteristic/,
    })
    await waitFor(() => {
      expect(category).toHaveValue('3')
      expect(requirementType).toHaveValue('5')
    })
    fireEvent.change(requirementType, { target: { value: '' } })
    expect(requirementType).toHaveValue('')
    fireEvent.change(requirementType, { target: { value: '5' } })
    await screen.findByRole('option', { name: 'Reliability' })
    fireEvent.change(qualityCharacteristic, { target: { value: '4' } })
    await waitFor(() => {
      expect(category).toHaveValue('3')
      expect(requirementType).toHaveValue('5')
      expect(qualityCharacteristic).toHaveValue('4')
    })
    const save = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(save).toBeEnabled())
    const form = save.closest('form')
    expect(form).not.toBeNull()
    if (!form) throw new Error('Expected the save button inside a form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        acceptanceCriteria: 'Acceptance',
        description: 'Updated requirement',
        needsReferenceId: 7,
        normReferenceIds: [11],
        priorityLevelId: 2,
        qualityCharacteristicId: 4,
        requirementCategoryId: 3,
        requirementTypeId: 5,
        verifiable: true,
        verificationMethod: 'Review',
      })
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('shows submission failures and permits a successful retry', async () => {
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Save failed'))
      .mockResolvedValueOnce(undefined)
    render(
      <SpecificationLocalRequirementForm
        needsReferencesResource={needsReferencesResource([])}
        onCancel={() => undefined}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: 'Retry me' } },
    )
    const save = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        acceptanceCriteria: null,
        needsReferenceId: null,
        verificationMethod: null,
      }),
    )
  })

  it('uses the generic error message for non-Error submission failures', async () => {
    render(
      <SpecificationLocalRequirementForm
        needsReferencesResource={needsReferencesResource([])}
        onCancel={() => undefined}
        onSubmit={vi.fn().mockRejectedValue('offline')}
        submitLabel="Save"
      />,
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: 'Cannot save' } },
    )
    const save = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
  })

  it('confirms dirty cancellation and respects a rejected discard', async () => {
    const onCancel = vi.fn()
    confirmDiscardChangesMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    render(
      <SpecificationLocalRequirementForm
        needsReferencesResource={needsReferencesResource([])}
        onCancel={onCancel}
        onSubmit={async () => undefined}
        submitLabel="Save"
      />,
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: 'Unsaved' } },
    )
    const cancel = screen.getByRole('button', { name: 'common.cancel' })
    fireEvent.click(cancel)
    await waitFor(() => expect(confirmDiscardChangesMock).toHaveBeenCalled())
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.click(cancel)
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(confirmDiscardChangesMock).toHaveBeenLastCalledWith(cancel)
  })

  it('cancels immediately when the form is clean', async () => {
    const onCancel = vi.fn()
    render(
      <SpecificationLocalRequirementForm
        needsReferencesResource={needsReferencesResource([])}
        onCancel={onCancel}
        onSubmit={async () => undefined}
        submitLabel="Save"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(confirmDiscardChangesMock).not.toHaveBeenCalled()
  })
})
