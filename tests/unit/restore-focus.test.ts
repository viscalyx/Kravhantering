import { describe, expect, it, vi } from 'vitest'
import { restoreFocus } from '@/lib/restore-focus'

describe('focus restoration', () => {
  it('restores focus to a connected target on the microtask queue', async () => {
    const target = document.createElement('button')
    document.body.append(target)

    restoreFocus(target)
    expect(target).not.toHaveFocus()
    await Promise.resolve()

    expect(target).toHaveFocus()
    target.remove()
  })

  it('ignores absent and detached targets', async () => {
    const detached = document.createElement('button')
    const focus = vi.spyOn(detached, 'focus')

    restoreFocus(detached)
    restoreFocus(null)
    await Promise.resolve()

    expect(focus).not.toHaveBeenCalled()
  })
})
