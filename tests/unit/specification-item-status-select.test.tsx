import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SpecificationItemStatusSelect from '@/components/_requirements-table/SpecificationItemStatusSelect'
import type { SpecificationItemStatusOption } from '@/lib/requirements/list-view'

const statuses: SpecificationItemStatusOption[] = [
  {
    color: '#64748B',
    descriptionEn: 'Work has not started',
    descriptionSv: 'Arbetet har inte börjat',
    id: 1,
    isDeviationStatus: false,
    nameEn: 'Draft',
    nameSv: 'Utkast',
    sortOrder: 1,
  },
  {
    color: '#F59E0B',
    descriptionEn: null,
    descriptionSv: null,
    id: 5,
    isDeviationStatus: true,
    nameEn: 'Deviated',
    nameSv: 'Avviken',
    sortOrder: 2,
  },
]

describe('SpecificationItemStatusSelect', () => {
  it('hides the deviation status until an approved deviation exists', () => {
    const onChange = vi.fn()
    render(
      <SpecificationItemStatusSelect
        ariaLabel="Usage status"
        hasApprovedDeviation={false}
        itemRef="lib:7"
        locale="en"
        onChange={onChange}
        statuses={statuses}
        statusId={1}
        tooltip="Change status"
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Usage status' })
    expect(select).toHaveAttribute('title', 'Change status')
    expect(screen.getByRole('option', { name: 'Draft' })).toHaveAttribute(
      'title',
      'Work has not started',
    )
    expect(screen.queryByRole('option', { name: 'Deviated' })).toBeNull()

    fireEvent.change(select, { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows localized deviation status and reports the stable item reference', () => {
    const onChange = vi.fn()
    const parentClick = vi.fn()
    render(
      <SpecificationItemStatusSelect
        ariaLabel="Användningsstatus"
        hasApprovedDeviation
        itemRef="local:8"
        locale="sv"
        onChange={onChange}
        statuses={statuses}
        statusId={1}
      />,
    )
    document.body.addEventListener('click', parentClick)

    const select = screen.getByRole('combobox', { name: 'Användningsstatus' })
    expect(screen.getByRole('option', { name: 'Utkast' })).toHaveAttribute(
      'title',
      'Arbetet har inte börjat',
    )
    expect(screen.getByRole('option', { name: 'Avviken' })).not.toHaveAttribute(
      'title',
    )

    fireEvent.click(select)
    expect(parentClick).not.toHaveBeenCalled()
    fireEvent.change(select, { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith('local:8', 5)
    document.body.removeEventListener('click', parentClick)
  })
})
