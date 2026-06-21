import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FloatingActionRail from '@/components/FloatingActionRail'
import { GLOBAL_NAVIGATION_LAYOUT_EVENT } from '@/lib/navigation-layout-events'

function AsyncAnchoredRail() {
  const [showAnchor, setShowAnchor] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setShowAnchor(true)
  }, [])

  return (
    <>
      <FloatingActionRail
        anchorRef={anchorRef}
        developerModeContext="test"
        items={[
          {
            ariaLabel: 'Create item',
            icon: <span aria-hidden="true">+</span>,
            id: 'create',
            onClick: vi.fn(),
            variant: 'primary',
          },
        ]}
      />
      {showAnchor && <div data-testid="late-anchor" ref={anchorRef} />}
    </>
  )
}

function AnchoredRail() {
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <FloatingActionRail
        anchorRef={anchorRef}
        developerModeContext="test"
        items={[
          {
            ariaLabel: 'Create item',
            icon: <span aria-hidden="true">+</span>,
            id: 'create',
            onClick: vi.fn(),
            variant: 'primary',
          },
        ]}
      />
      <div data-testid="anchor" ref={anchorRef} />
    </>
  )
}

describe('FloatingActionRail', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1024,
    })
  })

  it('repositions when an async anchor appears after the rail mounts', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Chromium')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === 'late-anchor') {
          return {
            bottom: 520,
            height: 320,
            left: 32,
            right: 480,
            toJSON: () => ({}),
            top: 200,
            width: 448,
            x: 32,
            y: 200,
          } as DOMRect
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          toJSON: () => ({}),
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        } as DOMRect
      },
    )

    render(<AsyncAnchoredRail />)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create item' }),
      ).toHaveAttribute('data-floating-action-id', 'create')
    })
  })

  it('repositions when the global navigation layout changes without resizing the anchor', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Chromium')
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1024,
    })

    let anchorRight = 480
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === 'anchor') {
          return {
            bottom: 520,
            height: 320,
            left: anchorRight - 448,
            right: anchorRight,
            toJSON: () => ({}),
            top: 200,
            width: 448,
            x: anchorRight - 448,
            y: 200,
          } as DOMRect
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          toJSON: () => ({}),
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        } as DOMRect
      },
    )

    render(<AnchoredRail />)

    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'Create item' })
          .closest('[data-floating-action-rail="true"]')?.parentElement?.style
          .left,
      ).toBe('492px')
    })

    anchorRight = 600
    act(() => {
      window.dispatchEvent(new Event(GLOBAL_NAVIGATION_LAYOUT_EVENT))
    })

    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'Create item' })
          .closest('[data-floating-action-rail="true"]')?.parentElement?.style
          .left,
      ).toBe('612px')
    })
  })
})
