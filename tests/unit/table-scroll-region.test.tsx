import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TableScrollRegion from '@/components/TableScrollRegion'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('TableScrollRegion', () => {
  let measure: () => void
  let contentWidth: number
  let viewportWidth: number

  beforeEach(() => {
    contentWidth = 600
    viewportWidth = 300
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
      () => contentWidth,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => viewportWidth,
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          measure = callback
        }
        observe() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('includes the named region in tab order only while columns overflow', () => {
    render(
      <TableScrollRegion aria-label="Requirements">
        <table>
          <tbody>
            <tr>
              <td>Requirement</td>
            </tr>
          </tbody>
        </table>
      </TableScrollRegion>,
    )
    const region = screen.getByRole('region', { name: 'Requirements' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveAccessibleDescription('tableScrollHint')

    viewportWidth = 600
    act(() => measure())
    expect(region).toHaveAttribute('tabindex', '-1')
    expect(region).toHaveAccessibleDescription('')

    contentWidth = 900
    act(() => measure())
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('updates keyboard access when rendered content changes', () => {
    contentWidth = 300
    const { rerender } = render(
      <TableScrollRegion aria-label="Statuses">Loading</TableScrollRegion>,
    )
    const region = screen.getByRole('region', { name: 'Statuses' })
    expect(region).toHaveAttribute('tabindex', '-1')

    contentWidth = 600
    rerender(
      <TableScrollRegion aria-label="Statuses">
        <table>
          <tbody>
            <tr>
              <td>Published</td>
            </tr>
          </tbody>
        </table>
      </TableScrollRegion>,
    )
    expect(region).toHaveAttribute('tabindex', '0')

    contentWidth = 300
    rerender(
      <TableScrollRegion aria-label="Statuses">No statuses</TableScrollRegion>,
    )
    expect(region).toHaveAttribute('tabindex', '-1')
  })

  it('measures on window resize when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(
      <TableScrollRegion aria-label="Statuses">Statuses</TableScrollRegion>,
    )
    const region = screen.getByRole('region', { name: 'Statuses' })
    expect(region).toHaveAttribute('tabindex', '0')
    viewportWidth = 600
    fireEvent(window, new Event('resize'))
    expect(region).toHaveAttribute('tabindex', '-1')
  })
})
