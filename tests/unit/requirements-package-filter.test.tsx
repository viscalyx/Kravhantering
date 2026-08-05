import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsPackageFilter from '@/components/RequirementsPackageFilter'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        addRequirementPackageToFilter: `Add ${values?.package}`,
        allRequirementPackagesSelected: 'All packages selected',
        clearRequirementPackageFilter: 'Clear package filter',
        noRequirementPackageFilterActive: 'No package filter active',
        noRequirementPackagesAvailableToFilter: 'No packages available',
        removeRequirementPackageFromFilter: `Remove ${values?.package}`,
        requirementPackageAdded: `Added ${values?.package}`,
        requirementPackageCatalogFailed: 'Package catalog failed',
        requirementPackageCatalogLoading: 'Package catalog loading',
        requirementPackageChooser: 'Package chooser',
        requirementPackageFilterButton: 'Filter packages',
        requirementPackageFilterButtonActive: `Filter packages (${values?.count})`,
        requirementPackageFilterCleared: 'Package filter cleared',
        requirementPackageRemoved: `Removed ${values?.package}`,
        requirementPackages: 'Packages',
      }
      return labels[key] ?? key
    },
}))

vi.mock('@/components/RequirementPackagePurposeTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}))

const packages: RequirementPackageOption[] = [
  { id: 1, name: ' Alpha ', purposeAndScope: 'First package purpose' },
  { id: 2, name: '', purposeAndScope: ' ' },
  { id: 3, name: 'Beta', purposeAndScope: null },
]

interface HarnessProps {
  initialSelected?: number[]
  onChange?: (ids: number[] | undefined) => void
  options?: RequirementPackageOption[]
}

function Harness({
  initialSelected = [],
  onChange = vi.fn(),
  options = packages,
}: HarnessProps) {
  const [selectedIds, setSelectedIds] = useState(initialSelected)
  return (
    <RequirementsPackageFilter
      catalogStatus="loaded"
      locale="sv-SE"
      onChange={ids => {
        onChange(ids)
        setSelectedIds(ids ?? [])
      }}
      requirementPackages={options}
      selectedIds={selectedIds}
    />
  )
}

describe('RequirementsPackageFilter', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 40,
      left: -10,
      right: 490,
      toJSON: () => ({}),
      top: 80,
      width: 500,
      x: -10,
      y: 80,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 320,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover')
    Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover')
  })

  it('shows delayed loading, failure, and empty catalog states', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { rerender } = render(
      <RequirementsPackageFilter
        catalogStatus="loading"
        locale="en"
        onChange={onChange}
        requirementPackages={[]}
        selectedIds={[]}
      />,
    )

    expect(screen.getByRole('group', { name: 'Packages' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.queryByText('Package catalog loading')).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('Package catalog loading')).toBeVisible()

    rerender(
      <RequirementsPackageFilter
        catalogStatus="failed"
        locale="en"
        onChange={onChange}
        requirementPackages={[]}
        selectedIds={[]}
      />,
    )
    expect(screen.getByText('Package catalog failed')).toBeVisible()

    rerender(
      <RequirementsPackageFilter
        catalogStatus="loaded"
        locale="en"
        onChange={onChange}
        requirementPackages={[]}
        selectedIds={[]}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Filter packages' }),
    ).toBeDisabled()
    expect(screen.getByText('No packages available')).toBeVisible()
  })

  it('adds, removes, clears, and restores focus across controlled updates', async () => {
    const onChange = vi.fn()
    render(<Harness initialSelected={[1, 2]} onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: 'Filter packages (2)' })
    await userEvent.click(trigger)
    const chooser = await screen.findByRole('group', {
      name: 'Package chooser',
    })
    expect(chooser).toHaveStyle({ left: '8px', width: '304px' })

    await userEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }))
    expect(onChange).toHaveBeenLastCalledWith([2])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove 2' })).toHaveFocus(),
    )
    expect(screen.getByRole('status')).toHaveTextContent('Removed Alpha')

    await userEvent.click(screen.getByRole('button', { name: 'Remove 2' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Filter packages' }),
      ).toHaveFocus(),
    )

    const inactiveTrigger = screen.getByRole('button', {
      name: 'Filter packages',
    })
    await userEvent.click(inactiveTrigger)
    if (inactiveTrigger.getAttribute('aria-expanded') === 'false') {
      await userEvent.click(inactiveTrigger)
    }
    await screen.findByRole('group', { name: 'Package chooser' })
    await userEvent.click(screen.getByRole('button', { name: 'Add 2' }))
    expect(onChange).toHaveBeenLastCalledWith([2])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Alpha' })).toHaveFocus(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add Alpha' }))
    expect(onChange).toHaveBeenLastCalledWith([2, 1])
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear package filter' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Package filter cleared',
    )
  })

  it('supports pinned chooser keyboard movement and Escape dismissal', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Filter packages' })
    await userEvent.click(trigger)
    await screen.findByRole('group', { name: 'Package chooser' })

    fireEvent.keyDown(trigger, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Add 2' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Add 2' }), {
      key: 'Tab',
      shiftKey: true,
    })
    expect(trigger).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(screen.getByRole('group', { name: 'Package chooser' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Package chooser' }),
      ).toBeNull(),
    )
    expect(trigger).toHaveFocus()
  })

  it('opens transiently for mouse hover and ignores touch hover', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const band = screen.getByRole('group', { name: 'Packages' })

    fireEvent.pointerEnter(band, { pointerType: 'touch' })
    expect(screen.queryByRole('group', { name: 'Package chooser' })).toBeNull()

    fireEvent.pointerEnter(band, { pointerType: 'mouse' })
    expect(screen.getByRole('group', { name: 'Package chooser' })).toBeVisible()
    fireEvent.pointerLeave(band, { pointerType: 'touch' })
    expect(screen.getByRole('group', { name: 'Package chooser' })).toBeVisible()

    fireEvent.pointerLeave(band, {
      pointerType: 'mouse',
      relatedTarget: document.body,
    })
    act(() => vi.advanceTimersByTime(80))
    expect(screen.queryByRole('group', { name: 'Package chooser' })).toBeNull()
  })

  it('keeps hover open while moving within the filter and cancels a pending close', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const band = screen.getByRole('group', { name: 'Packages' })
    const trigger = screen.getByRole('button', { name: 'Filter packages' })

    fireEvent.pointerEnter(band, { pointerType: 'mouse' })
    expect(screen.getByRole('group', { name: 'Package chooser' })).toBeVisible()
    fireEvent.pointerLeave(band, {
      pointerType: 'mouse',
      relatedTarget: document.body,
    })
    fireEvent.pointerEnter(band, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(80))
    expect(screen.getByRole('group', { name: 'Package chooser' })).toBeVisible()

    fireEvent.pointerOut(band, {
      pointerType: 'mouse',
      relatedTarget: trigger,
    })
    act(() => vi.advanceTimersByTime(80))
    expect(screen.getByRole('group', { name: 'Package chooser' })).toBeVisible()
  })

  it('closes a pinned chooser from its trigger and outside focus', async () => {
    render(
      <div>
        <button type="button">Outside</button>
        <Harness />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'Filter packages' })
    await userEvent.click(trigger)
    await screen.findByRole('group', { name: 'Package chooser' })
    await userEvent.click(trigger)
    expect(screen.queryByRole('group', { name: 'Package chooser' })).toBeNull()

    await userEvent.click(trigger)
    await screen.findByRole('group', { name: 'Package chooser' })
    fireEvent.focusIn(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Package chooser' }),
      ).toBeNull(),
    )

    await userEvent.click(trigger)
    await screen.findByRole('group', { name: 'Package chooser' })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Package chooser' }),
      ).toBeNull(),
    )
  })

  it('focuses the preceding option after adding the last available package', async () => {
    const onChange = vi.fn()
    render(<Harness initialSelected={[1]} onChange={onChange} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Filter packages (1)' }),
    )
    await screen.findByRole('group', { name: 'Package chooser' })

    await userEvent.click(screen.getByRole('button', { name: 'Add Beta' }))

    expect(onChange).toHaveBeenLastCalledWith([1, 3])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add 2' })).toHaveFocus(),
    )
  })

  it('falls back to trigger focus after adding the only available package', async () => {
    render(<Harness initialSelected={[1, 2]} />)
    const trigger = screen.getByRole('button', { name: 'Filter packages (2)' })
    await userEvent.click(trigger)
    await screen.findByRole('group', { name: 'Package chooser' })

    await userEvent.click(screen.getByRole('button', { name: 'Add Beta' }))

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('uses the popover API and renders the all-selected state', async () => {
    const showPopover = vi.fn()
    const hidePopover = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    })
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      value: hidePopover,
    })
    render(<Harness initialSelected={[1, 2, 3]} />)

    const trigger = screen.getByRole('button', { name: 'Filter packages (3)' })
    await userEvent.click(trigger)
    expect(await screen.findByText('All packages selected')).toBeInTheDocument()
    await waitFor(() => expect(showPopover).toHaveBeenCalled())

    await userEvent.click(trigger)
    await waitFor(() => expect(hidePopover).toHaveBeenCalled())
  })

  it('keeps the chooser usable when the popover API rejects the open request', async () => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('popover state race')
      }),
    })
    render(<Harness />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Filter packages' }),
    )

    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-developer-mode-name="requirements package chooser"]',
        ),
      ).toBeInTheDocument(),
    )
  })

  it('orders packages with equal localized names by id', async () => {
    render(
      <Harness
        options={[
          { id: 9, name: 'Same' },
          { id: 4, name: 'Same' },
        ]}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Filter packages' }),
    )

    const options = await screen.findAllByRole('button', { name: 'Add Same' })
    expect(options.map(option => option.dataset.requirementPackage)).toEqual([
      '4',
      '9',
    ])
  })
})
