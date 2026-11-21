import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MultiSelectFilterPopover, {
  SearchFilterPopover,
} from '@/components/_requirements-table/FilterPopovers'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('requirement table filter popovers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens search inside its modal and gives the first Escape to the filter', () => {
    const onDialogKey = vi.fn()
    const { rerender } = render(
      <div
        aria-modal="true"
        onKeyDown={onDialogKey}
        role="dialog"
        tabIndex={-1}
      >
        <SearchFilterPopover
          activeValue=""
          developerModeValue="requirement id"
          label="ID"
          onChange={vi.fn()}
        />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'filterBy' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const search = screen.getByRole('textbox', { name: 'ID' })
    expect(screen.getByRole('dialog')).toContainElement(search)
    expect(search).toHaveFocus()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    expect(onDialogKey).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    dialog.focus()
    fireEvent.mouseDown(dialog)
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onDialogKey).toHaveBeenCalledOnce()

    fireEvent.click(trigger)
    rerender(<div aria-modal="true" onKeyDown={onDialogKey} role="dialog" />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onDialogKey).toHaveBeenCalledTimes(2)
  })

  it('gives Escape to the last filter opened from the keyboard inside a dialog', async () => {
    const user = userEvent.setup()
    const onDialogEscape = vi.fn()
    render(
      <div
        aria-modal="true"
        onKeyDown={event => {
          if (event.key === 'Escape') onDialogEscape()
        }}
        role="dialog"
      >
        {['ID', 'Description'].map(label => (
          <SearchFilterPopover
            activeValue=""
            developerModeValue={label}
            key={label}
            label={label}
            onChange={vi.fn()}
          />
        ))}
      </div>,
    )
    const [first, second] = screen.getAllByRole<HTMLButtonElement>('button', {
      name: 'filterBy',
    })
    if (!first || !second) throw new Error('Expected two filter triggers')
    first.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'ID' })).toHaveFocus()
    second.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveFocus()
    expect(first).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{Escape}')
    expect(second).toHaveFocus()
    expect(second).toHaveAttribute('aria-expanded', 'false')
    expect(onDialogEscape).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onDialogEscape).toHaveBeenCalledOnce()
  })

  it.each([true, false])(
    'restores focus after clearing a controlled selection (options remain: %s)',
    remaining => {
      function ControlledFilter() {
        const [value, setValue] = useState([2])
        const options = [
          { id: 1, parent: null },
          { id: 2, parent: 1 },
        ]
        return (
          <MultiSelectFilterPopover
            developerModeValue="quality"
            getLabel={o => String(o.id)}
            getParentId={o => o.parent}
            label="Quality"
            onChange={setValue}
            options={remaining || value.length ? options : options.slice(0, 1)}
            value={value}
          />
        )
      }
      render(<ControlledFilter />)
      const trigger = screen.getByRole('button', { name: 'filterBy' })
      fireEvent.click(trigger)
      const clear = screen.getByRole('button', { name: 'clear' })
      clear.focus()
      fireEvent.click(clear)
      expect(clear).not.toBeInTheDocument()
      if (remaining) {
        const checkbox = screen.getByRole('checkbox', { name: '2' })
        expect(checkbox).not.toBeChecked()
        expect(checkbox).toHaveFocus()
      } else {
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveFocus()
      }
    },
  )

  it.each(['flat', 'grouped'] as const)(
    'keeps the %s list open during selection and restores focus on outside dismissal',
    variant => {
      const onChange = vi.fn()
      const onHeaderClick = vi.fn()
      const options = [
        { id: 1, label: 'Quality', parentId: null },
        { id: 2, label: 'Reliability', parentId: 1 },
      ]
      render(
        <table>
          <thead>
            <tr>
              <th onClick={onHeaderClick}>
                <MultiSelectFilterPopover
                  developerModeValue="quality"
                  getLabel={option => option.label}
                  getParentId={
                    variant === 'grouped'
                      ? option => option.parentId
                      : undefined
                  }
                  label="Quality"
                  onChange={onChange}
                  options={options}
                  value={[2]}
                />
              </th>
            </tr>
          </thead>
        </table>,
      )
      const trigger = screen.getByRole('button', { name: 'filterBy' })
      fireEvent.click(trigger)
      expect(onHeaderClick).not.toHaveBeenCalled()
      expect(trigger).toHaveTextContent('1')
      const option = screen.getByRole('checkbox', { name: 'Reliability' })
      expect(option).toBeChecked()
      if (variant === 'grouped') {
        expect(screen.getByText('Quality')).toBeVisible()
        expect(screen.queryByRole('checkbox', { name: 'Quality' })).toBeNull()
      }
      fireEvent.mouseDown(option)
      fireEvent.click(option)
      expect(onChange).toHaveBeenCalledExactlyOnceWith([])
      fireEvent.mouseDown(trigger)
      expect(option).toBeVisible()
      fireEvent.click(trigger)
      expect(option).not.toBeInTheDocument()
      fireEvent.click(trigger)
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('checkbox')).toBeNull()
      expect(trigger).toHaveFocus()
    },
  )

  describe('text commits', () => {
    afterEach(() => vi.useRealTimers())

    function openSearch() {
      vi.useFakeTimers()
      const onChange = vi.fn()
      const view = render(
        <SearchFilterPopover
          activeValue=""
          developerModeValue="id"
          label="ID"
          onChange={onChange}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'filterBy' }))
      const input = screen.getByRole('textbox', { name: 'ID' })
      const type = (value: string) =>
        fireEvent.change(input, { target: { value } })
      return { ...view, onChange, type }
    }

    it('commits the last edit after 400 ms and cancels an edit on clear', () => {
      const { onChange, type } = openSearch()
      type('A')
      act(() => vi.advanceTimersByTime(399))
      type('AB')
      act(() => vi.advanceTimersByTime(399))
      expect(onChange).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(onChange).toHaveBeenCalledExactlyOnceWith('AB')
      type('ABC')
      const clear = screen.getByRole('button', { name: 'clear' })
      clear.focus()
      fireEvent.click(clear)
      expect(screen.getByRole('textbox', { name: 'ID' })).toHaveFocus()
      expect(onChange).toHaveBeenLastCalledWith(undefined)
      act(() => vi.advanceTimersByTime(400))
      expect(onChange).toHaveBeenCalledTimes(2)
    })

    it('discards pending text when an open filter unmounts', () => {
      const { onChange, type, unmount } = openSearch()
      type('pending')
      unmount()
      act(() => vi.advanceTimersByTime(400))
      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
