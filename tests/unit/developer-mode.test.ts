import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildDeveloperModeCopyText,
  matchesDeveloperModeShortcut,
  scanVisibleDeveloperModeTargets,
} from '@/lib/developer-mode'

function mockRect(
  element: HTMLElement,
  {
    height = 32,
    left,
    top,
    width = 140,
  }: {
    height?: number
    left: number
    top: number
    width?: number
  },
) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      toJSON: () => null,
      top,
      width,
      x: left,
      y: top,
    }),
  })
}

describe('developer mode utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 900,
    })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1280,
    })
  })

  it('builds deterministic contextual copy strings', () => {
    expect(
      buildDeveloperModeCopyText({
        context: 'requirements table',
        name: 'column header',
        value: 'requirement id',
      }),
    ).toBe('requirements table > column header: requirement id')
    expect(
      buildDeveloperModeCopyText({
        context: 'requirements table',
        name: 'table space',
      }),
    ).toBe('requirements table > table space')
    expect(
      buildDeveloperModeCopyText({ name: 'floating pill', value: 'columns' }),
    ).toBe('floating pill: columns')
    expect(buildDeveloperModeCopyText({ name: 'dialog' })).toBe('dialog')
  })

  it('matches the shortcut from the physical H key even when Option changes the character on macOS', () => {
    expect(
      matchesDeveloperModeShortcut({
        altKey: true,
        code: 'KeyH',
        ctrlKey: false,
        key: 'Ó',
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe(true)

    expect(
      matchesDeveloperModeShortcut({
        altKey: true,
        code: 'KeyJ',
        ctrlKey: false,
        key: 'Ó',
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe(false)
  })

  it('scans visible explicit and fallback targets while ignoring hidden or offscreen nodes', () => {
    document.body.innerHTML = `
      <div data-developer-mode-name="requirements table" id="table"></div>
      <div data-developer-mode-name="dialog" hidden id="hidden"></div>
      <button aria-label="Columns" id="columns-button" type="button"></button>
      <button aria-label="Settings" id="offscreen" type="button"></button>
      <button aria-label="Terminology" id="tab" role="tab" type="button"></button>
    `

    mockRect(document.getElementById('table') as HTMLElement, {
      left: 40,
      top: 80,
      width: 420,
    })
    mockRect(document.getElementById('hidden') as HTMLElement, {
      left: 40,
      top: 160,
      width: 220,
    })
    mockRect(document.getElementById('columns-button') as HTMLElement, {
      left: 520,
      top: 80,
      width: 44,
    })
    mockRect(document.getElementById('offscreen') as HTMLElement, {
      left: 40,
      top: 1100,
      width: 44,
    })
    mockRect(document.getElementById('tab') as HTMLElement, {
      left: 620,
      top: 80,
      width: 120,
    })

    const targets = scanVisibleDeveloperModeTargets(
      document.body as unknown as ParentNode,
    )
    const payloads = targets.map(target => target.payload)

    expect(payloads).toContain('requirements table')
    expect(payloads).toContain('button: Columns')
    expect(payloads).toContain('edge tab: Terminology')
    expect(payloads).not.toContain('dialog')
    expect(payloads).not.toContain('button: Settings')
  })
})
