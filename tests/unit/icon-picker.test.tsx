import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IconPicker from '@/components/IconPicker'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `iconPicker.${key}`,
}))

vi.mock('@/lib/icons/status-icon-allowlist', () => {
  const names = [
    'AlertCircle',
    'AlertOctagon',
    'AlertTriangle',
    'Archive',
    'CheckCircle2',
    'Circle',
    'Eye',
    'Star',
  ]
  return {
    isStatusIconName: (value: unknown) =>
      typeof value === 'string' && names.includes(value),
    STATUS_ICON_NAMES: names,
  }
})

describe('IconPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 768,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the selected icon and respects the disabled state', () => {
    render(
      <IconPicker
        disabled
        id="status-icon"
        label="Choose icon"
        onChange={vi.fn()}
        value="CheckCircle2"
      />,
    )

    expect(screen.getByRole('button', { name: 'Choose icon' })).toMatchObject({
      disabled: true,
      id: 'status-icon',
    })
    expect(screen.getByText('CheckCircle2')).toBeInTheDocument()
  })

  it('filters by localized aliases and selects an icon', () => {
    const onChange = vi.fn()
    render(<IconPicker label="Choose icon" onChange={onChange} value={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    expect(
      screen.getByRole('dialog', { name: 'iconPicker.title' }),
    ).toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText('iconPicker.searchPlaceholder'),
      {
        target: { value: 'godkänd' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check Circle2' }))

    expect(onChange).toHaveBeenCalledWith('CheckCircle2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an empty result and clears the current selection', () => {
    const onChange = vi.fn()
    render(<IconPicker label="Choose icon" onChange={onChange} value="Star" />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    fireEvent.change(
      screen.getByPlaceholderText('iconPicker.searchPlaceholder'),
      {
        target: { value: 'no matching icon' },
      },
    )
    expect(screen.getByText('iconPicker.noResults')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'iconPicker.clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('closes from the close control', () => {
    render(
      <IconPicker label="Choose icon" onChange={vi.fn()} value="unknown" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    const closeButtons = screen.getAllByRole('button', {
      name: 'iconPicker.close',
    })
    fireEvent.click(closeButtons.at(-1) as HTMLButtonElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes from the backdrop', () => {
    render(
      <IconPicker label="Choose icon" onChange={vi.fn()} value="unknown" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'iconPicker.close' })[0],
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus across the icon grid with arrow keys and bounds the movement', () => {
    render(<IconPicker label="Choose icon" onChange={vi.fn()} value={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }))
    const iconButtons = screen
      .getAllByRole('button')
      .filter(button => button.hasAttribute('aria-pressed'))
    const first = iconButtons[0]
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(iconButtons[1]).toHaveFocus()

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowDown',
    })
    expect(iconButtons[6]).toHaveFocus()

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(iconButtons[1]).toHaveFocus()

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' })
    expect(iconButtons[1]).toHaveFocus()
  })

  it('repositions the open dialog for viewport changes', () => {
    render(<IconPicker label="Choose icon" onChange={vi.fn()} value={null} />)

    const trigger = screen.getByRole('button', { name: 'Choose icon' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      bottom: 740,
      height: 40,
      left: 990,
      right: 1030,
      top: 700,
      width: 40,
      x: 990,
      y: 700,
      toJSON: () => ({}),
    })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog')
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 300,
      left: 0,
      right: 352,
      top: 0,
      width: 352,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))

    expect(dialog).toHaveStyle({ left: '656px', top: '392px' })
    fireEvent.scroll(window)
    expect(dialog).toHaveStyle({ left: '656px', top: '392px' })
  })
})
