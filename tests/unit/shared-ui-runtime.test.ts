import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSwedish, localizedName } from '@/lib/i18n/localized'
import {
  nullableOptionalStatusIconNameSchema,
  statusIconNameSchema,
} from '@/lib/icons/status-icon-schema'
import {
  dispatchGlobalNavigationLayoutEvent,
  GLOBAL_NAVIGATION_LAYOUT_EVENT,
} from '@/lib/navigation-layout-events'
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
import { restoreFocus } from '@/lib/restore-focus'
import {
  getThemeRootStyle,
  THEME_DARK_BACKGROUND,
  THEME_LIGHT_BACKGROUND,
} from '@/lib/theme'

describe('localized shared values', () => {
  it('selects the requested language and falls back through available names', () => {
    expect(isSwedish('sv')).toBe(true)
    expect(isSwedish('en')).toBe(false)
    expect(localizedName(undefined, 'sv')).toBe('')
    expect(localizedName({ nameEn: 'English', nameSv: 'Svenska' }, 'sv')).toBe(
      'Svenska',
    )
    expect(localizedName({ nameEn: 'English', nameSv: null }, 'sv')).toBe(
      'English',
    )
    expect(
      localizedName({ name: 'Generic', nameEn: '', nameSv: '' }, 'en'),
    ).toBe('Generic')
    expect(localizedName({ name: '', nameEn: null, nameSv: null }, null)).toBe(
      '',
    )
  })
})

describe('status icon schema', () => {
  it('accepts installed icon names and optional null values', () => {
    expect(statusIconNameSchema.parse('Wifi')).toBe('Wifi')
    expect(statusIconNameSchema.safeParse('MadeUpIcon').success).toBe(false)
    expect(nullableOptionalStatusIconNameSchema.parse(null)).toBeNull()
    expect(
      nullableOptionalStatusIconNameSchema.parse(undefined),
    ).toBeUndefined()
  })
})

describe('navigation layout event', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('notifies observers in a browser', () => {
    const listener = vi.fn()
    window.addEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, listener)

    dispatchGlobalNavigationLayoutEvent()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, listener)
  })

  it('is safe during server rendering', () => {
    vi.stubGlobal('window', undefined)

    expect(() => dispatchGlobalNavigationLayoutEvent()).not.toThrow()
  })
})

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

describe('theme root style', () => {
  it('provides matching light and dark inline styles', () => {
    expect(getThemeRootStyle('light')).toEqual({
      backgroundColor: THEME_LIGHT_BACKGROUND,
      colorScheme: 'light',
    })
    expect(getThemeRootStyle('dark')).toEqual({
      backgroundColor: THEME_DARK_BACKGROUND,
      colorScheme: 'dark',
    })
  })
})
