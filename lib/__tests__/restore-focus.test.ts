import { describe, expect, it, vi } from 'vitest'
import { restoreFocus } from '@/lib/restore-focus'

describe('restoreFocus', () => {
  it('focuses a connected target in a microtask', async () => {
    const current = document.createElement('button')
    const target = document.createElement('button')
    document.body.append(current, target)
    current.focus()

    restoreFocus(target)

    expect(document.activeElement).toBe(current)
    await Promise.resolve()
    expect(document.activeElement).toBe(target)

    current.remove()
    target.remove()
  })

  it('ignores missing and disconnected targets', async () => {
    const target = document.createElement('button')
    const focus = vi.spyOn(target, 'focus')

    restoreFocus(null)
    restoreFocus(target)
    await Promise.resolve()

    expect(focus).not.toHaveBeenCalled()
  })
})
