import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DirtyStateButton from '@/components/DirtyStateButton'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `common.${key}`,
}))

describe('DirtyStateButton', () => {
  it('explains why a clean form cannot be saved', () => {
    render(<DirtyStateButton dirty={false}>Save</DirtyStateButton>)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'common.noChangesToSave',
    )
  })

  it('enables dirty forms and preserves the caller title', () => {
    render(
      <DirtyStateButton dirty title="Save the changes">
        Save
      </DirtyStateButton>,
    )

    expect(screen.getByRole('button')).toBeEnabled()
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'Save the changes',
    )
  })

  it('preserves an explicit disabled state for a dirty form', () => {
    render(
      <DirtyStateButton dirty disabled title="Saving">
        Save
      </DirtyStateButton>,
    )

    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Saving')
  })
})
