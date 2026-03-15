import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

import RequirementsFilter from '@/components/RequirementsFilter'
import { DEFAULT_FILTERS } from '@/lib/requirements/list-view'

const areas = [{ id: 1, name: 'Area 1', ownerName: null }]
const categories = [{ id: 1, nameSv: 'Kat', nameEn: 'Cat' }]
const types = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]
const statusOptions = [
  { id: 1, nameSv: 'Utkast', nameEn: 'Draft', color: '#3b82f6' },
]
const qualityCharacteristics = [
  {
    id: 10,
    nameSv: 'TC sv',
    nameEn: 'TC en',
    parentId: null,
    requirementTypeId: 1,
  },
]
const getName = (o: { nameEn: string }) => o.nameEn
const getStatusName = (o: { nameEn: string }) => o.nameEn

function renderFilter(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  const values = { ...DEFAULT_FILTERS, ...overrides }
  render(
    <RequirementsFilter
      areas={areas}
      categories={categories}
      getName={getName}
      getStatusName={getStatusName}
      onChange={onChange}
      qualityCharacteristics={qualityCharacteristics}
      statusOptions={statusOptions}
      types={types}
      values={values}
    />,
  )
  return { onChange }
}

describe('RequirementsFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it('renders area, category, and type dropdowns', () => {
    renderFilter()
    expect(
      screen.getByRole('combobox', { name: 'requirement.area' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'requirement.category' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'requirement.type' }),
    ).toBeInTheDocument()
  })

  it('calls onChange when area changes', () => {
    const { onChange } = renderFilter()
    fireEvent.change(
      screen.getByRole('combobox', { name: 'requirement.area' }),
      { target: { value: '1' } },
    )
    expect(onChange).toHaveBeenCalled()
    const arg = onChange.mock.calls[0][0]
    expect(arg.areaIds).toEqual([1])
  })

  it('calls onChange when category changes', () => {
    const { onChange } = renderFilter()
    fireEvent.change(
      screen.getByRole('combobox', { name: 'requirement.category' }),
      { target: { value: '1' } },
    )
    expect(onChange).toHaveBeenCalled()
    const arg = onChange.mock.calls[0][0]
    expect(arg.categoryIds).toEqual([1])
  })

  it('renders status dropdown button', () => {
    renderFilter()
    expect(
      screen.getByRole('button', { name: 'requirement.status' }),
    ).toBeInTheDocument()
  })

  it('toggles status dropdown and shows checkbox', () => {
    renderFilter()
    const btn = screen.getByRole('button', { name: 'requirement.status' })
    fireEvent.click(btn)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('calls onChange when status checkbox toggled', () => {
    const { onChange } = renderFilter()
    const btn = screen.getByRole('button', { name: 'requirement.status' })
    fireEvent.click(btn)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalled()
  })
})
