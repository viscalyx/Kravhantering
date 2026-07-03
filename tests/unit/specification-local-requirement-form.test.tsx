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
        needsReferences={[{ id: 7, text: 'Need A' }]}
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
        needsReferences={[
          { id: 7, text: 'Need A' },
          { id: 8, text: 'Need B' },
        ]}
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
        return okJson({ categories: [] })
      }
      if (url.includes('/api/requirement-types')) {
        return okJson({ types: [] })
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
})
