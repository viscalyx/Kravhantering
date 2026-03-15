import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildDeveloperModeChipLabel,
  buildDeveloperModeCopyText,
  findDeveloperModeTargetAt,
  getRequirementColumnDeveloperModeLabel,
  isEditableTarget,
  matchesDeveloperModeShortcut,
  normalizeDeveloperModeText,
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
    vi.clearAllMocks()
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

  describe('normalizeDeveloperModeText', () => {
    it('returns undefined for null/undefined/empty/whitespace', () => {
      expect(normalizeDeveloperModeText(null)).toBeUndefined()
      expect(normalizeDeveloperModeText(undefined)).toBeUndefined()
      expect(normalizeDeveloperModeText('')).toBeUndefined()
      expect(normalizeDeveloperModeText('   ')).toBeUndefined()
    })

    it('collapses whitespace', () => {
      expect(normalizeDeveloperModeText('  hello   world  ')).toBe(
        'hello world',
      )
    })
  })

  describe('buildDeveloperModeChipLabel', () => {
    it('returns name only when no value', () => {
      expect(buildDeveloperModeChipLabel({ name: 'tab' })).toBe('tab')
    })

    it('returns name: value', () => {
      expect(
        buildDeveloperModeChipLabel({ name: 'tab', value: 'Details' }),
      ).toBe('tab: Details')
    })
  })

  describe('getRequirementColumnDeveloperModeLabel', () => {
    it('returns known label', () => {
      expect(getRequirementColumnDeveloperModeLabel('area')).toBe('area')
      expect(getRequirementColumnDeveloperModeLabel('uniqueId')).toBe(
        'requirement id',
      )
      expect(
        getRequirementColumnDeveloperModeLabel('qualityCharacteristic'),
      ).toBe('quality characteristic')
    })

    it('humanizes unknown column id', () => {
      expect(getRequirementColumnDeveloperModeLabel('somethingElse')).toBe(
        'something else',
      )
    })
  })

  describe('isEditableTarget', () => {
    it('returns false for null', () => {
      expect(isEditableTarget(null)).toBe(false)
    })

    it('returns false for non-HTMLElement', () => {
      expect(isEditableTarget(document.createTextNode('x'))).toBe(false)
    })

    it('returns true for contentEditable element inside closest check', () => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('contenteditable', 'true')
      const child = document.createElement('span')
      wrapper.appendChild(child)
      expect(isEditableTarget(child)).toBe(true)
    })

    it('returns true for input', () => {
      const input = document.createElement('input')
      expect(isEditableTarget(input)).toBe(true)
    })

    it('returns true for textarea', () => {
      expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    })

    it('returns false for plain div', () => {
      expect(isEditableTarget(document.createElement('div'))).toBe(false)
    })
  })

  describe('findDeveloperModeTargetAt', () => {
    it('returns null for overlay root descendant', () => {
      const root = document.createElement('div')
      root.setAttribute('data-developer-mode-overlay-root', 'true')
      const child = document.createElement('button')
      root.appendChild(child)
      document.body.appendChild(root)

      expect(findDeveloperModeTargetAt(child)).toBeNull()
    })

    it('returns target for visible dev-mode-name element', () => {
      const el = document.createElement('div')
      el.setAttribute('data-developer-mode-name', 'test-surface')
      document.body.appendChild(el)
      mockRect(el, { left: 10, top: 10 })

      const result = findDeveloperModeTargetAt(el)
      expect(result).not.toBeNull()
      expect(result?.name).toBe('test-surface')
    })

    it('returns null when all ancestors have zero bounds', () => {
      const el = document.createElement('span')
      document.body.appendChild(el)
      // default jsdom getBoundingClientRect returns zeros
      expect(findDeveloperModeTargetAt(el)).toBeNull()
    })
  })

  describe('scan known hook descriptors', () => {
    it('detects floating-action-rail', () => {
      const el = document.createElement('div')
      el.setAttribute('data-floating-action-rail', '')
      document.body.appendChild(el)
      mockRect(el, { left: 10, top: 10 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      expect(targets.some(t => t.name === 'floating action rail')).toBe(true)
    })

    it('detects floating-action-item with label', () => {
      const el = document.createElement('button')
      el.setAttribute('data-floating-action-item', '')
      el.setAttribute('aria-label', 'Columns')
      document.body.appendChild(el)
      mockRect(el, { left: 100, top: 10 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const pill = targets.find(t => t.name === 'floating pill')
      expect(pill).toBeDefined()
      expect(pill?.value).toBe('Columns')
    })

    it('detects column-picker-popover', () => {
      const el = document.createElement('div')
      el.setAttribute('data-column-picker-popover', '')
      document.body.appendChild(el)
      mockRect(el, { left: 10, top: 50 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      expect(targets.some(t => t.name === 'column picker')).toBe(true)
    })

    it('detects requirements-scroll-container', () => {
      const el = document.createElement('div')
      el.setAttribute('data-requirements-scroll-container', '')
      document.body.appendChild(el)
      mockRect(el, { left: 10, top: 200 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      expect(targets.some(t => t.name === 'table space')).toBe(true)
    })

    it('detects requirement header control', () => {
      const el = document.createElement('div')
      el.setAttribute('data-requirement-header-control', 'area')
      document.body.appendChild(el)
      mockRect(el, { left: 300, top: 10 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const header = targets.find(t => t.name === 'column header')
      expect(header).toBeDefined()
      expect(header?.value).toBe('area')
    })

    it('detects expanded-detail-cell', () => {
      const el = document.createElement('div')
      el.setAttribute('data-expanded-detail-cell', '')
      document.body.appendChild(el)
      mockRect(el, { left: 10, top: 300 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      expect(targets.some(t => t.name === 'inline detail pane')).toBe(true)
    })
  })

  describe('scan role-based descriptors', () => {
    it('detects dialog with heading', () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'dialog')
      const h2 = document.createElement('h2')
      h2.textContent = 'Confirm Delete'
      el.appendChild(h2)
      document.body.appendChild(el)
      mockRect(el, { left: 200, top: 200, width: 400, height: 300 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const dialog = targets.find(t => t.name === 'dialog')
      expect(dialog).toBeDefined()
      expect(dialog?.value).toBe('Confirm Delete')
    })

    it('detects navigation with aria-label', () => {
      const nav = document.createElement('div')
      nav.setAttribute('role', 'navigation')
      nav.setAttribute('aria-label', 'Main menu')
      document.body.appendChild(nav)
      mockRect(nav, { left: 0, top: 0, width: 1280, height: 50 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const navTarget = targets.find(t => t.name === 'navigation')
      expect(navTarget).toBeDefined()
      expect(navTarget?.value).toBe('Main menu')
    })
  })

  describe('scan label-based descriptors', () => {
    it('detects button with aria-label', () => {
      const btn = document.createElement('button')
      btn.setAttribute('aria-label', 'Close')
      document.body.appendChild(btn)
      mockRect(btn, { left: 400, top: 10 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(
        t => t.name === 'button' && t.value === 'Close',
      )
      expect(target).toBeDefined()
    })

    it('detects link with aria-label', () => {
      const a = document.createElement('a')
      a.setAttribute('href', '/home')
      a.setAttribute('aria-label', 'Go home')
      document.body.appendChild(a)
      mockRect(a, { left: 500, top: 10 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(
        t => t.name === 'link' && t.value === 'Go home',
      )
      expect(target).toBeDefined()
    })
  })

  describe('scan generic descriptors', () => {
    it('detects select as combobox', () => {
      const select = document.createElement('select')
      select.setAttribute('name', 'priority')
      document.body.appendChild(select)
      mockRect(select as unknown as HTMLElement, { left: 10, top: 500 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(t => t.name === 'combobox')
      expect(target).toBeDefined()
      expect(target?.value).toBe('priority')
    })

    it('detects nav element', () => {
      const nav = document.createElement('nav')
      nav.setAttribute('aria-label', 'Breadcrumb')
      document.body.appendChild(nav)
      mockRect(nav, { left: 10, top: 600 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(t => t.value === 'Breadcrumb')
      expect(target).toBeDefined()
    })

    it('detects table element', () => {
      const table = document.createElement('table')
      document.body.appendChild(table)
      mockRect(table, { left: 10, top: 700 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      expect(targets.some(t => t.name === 'table')).toBe(true)
    })

    it('detects li element', () => {
      const li = document.createElement('li')
      li.textContent = 'Item 1'
      document.body.appendChild(li)
      mockRect(li, { left: 10, top: 400 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(t => t.name === 'list item')
      expect(target).toBeDefined()
    })

    it('detects text field input', () => {
      const input = document.createElement('input')
      input.setAttribute('type', 'text')
      input.setAttribute('placeholder', 'Search...')
      document.body.appendChild(input)
      mockRect(input, { left: 200, top: 400 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(t => t.name === 'text field')
      expect(target).toBeDefined()
      expect(target?.value).toBe('Search...')
    })

    it('detects non-text input type', () => {
      const input = document.createElement('input')
      input.setAttribute('type', 'checkbox')
      input.setAttribute('name', 'agree')
      document.body.appendChild(input)
      mockRect(input, { left: 300, top: 400 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(t => t.name === 'checkbox')
      expect(target).toBeDefined()
    })

    it('detects textarea as text field', () => {
      const textarea = document.createElement('textarea')
      textarea.setAttribute('placeholder', 'Description')
      document.body.appendChild(textarea)
      mockRect(textarea, { left: 400, top: 400 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(
        t => t.name === 'text field' && t.value === 'Description',
      )
      expect(target).toBeDefined()
    })
  })

  describe('scan test-id descriptors', () => {
    it('detects data-testid element (only when no higher priority match)', () => {
      const div = document.createElement('div')
      div.setAttribute('data-testid', 'my-widget')
      document.body.appendChild(div)
      mockRect(div, { left: 600, top: 600 })

      // div doesn't match higher priority selectors, so testid fires
      // But div must match FALLBACK_SELECTOR which includes [data-testid]
      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const target = targets.find(t => t.name === 'test target')
      expect(target).toBeDefined()
      expect(target?.value).toBe('my-widget')
    })
  })

  describe('deduplication / shouldSkipCandidate', () => {
    it('removes near-duplicate targets with same payload', () => {
      const b1 = document.createElement('button')
      b1.setAttribute('aria-label', 'Save')
      document.body.appendChild(b1)
      mockRect(b1, { left: 10, top: 10 })

      const b2 = document.createElement('button')
      b2.setAttribute('aria-label', 'Save')
      document.body.appendChild(b2)
      mockRect(b2, { left: 12, top: 12 })

      const targets = scanVisibleDeveloperModeTargets(
        document.body as unknown as ParentNode,
      )
      const saveTargets = targets.filter(
        t => t.name === 'button' && t.value === 'Save',
      )
      expect(saveTargets.length).toBe(1)
    })
  })
})
