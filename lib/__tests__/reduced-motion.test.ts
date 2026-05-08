import { describe, expect, it } from 'vitest'
import {
  collapsiblePanelMotion,
  dialogPanelMotion,
  drawerPanelMotion,
  fadeMotion,
  offsetPanelMotion,
  repeatingScrollCueMotion,
  scrollCueMotion,
} from '@/lib/reduced-motion'

describe('reduced-motion helpers', () => {
  it('keeps standard fade transitions when motion is allowed', () => {
    expect(fadeMotion(false, { duration: 0.2 })).toEqual({
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      initial: { opacity: 0 },
      transition: { duration: 0.2 },
    })
  })

  it('collapses fades to an instant final state when reduced motion is requested', () => {
    expect(fadeMotion(true, { duration: 0.2 })).toEqual({
      animate: { opacity: 1 },
      initial: false,
      transition: { duration: 0 },
    })
  })

  it('removes scale movement from reduced dialog panels', () => {
    expect(dialogPanelMotion(false)).toMatchObject({
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
      initial: { opacity: 0, scale: 0.95 },
    })

    expect(dialogPanelMotion(true)).toEqual({
      animate: { opacity: 1 },
      initial: false,
      transition: { duration: 0 },
    })
  })

  it('removes positional offsets from reduced panels and popovers', () => {
    expect(offsetPanelMotion(false, { offset: -4 })).toMatchObject({
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
      initial: { opacity: 0, y: -4 },
    })

    expect(offsetPanelMotion(true, { offset: -4 })).toEqual({
      animate: { opacity: 1 },
      initial: false,
      transition: { duration: 0 },
    })
  })

  it('skips drawer slide and collapsible height animation in reduced mode', () => {
    expect(drawerPanelMotion(false)).toMatchObject({
      animate: { x: 0 },
      exit: { x: '100%' },
      initial: { x: '100%' },
    })
    expect(drawerPanelMotion(true)).toEqual({
      initial: false,
      transition: { duration: 0 },
    })

    expect(collapsiblePanelMotion(false)).toMatchObject({
      animate: { height: 'auto', opacity: 1 },
      exit: { height: 0, opacity: 0 },
      initial: { height: 0, opacity: 0 },
    })
    expect(collapsiblePanelMotion(true)).toEqual({
      animate: { opacity: 1 },
      initial: false,
      transition: { duration: 0 },
    })
  })

  it('turns the repeating scroll cue into a static indicator', () => {
    expect(scrollCueMotion(true)).toEqual({
      animate: { opacity: 1 },
      initial: false,
      transition: { duration: 0 },
    })
    expect(repeatingScrollCueMotion(false)).toMatchObject({
      animate: { y: [0, 3, 0] },
      transition: {
        repeat: Number.POSITIVE_INFINITY,
      },
    })
    expect(repeatingScrollCueMotion(true)).toEqual({})
  })
})
