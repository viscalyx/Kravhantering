import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConfirmModalProvider,
  useConfirmModal,
} from '@/components/ConfirmModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      cancel: 'Cancel',
      confirm: 'Confirm',
    }
    return translations[key] ?? key
  },
}))

function rect({
  bottom = 0,
  height = 0,
  left = 0,
  right = left,
  top = 0,
  width = 0,
}: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom,
    height,
    left,
    right,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function Trigger({
  anchorMode = 'button',
  defaultCancel = false,
  icon,
  label,
  showCancel,
  variant,
}: {
  anchorMode?: 'button' | 'none'
  defaultCancel?: boolean
  icon?: LucideIcon
  label: string
  showCancel?: boolean
  variant?: 'default' | 'danger'
}) {
  const { confirm } = useConfirmModal()
  const [result, setResult] = useState('pending')

  return (
    <div>
      <button
        data-scenario={label}
        onClick={async e => {
          const resolved = await confirm({
            anchorEl:
              anchorMode === 'none'
                ? null
                : (e.currentTarget as HTMLButtonElement),
            defaultCancel,
            icon,
            message: `Message for ${label}`,
            showCancel,
            title: `Title for ${label}`,
            variant,
          })
          setResult(String(resolved))
        }}
        type="button"
      >
        {label}
      </button>
      <output data-testid={`${label}-result`}>{result}</output>
    </div>
  )
}

function OutsideTrigger() {
  useConfirmModal()
  return null
}

describe('ConfirmModal', () => {
  beforeEach(() => {
    window.innerHeight = 800
    window.innerWidth = 600

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const role = this.getAttribute('role')
        const scenario = this.getAttribute('data-scenario')

        if (role === 'alertdialog') {
          return rect({
            bottom: 120,
            height: 120,
            left: 0,
            right: 320,
            top: 0,
            width: 320,
          })
        }

        if (scenario === 'below-anchor') {
          return rect({
            bottom: 140,
            height: 40,
            left: 100,
            right: 140,
            top: 100,
            width: 40,
          })
        }

        if (scenario === 'above-anchor') {
          return rect({
            bottom: 780,
            height: 40,
            left: 200,
            right: 240,
            top: 740,
            width: 40,
          })
        }

        if (scenario === 'center-anchor') {
          return rect({
            bottom: 420,
            height: 40,
            left: 300,
            right: 340,
            top: 380,
            width: 40,
          })
        }

        return rect()
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('requires the provider', () => {
    expect(() => render(<OutsideTrigger />)).toThrow(
      'useConfirmModal must be used within ConfirmModalProvider',
    )
  })

  it('centers the dialog without an anchor and resolves true on confirm', async () => {
    render(
      <ConfirmModalProvider>
        <Trigger anchorMode="none" label="no-anchor" />
      </ConfirmModalProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'no-anchor' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveStyle({ left: '140px', top: '340px' })

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    await waitFor(() => expect(confirmButton).toHaveFocus())

    await userEvent.click(confirmButton)

    await waitFor(() =>
      expect(screen.getByTestId('no-anchor-result')).toHaveTextContent('true'),
    )
  })

  it('positions below an anchor, traps focus, and resolves false on backdrop click', async () => {
    render(
      <ConfirmModalProvider>
        <Trigger defaultCancel label="below-anchor" variant="danger" />
      </ConfirmModalProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'below-anchor' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveStyle({ left: '16px', top: '148px' })

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })

    await waitFor(() => expect(cancelButton).toHaveFocus())

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(confirmButton).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(cancelButton).toHaveFocus()

    const backdrop = dialog.parentElement?.querySelector('.absolute.inset-0')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop as Element)

    await waitFor(() =>
      expect(screen.getByTestId('below-anchor-result')).toHaveTextContent(
        'false',
      ),
    )
  })

  it('positions above an anchor, supports a custom icon, and hides cancel when requested', async () => {
    render(
      <ConfirmModalProvider>
        <Trigger icon={AlertTriangle} label="above-anchor" showCancel={false} />
      </ConfirmModalProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'above-anchor' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveStyle({ left: '60px', top: '612px' })
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(dialog.querySelector('svg')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByTestId('above-anchor-result')).toHaveTextContent(
        'true',
      ),
    )
  })

  it('closes on Escape for anchored dialogs near the center of the viewport', async () => {
    render(
      <ConfirmModalProvider>
        <Trigger label="center-anchor" />
      </ConfirmModalProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'center-anchor' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveStyle({ left: '160px', top: '428px' })

    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.getByTestId('center-anchor-result')).toHaveTextContent(
        'false',
      ),
    )
  })
})
