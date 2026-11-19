import type { Locator, Page, TestInfo } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectPaintedFocus } from '@/tests/support/keyboard-focus'

vi.mock('@playwright/test', () => ({
  expect: vi.fn((actual: unknown, message?: string) => ({
    toBeFocused: vi.fn(),
    toHaveCSS: vi.fn(),
    toBe: vi.fn(),
    toBeGreaterThanOrEqual: (minimum: number) =>
      expect(actual, message).toBeGreaterThanOrEqual(minimum),
  })),
}))

const screenshotWidth = 100
const screenshotHeight = 80

function screenshotFixture(x: number, y: number, rightOutlineGray = 255) {
  const box = { x, y, width: 20, height: 20 }
  type ScreenshotData = { data: string; box: typeof box }
  vi.stubGlobal(
    'Image',
    class {
      width = screenshotWidth
      height = screenshotHeight
      decode = vi.fn().mockResolvedValue(undefined)
    },
  )
  const getImageData = vi.fn((pixelX: number, pixelY: number) => {
    if (
      pixelX < 0 ||
      pixelX >= screenshotWidth ||
      pixelY < 0 ||
      pixelY >= screenshotHeight
    ) {
      return { data: [0, 0, 0, 0] }
    }
    if (pixelX === Math.floor(x + 24) && pixelY === Math.floor(y + 10)) {
      return {
        data: [rightOutlineGray, rightOutlineGray, rightOutlineGray, 255],
      }
    }
    const onOutline =
      (pixelX === Math.floor(x + 10) &&
        [Math.floor(y - 4), Math.floor(y + 24)].includes(pixelY)) ||
      (pixelY === Math.floor(y + 10) && pixelX === Math.floor(x - 4))
    return { data: onOutline ? [255, 255, 255, 255] : [0, 0, 0, 255] }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData,
  } as unknown as CanvasRenderingContext2D)

  const page = {
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fixture')),
    evaluate: async (
      callback: (args: ScreenshotData) => unknown,
      args: ScreenshotData,
    ) => callback(args),
  } as unknown as Page
  const target = {
    evaluate: vi.fn().mockResolvedValue(true),
    scrollIntoViewIfNeeded: vi.fn(),
    boundingBox: vi.fn().mockResolvedValue(box),
  } as unknown as Locator
  const attach = vi.fn()
  const testInfo = { attach } as unknown as TestInfo

  return {
    attach,
    getImageData,
    check: () => expectPaintedFocus(page, target, testInfo, 'focus'),
  }
}

describe('painted focus screenshot bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    { x: 4.5, y: 30 },
    { x: 75.5, y: 30 },
    { x: 30, y: 4.5 },
    { x: 30, y: 55.5 },
  ])(
    'rejects a clipped outline with its sample still in bounds at ($x, $y)',
    async ({ x, y }) => {
      const { check, getImageData } = screenshotFixture(x, y)

      await expect(check()).rejects.toThrow('Focus outline extends outside')
      expect(getImageData).not.toHaveBeenCalled()
    },
  )

  it.each([
    { x: 6, y: 30 },
    { x: 73, y: 30 },
    { x: 30, y: 6 },
    { x: 30, y: 53 },
  ])(
    'rejects a background sample outside the screenshot at ($x, $y)',
    async ({ x, y }) => {
      const { check, attach, getImageData } = screenshotFixture(x, y)

      await expect(check()).rejects.toThrow('Focus contrast sample')
      expect(attach).not.toHaveBeenCalled()
      for (const [pixelX, pixelY] of getImageData.mock.calls) {
        expect(pixelX).toBeGreaterThanOrEqual(0)
        expect(pixelX).toBeLessThan(screenshotWidth)
        expect(pixelY).toBeGreaterThanOrEqual(0)
        expect(pixelY).toBeLessThan(screenshotHeight)
      }
    },
  )

  it('rejects an in-bounds right outline below 3:1 contrast', async () => {
    const { check } = screenshotFixture(30, 30, 88)

    await expect(check()).rejects.toThrow('focus right: adjacent contrast')
  })

  it('records contrast when all sample pixels are inside the screenshot', async () => {
    const { check, attach } = screenshotFixture(7, 52)

    await check()

    expect(attach).toHaveBeenCalledWith('focus-contrast', {
      body: JSON.stringify(
        ['top', 'bottom', 'left', 'right'].map(name => ({
          name,
          outline: [255, 255, 255],
          background: [0, 0, 0],
          contrast: 21,
        })),
        null,
        2,
      ),
      contentType: 'application/json',
    })
  })
})
