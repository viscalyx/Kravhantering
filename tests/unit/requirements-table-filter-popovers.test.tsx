import { act, fireEvent, render, screen } from '@testing-library/react'
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
    fireEvent.click(trigger)
    const search = screen.getByRole('textbox', { name: 'ID' })
    expect(screen.getByRole('dialog')).toContainElement(search)
    expect(search).toHaveFocus()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).not.toBeInTheDocument()
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
      fireEvent.click(screen.getByRole('button', { name: 'clear' }))
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
