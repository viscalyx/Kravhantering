import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async (namespace: string) => (key: string) => `${namespace}.${key}`,
  ),
}))

vi.mock('@/app/[locale]/priority-levels/priority-levels-client', () => ({
  default: () => <div>priority client</div>,
}))
vi.mock(
  '@/app/[locale]/quality-characteristics/quality-characteristics-client',
  () => ({ default: () => <div>quality client</div> }),
)
vi.mock(
  '@/app/[locale]/requirement-categories/requirement-categories-client',
  () => ({ default: () => <div>category client</div> }),
)
vi.mock(
  '@/app/[locale]/requirement-statuses/requirement-statuses-client',
  () => ({ default: () => <div>status client</div> }),
)
vi.mock('@/app/[locale]/requirement-types/requirement-types-client', () => ({
  default: () => <div>type client</div>,
}))

import PriorityLevelsPage, {
  generateMetadata as priorityMetadata,
} from '@/app/[locale]/priority-levels/page'
import QualityCharacteristicsPage, {
  generateMetadata as qualityMetadata,
} from '@/app/[locale]/quality-characteristics/page'
import RequirementCategoriesPage, {
  generateMetadata as categoryMetadata,
} from '@/app/[locale]/requirement-categories/page'
import RequirementStatusesPage, {
  generateMetadata as statusMetadata,
} from '@/app/[locale]/requirement-statuses/page'
import RequirementTypesPage, {
  generateMetadata as typeMetadata,
} from '@/app/[locale]/requirement-types/page'
import QualityCharacteristicSelectOptions, {
  getQualityCharacteristicOptionName,
} from '@/components/QualityCharacteristicSelectOptions'

beforeEach(() => vi.clearAllMocks())

describe('classification server pages', () => {
  it.each([
    ['priority', priorityMetadata, 'nav.priorityLevels'],
    ['quality', qualityMetadata, 'nav.qualityCharacteristics'],
    ['category', categoryMetadata, 'nav.categories'],
    ['status', statusMetadata, 'nav.statuses'],
    ['type', typeMetadata, 'nav.types'],
  ])('generates the %s page title', async (_name, generate, title) => {
    await expect(generate()).resolves.toEqual({ title })
  })

  it.each([
    [PriorityLevelsPage, 'priority client'],
    [QualityCharacteristicsPage, 'quality client'],
    [RequirementCategoriesPage, 'category client'],
    [RequirementStatusesPage, 'status client'],
    [RequirementTypesPage, 'type client'],
  ])('renders its client island', (Page, text) => {
    render(<Page />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})

describe('QualityCharacteristicSelectOptions', () => {
  const options = [
    { id: 1, nameEn: 'Quality', nameSv: 'Kvalitet', parentId: null },
    { id: 2, nameEn: 'Safety', nameSv: 'Sakerhet' },
    { id: 3, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
    { id: 4, nameEn: 'Orphan', nameSv: 'Foraldralos', parentId: 99 },
  ]

  it('groups only children belonging to a top-level option', () => {
    render(
      <select aria-label="quality">
        <QualityCharacteristicSelectOptions locale="en" options={options} />
      </select>,
    )

    expect(screen.getByRole('group', { name: 'Quality' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Safety' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Child' })).toHaveValue('3')
    expect(screen.queryByRole('option', { name: 'Orphan' })).toBeNull()
  })

  it('uses Swedish names only for the Swedish locale', () => {
    expect(getQualityCharacteristicOptionName(options[0], 'sv')).toBe(
      'Kvalitet',
    )
    expect(getQualityCharacteristicOptionName(options[0], 'en')).toBe('Quality')
  })
})
