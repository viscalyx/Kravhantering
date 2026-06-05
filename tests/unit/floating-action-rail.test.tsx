import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FloatingActionRail from '@/components/FloatingActionRail'

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

describe('FloatingActionRail', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
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
})
