import { describe, expect, it } from 'vitest'
import {
  buildDeveloperModeChipLabel,
  buildDeveloperModeCopyText,
  DEVELOPER_MODE_SHORTCUT_CODE,
  DEVELOPER_MODE_SHORTCUT_KEY,
  devMarker,
  matchesDeveloperModeShortcut,
  noopDevMarker,
  normalizeDeveloperModeText,
} from '../src/index'
import {
  devMarker as noopDevMarkerFromNoop,
  noopDevMarker as noopDevMarkerNoOp,
} from '../src/noop'

describe('@viscalyx/developer-mode-core', () => {
  it('exposes the documented shortcut constants', () => {
    expect(DEVELOPER_MODE_SHORTCUT_KEY).toBe('h')
    expect(DEVELOPER_MODE_SHORTCUT_CODE).toBe('KeyH')
  })

  it('builds a marker prop bag using only defined fields', () => {
    expect(devMarker({ name: 'button', value: 'Save' })).toEqual({
      'data-developer-mode-name': 'button',
      'data-developer-mode-value': 'Save',
    })
  })

  it('returns an empty marker for noopDevMarker', () => {
    expect(noopDevMarker()).toEqual({})
  })

  it('normalizes whitespace in label text', () => {
    expect(normalizeDeveloperModeText('  hello  world\n')).toBe('hello world')
    expect(normalizeDeveloperModeText('   ')).toBeUndefined()
  })

  it('formats copy text and chip labels', () => {
    expect(
      buildDeveloperModeCopyText({
        context: 'navigation',
        name: 'link',
        value: 'Home',
      }),
    ).toBe('navigation > link: Home')
    expect(buildDeveloperModeChipLabel({ name: 'button', value: 'Save' })).toBe(
      'button: Save',
    )
  })

  it('matches the documented shortcut and ignores unrelated keys', () => {
    expect(
      matchesDeveloperModeShortcut({
        altKey: true,
        ctrlKey: true,
        shiftKey: true,
        metaKey: false,
        code: 'KeyH',
        key: 'h',
      }),
    ).toBe(true)
    expect(
      matchesDeveloperModeShortcut({
        altKey: false,
        ctrlKey: true,
        shiftKey: true,
        metaKey: false,
        code: 'KeyH',
        key: 'h',
      }),
    ).toBe(false)
  })

  it('exposes a no-op subpath that returns empty markers', () => {
    expect(noopDevMarkerFromNoop({ name: 'button' })).toEqual({})
    expect(noopDevMarkerNoOp()).toEqual({})
  })
})
