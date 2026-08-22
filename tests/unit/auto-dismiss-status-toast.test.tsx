import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AutoDismissStatusToast, {
  STATUS_TOAST_DURATION_MS,
} from '@/components/AutoDismissStatusToast'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `common.${key}`,
}))

afterEach(() => vi.useRealTimers())

describe('AutoDismissStatusToast', () => {
  it('announces information and can be dismissed immediately', () => {
    const onDismiss = vi.fn()
    render(
      <AutoDismissStatusToast
        message="The draft was saved."
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('The draft was saved.')
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-developer-mode-name',
      'Timed status toast',
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses informational feedback automatically after five seconds', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <AutoDismissStatusToast
        message="The draft was saved."
        onDismiss={onDismiss}
      />,
    )

    act(() => vi.advanceTimersByTime(STATUS_TOAST_DURATION_MS - 1))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('uses warning semantics for a completed action with a negative result', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <AutoDismissStatusToast
        details={[
          'AI analysis was not observed.',
          'AI analysis was not observed.',
        ]}
        message="The verification did not pass."
        onDismiss={onDismiss}
        tone="warning"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'The verification did not pass.',
    )
    expect(screen.getAllByText('AI analysis was not observed.')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveClass('border-amber-200')
    act(() => vi.advanceTimersByTime(STATUS_TOAST_DURATION_MS * 2))
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
