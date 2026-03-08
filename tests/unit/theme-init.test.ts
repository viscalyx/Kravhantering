import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const scriptPath = path.resolve(__dirname, '../../public/scripts/theme-init.js')
const scriptContent = fs.readFileSync(scriptPath, 'utf-8')

function runScript() {
  // biome-ignore lint/security/noGlobalEval: test helper executing static script
  eval(scriptContent)
}

describe('theme-init.js', () => {
  let getItemSpy: ReturnType<typeof vi.fn>
  let matchMediaSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('data-theme')

    getItemSpy = vi.fn().mockReturnValue(null)
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: getItemSpy },
      writable: true,
    })

    matchMediaSpy = vi.fn().mockReturnValue({ matches: false })
    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaSpy,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds .dark class when theme is "dark"', () => {
    getItemSpy.mockImplementation((key: string) =>
      key === 'theme' ? 'dark' : null,
    )

    runScript()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('adds .dark class when no theme and OS prefers dark', () => {
    getItemSpy.mockReturnValue(null)
    matchMediaSpy.mockReturnValue({ matches: true })

    runScript()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it('does not add .dark class when theme is "light"', () => {
    getItemSpy.mockImplementation((key: string) =>
      key === 'theme' ? 'light' : null,
    )

    runScript()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('does not add .dark class when no theme and OS prefers light', () => {
    getItemSpy.mockReturnValue(null)
    matchMediaSpy.mockReturnValue({ matches: false })

    runScript()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('sets data-theme when colorTheme is stored', () => {
    getItemSpy.mockImplementation((key: string) =>
      key === 'colorTheme' ? 'navy' : null,
    )

    runScript()

    expect(document.documentElement.getAttribute('data-theme')).toBe('navy')
  })

  it('does not set data-theme when colorTheme is absent', () => {
    getItemSpy.mockReturnValue(null)

    runScript()

    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('applies both dark class and color theme together', () => {
    getItemSpy.mockImplementation((key: string) => {
      if (key === 'theme') return 'dark'
      if (key === 'colorTheme') return 'sunset'
      return null
    })

    runScript()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('sunset')
  })

  it('does not throw when localStorage throws', () => {
    getItemSpy.mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => runScript()).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
