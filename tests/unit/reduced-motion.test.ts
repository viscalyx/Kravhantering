import { describe, expect, it } from 'vitest'
import {
  collapsiblePanelMotion,
  dialogPanelMotion,
  drawerPanelMotion,
  fadeMotion,
  offsetPanelMotion,
  repeatingScrollCueMotion,
  scrollCueMotion,
  shouldReduceMotion,
} from '@/lib/reduced-motion'

describe('reduced motion contracts', () => {
  it('uses instant, opacity-only variants for reduced motion', () => {
    expect(shouldReduceMotion(true)).toBe(true)
    expect(shouldReduceMotion(false)).toBe(false)
    expect(shouldReduceMotion(null)).toBe(false)

    for (const motion of [
      fadeMotion(true),
      dialogPanelMotion(true),
      offsetPanelMotion(true),
      collapsiblePanelMotion(true),
      scrollCueMotion(true),
    ]) {
      expect(motion).toMatchObject({
        initial: false,
        transition: { duration: 0 },
      })
    }
    expect(drawerPanelMotion(true)).toEqual({
      initial: false,
      transition: { duration: 0 },
    })
    expect(repeatingScrollCueMotion(true)).toEqual({})
  })

  it('preserves configured movement for ordinary animation', () => {
    expect(fadeMotion(false, { duration: 1 })).toMatchObject({
      exit: { opacity: 0 },
      transition: { duration: 1 },
    })
    expect(
      dialogPanelMotion(false, {
        hiddenScale: 0.8,
        transition: { type: 'spring' },
      }),
    ).toMatchObject({
      exit: { opacity: 0, scale: 0.8 },
      transition: { type: 'spring' },
    })
    expect(
      offsetPanelMotion(false, { exitOffset: -4, offset: 12 }),
    ).toMatchObject({
      exit: { opacity: 0, y: -4 },
      initial: { opacity: 0, y: 12 },
    })
    expect(drawerPanelMotion(false, { duration: 2 })).toMatchObject({
      animate: { x: 0 },
      transition: { duration: 2 },
    })
    expect(collapsiblePanelMotion(false, { duration: 0.4 })).toMatchObject({
      animate: { height: 'auto', opacity: 1 },
      transition: { duration: 0.4 },
    })
    expect(scrollCueMotion(false)).toMatchObject({
      exit: { opacity: 0, y: 6 },
    })
    expect(repeatingScrollCueMotion(false)).toMatchObject({
      animate: { y: [0, 3, 0] },
      transition: { repeat: Number.POSITIVE_INFINITY },
    })
  })
})
